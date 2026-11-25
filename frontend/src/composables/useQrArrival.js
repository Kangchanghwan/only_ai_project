/**
 * QR을 찍고 들어온 쪽(휴대폰): 같은 네트워크인지 판정하고, 다른 네트워크면 QR 증명을 붙인 기존 연결 요청을 저절로 보낸다.
 * - 판정: 내 소켓이 들어 있는 첫 같은 네트워크 목록에 QR의 PC(소켓 ID 또는 이름표 키)가 있으면 같은 네트워크. 아무것도 하지 않는다.
 * - 방 탭 QR(꼬리표 r): 내가 가진 방 중 꼬리표가 맞는 방이 있으면 네트워크와 상관없이 그 방을 연다 (가장 먼저 본다).
 * - 다른 네트워크: 이미 같은 방이면 그 방으로 이동, 아니면 PC를 '다른 네트워크 기기' 맨 위에 두고 연결 요청.
 * - 결과는 qr_code_fallback {result}로 QR 도착 세션당 1회만 기록한다. 비밀·소켓 ID·키는 기록하지 않는다.
 */
import { ref } from 'vue'
import { presenceKey } from '../utils/roomPresence.js'
import { identityFromKey, roomTag, sameString } from '../utils/qrLink.js'
import { inviteErrorText } from './usePairFlow.js'

export const QR_FALLBACK_FLAG = 'cs_qr_fallback_sent'
export const QR_ROSTER_TIMEOUT_MS = 5000

/** 연결 세션 종료 사유 → 측정 값 */
export function resultOfReason(reason) {
  if (reason === 'qr-expired' || reason === 'qr-invalid') return 'expired'
  if (reason === 'qr-busy') return 'busy'
  if (reason === 'declined') return 'declined'
  if (reason === 'expired') return 'timeout'
  return 'error'
}

/**
 * @param {{
 *   getIpDevices: () => object[], getGlobalDevices: () => object[],
 *   getMySocketId: () => string|null, getMyKey?: () => string|null,
 *   getPairStates?: () => object, getSessions?: () => object[],
 *   getRoomIds?: () => Promise<string[]>|string[],
 *   invite: (device: object, opts: object) => Promise<{ok: boolean, sessionId?: string, code?: string}>,
 *   openRoom?: (roomId: string) => void,
 *   notify?: { showError: Function }, t?: Function, track?: Function,
 *   session?: () => Storage|null, setTimer?: Function, clearTimer?: Function
 * }} deps
 */
export function useQrArrival({
  getIpDevices, getGlobalDevices, getMySocketId, getMyKey = () => null,
  getPairStates = () => ({}), getSessions = () => [], getRoomIds = () => [], invite, openRoom = () => {},
  notify = { showError: () => {} }, t = (k) => k, track = () => {},
  session = () => { try { return window.sessionStorage } catch { return null } },
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  /** QR로 찾은 PC (화면의 '다른 네트워크 기기' 맨 위) */
  const pinned = ref(null)
  let link = null
  let phase = 'idle' // idle | roster | inviting | result | done
  let sessionId = null
  let timer = null
  let sentInMemory = false

  function record(result) {
    if (sentInMemory) return
    sentInMemory = true
    try {
      const st = session()
      if (st?.getItem(QR_FALLBACK_FLAG)) return
      st?.setItem(QR_FALLBACK_FLAG, '1')
    } catch { /* 이 페이지 로드 동안 1회로 지킨다 */ }
    try { track('qr_code_fallback', { result }) } catch { /* 측정 실패 무시 */ }
  }

  function finish(result) {
    phase = 'done'
    link = null // 비밀은 더 들고 있지 않는다
    if (timer) { clearTimer(timer); timer = null }
    if (result) record(result)
  }

  /** QR로 들어왔는데 # 뒤가 없었다 (스캐너 앱이 버림) */
  function markNoHash() {
    if (phase === 'idle') { phase = 'done'; record('no_hash') }
  }

  /** 꼬리표가 맞는 내 방 ID (없으면 null) */
  async function findTaggedRoom(x, r) {
    let ids = []
    try { ids = (await getRoomIds()) || [] } catch { return null }
    for (const id of ids) {
      try { if (sameString(await roomTag(x, id), r)) return id } catch { /* 다음 방 */ }
    }
    return null
  }

  /** @param {{s: string, k: string|null, g: string, x: Uint8Array, f: string, r?: string|null}} parsed */
  function start(parsed) {
    if (!parsed || (phase !== 'idle' && phase !== 'done')) return
    link = parsed
    phase = 'roster'
    sessionId = null
    timer = setTimer(() => { timer = null; if (phase === 'roster') finish('error') }, QR_ROSTER_TIMEOUT_MS)
    update()
  }

  const matches = (d) => !!d && (d.socketId === link.s || (!!link.k && presenceKey(d) === link.k))

  async function decide() {
    const me = getMySocketId()
    const myKey = getMyKey()
    // 내 QR을 내가 찍었다 (같은 기기, 같은 브라우저의 다른 탭)
    if (link.s === me || (link.k && link.k === myKey)) { finish(null); return }
    if (link.r) {
      const roomId = await findTaggedRoom(link.x, link.r)
      if (roomId) {
        openRoom(roomId)
        try { notify.showSuccess?.(t('roomQr.opened')) } catch { /* 알림 실패 무시 */ }
        finish('room_tag')
        return
      }
    }
    if ((getIpDevices() || []).some(matches)) { finish('same_network'); return }

    const global = getGlobalDevices() || []
    const found = global.find((d) => d?.socketId === link.s) || (link.k ? global.find((d) => presenceKey(d) === link.k) : null)
    const identity = identityFromKey(link.k)
    const target = found || { socketId: link.s, ...(identity ? { identity } : {}) }

    const st = getPairStates()?.[target.socketId]
    if (st?.state === 'paired' && st.roomId) { openRoom(st.roomId); finish('room_ok'); return }

    pinned.value = target
    phase = 'inviting'
    const qr = { g: link.g, x: link.x, f: link.f }
    let res
    try { res = await invite(target, { qr, silent: true }) } catch { res = { ok: false, code: 'FAILED' } }
    if (!res?.ok || !res.sessionId) {
      pinned.value = null
      const code = res?.code
      if (code === 'TARGET_NOT_FOUND') { notify.showError(t('qrLink.notFound')); finish('not_found'); return }
      notify.showError(inviteErrorText(code, t))
      finish(code === 'COOLDOWN' || code === 'BLOCKED' ? 'declined' : 'error')
      return
    }
    sessionId = res.sessionId
    phase = 'result'
    update()
  }

  /** 기기 목록이나 연결 세션이 바뀔 때마다 부른다 */
  function update() {
    if (phase === 'roster') {
      const me = getMySocketId()
      if (!me || !(getIpDevices() || []).some((d) => d?.socketId === me)) return
      phase = 'deciding'
      if (timer) { clearTimer(timer); timer = null }
      decide().catch(() => { pinned.value = null; finish('error') })
      return
    }
    if (phase === 'result') {
      const s = (getSessions() || []).find((x) => x.sessionId === sessionId)
      if (!s) return
      if (s.state === 'done') { pinned.value = null; finish('room_ok') }
      else if (s.state === 'ended') { pinned.value = null; finish(resultOfReason(s.reason)) }
    }
  }

  function destroy() {
    if (timer) clearTimer(timer)
    timer = null
    link = null
    phase = 'done'
  }

  return { pinned, start, update, markNoHash, destroy, get phase() { return phase } }
}
