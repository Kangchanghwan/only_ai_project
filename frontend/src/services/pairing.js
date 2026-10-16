/**
 * 1:1 연결 세션 컨트롤러 (프레임워크 무관). 규격: docs/superpowers/specs/2026-10-15-private-pair-rooms-design.md (v3)
 *
 * v3 흐름: 보내는 쪽이 invite 때 1회용 키(pk)를 같이 보내고, 받는 쪽은 사람 조작 없이 바로 pk를 답해
 *   수락 전에 양쪽이 그림(sas)을 계산한다. 보내는 쪽은 sas가 준비되면 수락 전이라도 confirm(true) 가능,
 *   받는 쪽 수락은 respond(true, {same:true}) 한 번.
 * 옛 흐름(pk 없는 incoming = legacy): 수락(pair:accepted) 뒤에 키를 교환하고 keyed에서 confirm.
 *
 * 상태: inviting(보낸 쪽, 수락 대기. sas 준비 가능) | incoming(받은 쪽, 응답 대기. sas 준비 가능)
 *       | accepted(legacy: 수락됨, 키 교환 중) | keyed(legacy 또는 same 없이 수락: sas 확인 대기)
 *       | waiting-peer-confirm(내가 "같아요" 보냄) | done | ended(reason)
 * 비밀(개인키·kWrap·roomSecret)은 컨트롤러 안에만 두고 스냅샷·로그에 절대 내보내지 않는다.
 */
import { generateEphemeral, deriveSession, newRoomSecret, wrapSecret, unwrapSecret } from '../utils/pairCrypto.js'

export const PAIR_EVENTS = ['pair:incoming', 'pair:accepted', 'pair:signal', 'pair:ended', 'pair:done']

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string' && v.length > 0

/**
 * @param {{
 *   socket: { emit(event: string, payload: object): Promise<object>, on(event: string, fn: Function): void, off(event: string, fn: Function): void },
 *   onPaired?: (info: {roomId: string, peer: object, roomToken: string, roomTokenTtlSec: number, roomSecret: Uint8Array}) => void
 * }} deps
 */
