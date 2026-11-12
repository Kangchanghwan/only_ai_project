/**
 * 그림 코드 입장 상태 기계 두 개 (프레임워크 무관, 소켓 어댑터 주입).
 * 규격: docs/superpowers/specs/2026-11-12-picture-code-design.md
 *
 * socket 어댑터: { emit(event, payload): Promise<ack>, on(event, fn), off(event, fn) }  (pairing.js와 같은 모양)
 *
 * 메시지(code:signal data, 서버는 해석하지 않음):
 *   A1 {t:'A1', pA}            들어오는 쪽 → 호스트
 *   B1 {t:'B1', pB, cB}        호스트 → 들어오는 쪽 (SPAKE2 점 + 확인 MAC)
 *   A2 {t:'A2', cA}            들어오는 쪽 → 호스트 (확인 MAC)
 *   P  {t:'P', iv, ct}         호스트 → 들어오는 쪽 (AES-GCM 페이로드 {v:1, secret, ticket, name})
 * 비밀(그림 4개, SPAKE2 키, 방 비밀)은 컨트롤러 안에만 두고 로그·분석 이벤트에 넣지 않는다.
 * SPAKE2 모듈(@noble/curves)은 동적 import라 그림 코드를 쓸 때만 내려받는다.
 */
import { ref } from 'vue'
import { b64u, fromB64u } from '../utils/lockCrypto.js'
import { randomCode, routeOf, isValidCode, CODE_LENGTH } from '../utils/pictureCode.js'
import { trackEvent } from '../utils/analytics.js'

const loadSpake2 = () => import('../utils/spake2.js')

/** 호스트가 승인 요청에 응답할 때까지 기다리는 시간 */
export const REQUEST_TIMEOUT_MS = 60 * 1000
const MAX_ROUTE_RETRIES = 12

const isStr = (v) => typeof v === 'string' && v.length > 0

const safe = (fn) => {
  try { return fn() } catch { return undefined }
}

/**
 * 호스트(방에 있는 기기). 코드를 열고 5분마다 새 코드로 바꾸며, 들어오려는 기기를 SPAKE2로 확인한 뒤 승인 요청 큐에 올린다.
 * @param {{
 *   socket: object, roomId: string,
 *   getInviteTicket: () => Promise<string>, getRoomSecret: () => (Uint8Array | Promise<Uint8Array>), roomName: string,
 *   onApproved?: (info: {from: object|null}) => void,
 *   requestTimeoutMs?: number
 * }} deps
 */
export function createCodeHost({ socket, roomId, getInviteTicket, getRoomSecret, roomName, onApproved, requestTimeoutMs = REQUEST_TIMEOUT_MS }) {
  /** 현재 그림 코드 4개 (열려 있지 않으면 null) */
  const code = ref(null)
  /** 코드 만료 시각 (epoch ms) */
  const expiresAt = ref(0)
  /** 맨 앞 승인 요청 { sessionId, from } 또는 null (큐는 하나씩) */
  const pendingRequest = ref(null)
  /** 승인 대기 중인 요청 수 (맨 앞 포함) */
  const requestCount = ref(0)
  /** 'closed' | 'open' | 'error' */
  const status = ref('closed')
  const error = ref(null)

  let running = false
  let renewTimer = null
  let epoch = 0
  /** sessionId → { code, spake, done, timer } */
  const sessions = new Map()
  /** 승인 요청 큐: { sessionId, from } */
  let queue = []

  const syncQueue = () => {
    pendingRequest.value = queue[0] ? { ...queue[0] } : null
    requestCount.value = queue.length
  }

  const dropSession = (sessionId) => {
    const s = sessions.get(sessionId)
    if (s?.timer) clearTimeout(s.timer)
    sessions.delete(sessionId)
    const before = queue.length
    queue = queue.filter((q) => q.sessionId !== sessionId)
    if (queue.length !== before) syncQueue()
  }

  const send = (sessionId, data) => socket.emit('code:signal', { sessionId, data })

  async function openCode() {
    if (!running) return false
    const myEpoch = ++epoch
    for (let i = 0; i < MAX_ROUTE_RETRIES; i++) {
      const next = randomCode()
      const res = await socket.emit('code:open', { roomId, route: routeOf(next) })
      if (!running || myEpoch !== epoch) return false
      if (res?.ok) {
        code.value = next
        expiresAt.value = Number(res.expiresAt) || Date.now() + 300_000
        status.value = 'open'
        error.value = null
        scheduleRenew()
        return true
      }
      if (res?.error !== 'ROUTE_TAKEN') {
        status.value = 'error'
        error.value = res?.error || 'FAILED'
        return false
      }
    }
    status.value = 'error'
    error.value = 'BUSY'
    return false
  }

  function scheduleRenew() {
    if (renewTimer) clearTimeout(renewTimer)
    const wait = Math.max(0, expiresAt.value - Date.now())
    renewTimer = setTimeout(() => {
      renewTimer = null
      trackEvent('code_renew')
      openCode()
    }, wait)
  }

  // === 들어오는 쪽 메시지 처리 ===
  async function onIncoming({ sessionId }) {
    if (!running || !isStr(sessionId) || !code.value) return
    sessions.set(sessionId, { code: [...code.value], spake: null, done: false, timer: null })
  }

  async function onSignal({ sessionId, data }) {
    const s = sessions.get(sessionId)
    if (!s || s.done || !data || typeof data !== 'object') return
    if (data.t === 'A1' && !s.spake) {
      try {
        const m = await loadSpake2()
        const w = await m.derivePassword(s.code, sessionId)
        const b = m.spake2Start({ role: 'B', w })
        const fin = await b.finish(fromB64u(data.pA))
        s.spake = fin
        await send(sessionId, { t: 'B1', pB: b64u(b.message), cB: b64u(fin.confirm) })
      } catch {
        await failSession(sessionId)
      }
    } else if (data.t === 'A2' && s.spake) {
      let ok = false
      try { ok = s.spake.verifyPeer(fromB64u(data.cA)) } catch { ok = false }
      if (!ok) return failSession(sessionId)
      s.done = true
      const res = await socket.emit('code:confirmed', { sessionId })
      if (!res?.ok) return dropSession(sessionId)
    }
  }

  /** 확인 실패: 호스트 화면에는 아무것도 띄우지 않고 서버에 알려 들어오는 쪽 실패로 세게 한다 */
  async function failSession(sessionId) {
    sessions.delete(sessionId)
    await socket.emit('code:fail', { sessionId })
  }

  function onRequest({ sessionId, from }) {
    const s = sessions.get(sessionId)
    if (!s || !s.spake) return
    queue.push({ sessionId, from: from ?? null })
    s.timer = setTimeout(() => {
      // 60초 안에 응답이 없으면 요청을 내리고 상대에게 알린다
      s.timer = null
      dropSession(sessionId)
      socket.emit('code:cancel', { sessionId })
    }, requestTimeoutMs)
    syncQueue()
  }

  function onEnd({ sessionId }) {
    dropSession(sessionId)
  }

  /** 맨 앞 요청에 응답. 승인이면 {secret, ticket, name}을 SPAKE2 키로 암호화해 보낸다 */
  async function decide(accept) {
    const head = queue[0]
    if (!head) return false
    const s = sessions.get(head.sessionId)
    queue = queue.slice(1)
    if (s?.timer) clearTimeout(s.timer)
    syncQueue()
    trackEvent('code_request', { accept: !!accept })
    if (!s || !s.spake) return false
    const sessionId = head.sessionId
    sessions.delete(sessionId)
    if (!accept) {
      await socket.emit('code:decide', { sessionId, accept: false })
      return true
    }
    try {
      const res = await socket.emit('code:decide', { sessionId, accept: true })
      if (!res?.ok) return false
      const ticket = await getInviteTicket()
      const secret = await getRoomSecret()
      const sealed = await s.spake.seal({ v: 1, secret: b64u(secret), ticket, name: roomName })
      await send(sessionId, { t: 'P', ...sealed })
      safe(() => onApproved?.({ from: head.from }))
      return true
    } catch {
      await socket.emit('code:cancel', { sessionId })
      return false
    }
  }

  const onReconnect = () => { if (running) openCode() }

  async function start() {
    if (running) return status.value === 'open'
    running = true
    socket.on('code:incoming', onIncoming)
    socket.on('code:signal', onSignal)
    socket.on('code:request', onRequest)
    socket.on('code:end', onEnd)
    socket.on('connect', onReconnect)
    trackEvent('code_show')
    return openCode()
  }

  /** "새 코드" 버튼: 지금 코드를 새 코드로 바꾼다 */
  async function renew() {
    if (!running) return false
    trackEvent('code_renew')
    return openCode()
  }

  async function close() {
    if (!running) return
    running = false
    epoch++
    if (renewTimer) clearTimeout(renewTimer)
    renewTimer = null
    socket.off('code:incoming', onIncoming)
    socket.off('code:signal', onSignal)
    socket.off('code:request', onRequest)
    socket.off('code:end', onEnd)
    socket.off('connect', onReconnect)
    const open = [...sessions.keys()]
    for (const id of open) dropSession(id)
    queue = []
    syncQueue()
    code.value = null
    expiresAt.value = 0
    status.value = 'closed'
    await Promise.allSettled([...open.map((sessionId) => socket.emit('code:cancel', { sessionId })), socket.emit('code:close', {})])
  }

  return { code, expiresAt, pendingRequest, requestCount, status, error, start, renew, decide, close }
}