export function createPairing({ socket, onPaired }) {
  /** @type {Map<string, any>} */
  const sessions = new Map()
  const listeners = new Set()

  const snapshot = () =>
    [...sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      role: s.role,
      peer: s.peer,
      sameNetwork: s.sameNetwork,
      state: s.state,
      sas: s.sas ? [...s.sas] : null,
      legacy: !!s.legacy,
      confirmed: !!s.confirmed,
      expiresAt: s.expiresAt ?? null,
      reason: s.reason ?? null
    }))

  const notify = () => {
    const snap = snapshot()
    for (const cb of [...listeners]) {
      try { cb(snap) } catch (e) { console.error('[pairing] listener error:', e?.message || e) }
    }
  }

  const scrub = (s) => { s.priv = null; s.kWrap = null; s.secret = null; s.pendingSecret = null; s.peerPk = null }

  function end(s, reason) {
    if (s.state === 'done' || s.state === 'ended') return
    s.state = 'ended'
    s.reason = reason
    scrub(s)
    notify()
  }

  const make = (sessionId, role, extra = {}) => {
    const s = {
      sessionId, role, peer: null, sameNetwork: null, state: 'idle', sas: null, expiresAt: null, reason: null,
      priv: null, myPk: null, peerPk: null, kWrap: null, secret: null, pendingSecret: null,
      secretSent: false, legacy: false, confirmed: false, acceptedEarly: false, chain: Promise.resolve(), ...extra
    }
    sessions.set(sessionId, s)
    return s
  }

  const signal = (s, data) => socket.emit('pair:signal', { sessionId: s.sessionId, data })

  /** invite 응답(ack)보다 먼저 도착한 신호를 잠깐 보관했다가 세션이 생기면 처리한다 */
  const earlySignals = new Map()
  const EARLY_MAX = 20
  const stashEarly = (p) => {
    const list = earlySignals.get(p.sessionId) || []
    if (list.length < 4) list.push(p.data)
    earlySignals.set(p.sessionId, list)
    if (earlySignals.size > EARLY_MAX) earlySignals.delete(earlySignals.keys().next().value)
  }

  const sendPk = (s) => signal(s, { t: 'pk', v: 1, pk: s.myPk })

  /** 세션별로 비동기 작업을 순서대로 처리한다 */
  const enqueue = (s, fn) => {
    s.chain = s.chain.then(fn).catch((e) => {
      console.warn('[pairing] 세션 처리 실패:', e?.message || e)
      if (s.state !== 'ended' && s.state !== 'done') {
        socket.emit('pair:cancel', { sessionId: s.sessionId }).catch(() => {})
        end(s, 'invalid')
      }
    })
    return s.chain
  }

  async function tryDeriveAndAdvance(s) {
    if (s.kWrap || !s.peerPk || !s.priv) return
    const { kWrap, sas } = await deriveSession({ privateKey: s.priv, myPk: s.myPk, peerPk: s.peerPk, sessionId: s.sessionId })
    if (s.state === 'ended' || s.state === 'done') return
    s.kWrap = kWrap
    s.sas = sas
    if (s.state === 'accepted') s.state = 'keyed'
    if (s.role === 'initiator' && !s.secretSent) {
      s.secret = newRoomSecret()
      const w = await wrapSecret(kWrap, s.secret)
      s.secretSent = true
      await signal(s, { t: 'secret', v: 1, ...w })
    }
    if (s.role === 'responder' && s.pendingSecret) {
      const msg = s.pendingSecret
      s.pendingSecret = null
      s.secret = await unwrapSecret(kWrap, msg)
    }
    notify()
  }

  // === 서버 이벤트 ===
  const handlers = {
    'pair:incoming'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.from) || sessions.has(p.sessionId)) return
      const s = make(p.sessionId, 'responder', { peer: p.from, sameNetwork: !!p.sameNetwork, expiresAt: p.expiresAt ?? null })
      s.state = 'incoming'
      if (isStr(p.pk)) {
        // v3: 사람 조작 없이 바로 내 키를 만들어 답하고 그림을 계산한다
        s.peerPk = p.pk
        notify()
        enqueue(s, async () => {
          const eph = await generateEphemeral()
          s.priv = eph.privateKey
          s.myPk = eph.publicRaw
          await sendPk(s)
          await tryDeriveAndAdvance(s)
        })
      } else {
        s.legacy = true
        notify()
      }
    },

    'pair:accepted'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.peer) || !['initiator', 'responder'].includes(p.role)) return
      let s = sessions.get(p.sessionId)
      if (!s) {
        if (p.role !== 'initiator') return
        s = make(p.sessionId, 'initiator') // invite ack보다 먼저 도착한 경우
        s.state = 'inviting'
      }
      if (s.role !== p.role || s.state === 'ended' || s.state === 'done') return
      if (s.myPk) {
        // v3: 키는 이미 있다. 수락만 기록하고 상태는 그대로 둔다
        s.peer = p.peer
        if (s.state === 'incoming') s.state = s.sas ? 'keyed' : 'accepted' // same 없이 수락한 경우
        else if (s.state === 'inviting' && !s.peerPk) enqueue(s, () => sendPk(s)) // 상대가 옛 흐름이면 pk를 다시 보낸다
        notify()
        return
      }
      if (s.role === 'initiator' && s.state === 'inviting') {
        // invite ack가 아직 처리 전: 키가 붙은 뒤 이어서 처리
        s.peer = p.peer
        s.acceptedEarly = true
        notify()
        return
      }
      if (s.state !== 'incoming' && s.state !== 'idle') return
      // legacy: 수락 뒤에 키 교환
      s.peer = p.peer
      s.state = 'accepted'
      notify()
      enqueue(s, async () => {
        const eph = await generateEphemeral()
        s.priv = eph.privateKey
        s.myPk = eph.publicRaw
        await sendPk(s)
        await tryDeriveAndAdvance(s)
      })
    },

    'pair:signal'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isObj(p.data)) return
      const s = sessions.get(p.sessionId)
      if (!s) { stashEarly(p); return }
      if (s.state === 'ended' || s.state === 'done') return
      const d = p.data
      if (d.t === 'pk' && d.v === 1 && isStr(d.pk)) {
        if (s.peerPk || (s.state !== 'accepted' && s.state !== 'inviting' && s.state !== 'incoming')) return
        s.peerPk = d.pk
        enqueue(s, () => tryDeriveAndAdvance(s))
      } else if (d.t === 'secret' && d.v === 1 && isStr(d.iv) && isStr(d.ct)) {
        if (s.role !== 'responder' || s.secret || s.pendingSecret) return
        enqueue(s, async () => {
          if (s.kWrap) s.secret = await unwrapSecret(s.kWrap, d)
          else s.pendingSecret = { iv: d.iv, ct: d.ct }
        })
      }
      // 그 밖의 형식은 무시
    },

    'pair:ended'(p) {
      if (!isObj(p) || !isStr(p.sessionId)) return
      const s = sessions.get(p.sessionId)
      if (s) end(s, isStr(p.reason) ? p.reason : 'ended')
    },

    'pair:done'(p) {
      if (!isObj(p) || !isStr(p.sessionId) || !isStr(p.roomId)) return
      const s = sessions.get(p.sessionId)
      if (!s) return
      // 앞선 secret 처리(복호화)가 끝난 뒤에 완료 처리한다
      enqueue(s, async () => {
        if (s.state !== 'waiting-peer-confirm' || !s.secret) {
          if (s.state !== 'ended' && s.state !== 'done') end(s, 'invalid')
          return
        }
        const roomSecret = s.secret
        const peer = isObj(p.peer) ? p.peer : s.peer
        s.peer = peer
        s.state = 'done'
        scrub(s)
        notify()
        try {
          onPaired?.({
            roomId: p.roomId, peer, roomToken: p.roomToken, roomTokenTtlSec: p.roomTokenTtlSec,
            ticket: isStr(p.ticket) ? p.ticket : null, roomSecret
          })
        } catch (e) {
          console.error('[pairing] onPaired error:', e?.message || e)
        }
      })
    }
  }

  for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn)

  // === 공개 API ===
  return {
    /** 1회용 키를 먼저 만들어 pk와 함께 초대한다 @returns {Promise<{ok: boolean, sessionId?: string, code?: string}>} */
    async invite(toSocketId) {
      let eph
      try { eph = await generateEphemeral() } catch { return { ok: false, code: 'FAILED' } }
      const ack = await socket.emit('pair:invite', { to: toSocketId, pk: eph.publicRaw })
      if (!ack?.ok || !isStr(ack.sessionId)) return { ok: false, code: ack?.code || 'FAILED' }
      let s = sessions.get(ack.sessionId)
      if (!s) {
        s = make(ack.sessionId, 'initiator')
        s.state = 'inviting'
      }
      s.priv = eph.privateKey
      s.myPk = eph.publicRaw
      s.expiresAt = ack.expiresAt ?? null
      notify()
      // ack보다 먼저 온 상대 pk 처리
      const early = earlySignals.get(ack.sessionId)
      earlySignals.delete(ack.sessionId)
      for (const data of early || []) handlers['pair:signal']({ sessionId: ack.sessionId, data })
      enqueue(s, async () => {
        await tryDeriveAndAdvance(s)
        if (s.acceptedEarly && !s.peerPk) await sendPk(s)
      })
      return { ok: true, sessionId: ack.sessionId }
    },

    async cancel(sessionId) {
      const s = sessions.get(sessionId)
      if (!s || s.state === 'ended' || s.state === 'done') return
      end(s, 'cancelled')
      await socket.emit('pair:cancel', { sessionId }).catch(() => {})
    },

    /**
     * 받은 쪽 수락/거절.
     * - same:true = 수락 + 그림 확인을 한 번에 (그림이 준비된 뒤에만)
     * - reason: 거절할 때 로컬에서 쓸 종료 사유 (예: '달라요' = 'mismatch')
     */
    async respond(sessionId, accept, { block = false, same = false, reason = null } = {}) {
      const s = sessions.get(sessionId)
      if (!s || s.role !== 'responder' || s.state !== 'incoming') return { ok: false, code: 'BAD_STATE' }
      const fast = !!accept && !!same
      if (fast) {
        if (s.legacy || !s.sas) return { ok: false, code: 'NOT_READY' }
        s.state = 'waiting-peer-confirm'
        s.confirmed = true
        notify()
      }
      const ack = await socket.emit('pair:respond', {
        sessionId, accept: !!accept, ...(block ? { block: true } : {}), ...(fast ? { same: true } : {})
      })
      if (!ack?.ok) { end(s, 'failed'); return { ok: false, code: ack?.code || 'FAILED' } }
      if (!accept) end(s, reason || 'declined-by-me')
      return { ok: true }
    },

    /** 그림 확인 결과. 보낸 쪽은 sas가 준비되면 수락 전에도 가능 */
    async confirm(sessionId, same) {
      const s = sessions.get(sessionId)
      if (!s) return { ok: false, code: 'BAD_STATE' }
      const early = s.role === 'initiator' && !s.legacy && s.state === 'inviting'
      if (s.state !== 'keyed' && !early) return { ok: false, code: 'BAD_STATE' }
      if (early && !s.sas) return { ok: false, code: 'NOT_READY' }
      if (same && s.role === 'responder' && !s.secret) return { ok: false, code: 'NO_SECRET' }
      if (same) {
        s.state = 'waiting-peer-confirm'
        s.confirmed = true
        notify()
        await s.chain // secret 전송이 먼저 나가도록
        if (s.state !== 'waiting-peer-confirm') return { ok: false, code: 'BAD_STATE' }
      }
      const ack = await socket.emit('pair:confirm', { sessionId, same: !!same })
      if (!ack?.ok) { end(s, 'failed'); return { ok: false, code: ack?.code || 'FAILED' } }
      if (!same) end(s, 'mismatch')
      return { ok: true }
    },

    /** 끝난 세션을 목록에서 치운다 */
    dismiss(sessionId) {
      const s = sessions.get(sessionId)
      if (s && (s.state === 'ended' || s.state === 'done')) { sessions.delete(sessionId); notify() }
    },

    getSessions: snapshot,

    /** @returns {() => void} 구독 해제 */
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    destroy() {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn)
      for (const s of sessions.values()) scrub(s)
      sessions.clear()
      earlySignals.clear()
      listeners.clear()
    }
  }
}