/**
 * 들어오는 쪽(새 기기).
 * join(code) 결과: { status: 'joined', payload } | { status: 'wrong'|'declined'|'timeout'|'notFound'|'busy'|'wait'|'cancel', warn?, retryAfterSec? }
 * @param {{ socket: object, timeoutMs?: number }} deps
 */
export function createCodeJoiner({ socket, timeoutMs = REQUEST_TIMEOUT_MS }) {
  /** 'idle' | 'joining' | 'waiting' | 결과 상태 */
  const status = ref('idle')
  const warn = ref(false)
  const retryAfterSec = ref(0)

  let current = null // { cancel }

  const finish = (resolve, res, result) => {
    status.value = res.status
    warn.value = !!res.warn
    retryAfterSec.value = res.retryAfterSec || 0
    if (result !== false) trackEvent('code_join', { result: res.status })
    resolve(res)
  }

  async function join(code) {
    if (current) return { status: 'busy' }
    if (!isValidCode(code) || code.length !== CODE_LENGTH) return { status: 'wrong' }
    status.value = 'joining'
    warn.value = false
    retryAfterSec.value = 0

    return new Promise((resolve) => {
      let sessionId = null
      let startA = null
      let spake = null
      let confirmOk = false
      let settled = false
      let timer = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        socket.off('code:signal', onSignal)
        socket.off('code:end', onEnd)
        current = null
      }
      const done = (res) => {
        if (settled) return
        settled = true
        cleanup()
        finish(resolve, res)
      }

      async function onSignal({ sessionId: sid, data }) {
        if (settled || sid !== sessionId || !data || typeof data !== 'object') return
        try {
          if (data.t === 'B1' && !spake) {
            if (!startA) throw new Error('bad')
            spake = await startA.finish(fromB64u(data.pB))
            if (!spake) throw new Error('bad')
            try { confirmOk = spake.verifyPeer(fromB64u(data.cB)) } catch { confirmOk = false }
            // 확인이 틀려도 cA를 보낸다: 호스트가 확인 실패를 서버에 알려야 틀린 횟수가 세어진다
            await socket.emit('code:signal', { sessionId, data: { t: 'A2', cA: b64u(spake.confirm) } })
            status.value = 'waiting'
            timer = setTimeout(() => {
              socket.emit('code:cancel', { sessionId })
              done({ status: 'timeout' })
            }, timeoutMs)
          } else if (data.t === 'P' && spake && confirmOk) {
            const payload = await spake.open({ iv: data.iv, ct: data.ct })
            if (!payload || payload.v !== 1 || !isStr(payload.secret) || !isStr(payload.ticket)) throw new Error('bad')
            done({ status: 'joined', payload: { secret: payload.secret, ticket: payload.ticket, name: String(payload.name ?? '') } })
          }
        } catch {
          socket.emit('code:cancel', { sessionId })
          done({ status: 'wrong' })
        }
      }

      function onEnd({ sessionId: sid, reason, warn: w, retryAfterSec: r }) {
        if (sid !== sessionId) return
        if (reason === 'wrong') done({ status: 'wrong', warn: !!w, retryAfterSec: r || 0 })
        else if (reason === 'declined') done({ status: 'declined' })
        else done({ status: 'timeout' })
      }

      current = {
        cancel: () => {
          if (settled) return
          if (sessionId) socket.emit('code:cancel', { sessionId })
          done({ status: 'cancel' })
        }
      }

      ;(async () => {
        let res
        try {
          socket.on('code:signal', onSignal)
          socket.on('code:end', onEnd)
          res = await socket.emit('code:join', { route: routeOf(code) })
        } catch {
          return done({ status: 'busy' })
        }
        if (settled) return
        if (!res?.ok) {
          if (res?.error === 'NOT_FOUND') return done({ status: 'notFound', warn: !!res.warn, retryAfterSec: res.retryAfterSec || 0 })
          if (res?.error === 'WAIT') return done({ status: 'wait', retryAfterSec: Number(res.retryAfterSec) || 0 })
          return done({ status: 'busy' })
        }
        sessionId = res.sessionId
        warn.value = !!res.warn
        try {
          const m = await loadSpake2()
          const w = await m.derivePassword(code, sessionId)
          const a = m.spake2Start({ role: 'A', w })
          startA = a
          await socket.emit('code:signal', { sessionId, data: { t: 'A1', pA: b64u(a.message) } })
        } catch {
          done({ status: 'busy' })
        }
      })()
    })
  }

  /** 진행 중인 입장을 취소 */
  const cancel = () => current?.cancel()

  return { status, warn, retryAfterSec, join, cancel }
}
