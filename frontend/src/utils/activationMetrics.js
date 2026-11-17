/**
 * 활성화 측정 (화면 변화 없음). GA4 표준 "이벤트" 보고서에서 이름만으로 읽히도록 이벤트 이름을 나눠 보낸다.
 *  A qr_arrive · B qr_arrive_alone · C connected_any · D alone_leave_fast|mid|long · E from_guide · F return_7d_room|noroom
 * 모든 플래그는 세션(sessionStorage)당 1회. 저장소를 못 쓰면 이 페이지 로드 동안만 메모리로 1회를 보장한다.
 * 어떤 경우에도 예외가 화면에 영향을 주지 않는다. 사용자 내용·방 id·IP·기기 이름은 보내지 않는다.
 */
import { trackEvent } from './analytics'

const K = {
  qr: 'cs_am_qr', // QR로 들어온 세션 (qr_arrive를 보낸 세션)
  aloneSince: 'cs_am_alone_since', // 혼자 상태가 시작된 시각(ms)
  qrAlone: 'cs_am_qr_alone',
  connected: 'cs_am_connected',
  leave: 'cs_am_leave',
  guide: 'cs_am_guide',
  ret: 'cs_am_return',
  peerJoined: 'cs_peer_joined' // ConnectionCard가 쓰는 기존 플래그
}
export const FIRST_SEEN_KEY = 'cs_first_seen'
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** 혼자 있다 떠난 시간 구간: <10초 fast, 10~60초 mid, 60초 초과 long */
export function leaveBucket(ms) {
  const sec = ms / 1000
  if (sec < 10) return 'alone_leave_fast'
  if (sec <= 60) return 'alone_leave_mid'
  return 'alone_leave_long'
}

/** 주소에서 QR 도착인지 (utm_source=qr 그리고 utm_medium=empty_state) */
export function isQrLanding(href) {
  try {
    const p = new URL(href, 'https://x.invalid').searchParams
    return p.get('utm_source') === 'qr' && p.get('utm_medium') === 'empty_state'
  } catch { return false }
}

/** 같은 출처의 /guide/ 아래 페이지에서 온 referrer면 slug(마지막 경로 조각, .html 제외, 최대 80자), 아니면 null */
export function guideSlug(referrer, origin) {
  try {
    if (!referrer || !origin) return null
    const u = new URL(referrer)
    if (u.origin !== origin || !u.pathname.includes('/guide/')) return null
    const last = u.pathname.split('/').filter(Boolean).pop() || ''
    return last.replace(/\.html$/i, '').slice(0, 80)
  } catch { return null }
}

const defaultEnv = () => ({
  track: trackEvent,
  session: () => { try { return window.sessionStorage } catch { return null } },
  local: () => { try { return window.localStorage } catch { return null } },
  now: () => Date.now(),
  isPrerender: () => typeof window !== 'undefined' && !!window.__PRERENDER__
})

export function createActivationMetrics(overrides = {}) {
  const env = { ...defaultEnv(), ...overrides }
  const mem = new Map() // 세션 저장소를 못 쓸 때의 대체
  const sget = (k) => {
    try { const s = env.session(); if (s) return s.getItem(k) } catch { /* 메모리로 */ }
    return mem.has(k) ? mem.get(k) : null
  }
  const sset = (k, v = '1') => {
    mem.set(k, v)
    try { env.session()?.setItem(k, v) } catch { /* 무시 */ }
  }
  const has = (k) => sget(k) !== null
  const off = () => { try { return !!env.isPrerender() } catch { return true } }
  const send = (name, params) => { try { env.track(name, params) } catch { /* 측정 실패는 화면에 영향 없음 */ } }
  const guard = (fn) => (...a) => { try { return fn(...a) } catch { return undefined } }

  /** A: 첫 주소가 QR 도착이면 세션당 1회 qr_arrive + 플래그 */
  const captureLanding = guard((href) => {
    if (off() || has(K.qr) || !isQrLanding(href)) return
    sset(K.qr)
    send('qr_arrive')
  })

  /** B: empty_state_view를 보낸 그 순간, QR로 들어온 세션이면 1회 */
  const onEmptyStateView = guard(() => {
    if (off() || !has(K.qr) || has(K.qrAlone)) return
    sset(K.qrAlone)
    send('qr_arrive_alone')
  })

  /** 혼자 화면이 시작됐다 (D의 시작 시각, C의 ip_first 판단). 첫 시작만 기록 */
  const markAlone = guard(() => {
    if (off() || has(K.aloneSince)) return
    sset(K.aloneSince, String(env.now()))
  })

  /** C: 같은 네트워크 탭에서 다른 기기가 1대 이상. 혼자였던 적이 있으면 ip_first, 아니면 ip_existing */
  const onIpConnected = guard(() => { sendConnected(has(K.aloneSince) ? 'ip_first' : 'ip_existing') })
  /** C: 비공개 방(1:1·그룹)에 다른 기기가 1대 이상 */
  const onRoomConnected = guard(() => { sendConnected('room') })
  function sendConnected(way) {
    if (off() || has(K.connected)) return
    sset(K.connected)
    send('connected_any', { way })
  }

  /** D: 페이지를 떠날 때 혼자 상태였다면 머문 시간 구간별 1회 */
  const onLeave = guard(() => {
    if (off() || has(K.leave) || !has(K.aloneSince)) return
    if (has(K.peerJoined) || has(K.connected)) return
    const since = Number(sget(K.aloneSince))
    if (!Number.isFinite(since)) return
    const ms = Math.max(0, env.now() - since)
    sset(K.leave)
    send(leaveBucket(ms), { wait_sec: Math.round(ms / 1000) })
  })

  /** E: 안내 글(/guide/)에서 넘어온 세션 */
  const checkGuide = guard((referrer, origin) => {
    if (off() || has(K.guide)) return
    const slug = guideSlug(referrer, origin)
    if (slug === null) return
    sset(K.guide)
    send('from_guide', { slug })
  })

  /** F-1: 처음 본 시각 기록 (없거나 숫자가 아니면 지금). localStorage가 없으면 null */
  const touchFirstSeen = guard(() => {
    if (off()) return null
    const ls = env.local()
    if (!ls) return null
    const v = Number(ls.getItem(FIRST_SEEN_KEY))
    if (ls.getItem(FIRST_SEEN_KEY) !== null && Number.isFinite(v) && v > 0) return v
    const now = env.now()
    ls.setItem(FIRST_SEEN_KEY, String(now))
    return now
  })

  /** F-2: 7일 이상 지난 재방문이면 저장된 방 유무로 갈라 세션당 1회 */
  const checkReturn = guard((hasRoom) => {
    if (off() || has(K.ret)) return
    const first = touchFirstSeen()
    if (typeof first !== 'number' || env.now() - first < SEVEN_DAYS_MS) return
    sset(K.ret)
    send(hasRoom ? 'return_7d_room' : 'return_7d_noroom')
  })

  /** 앱 시작 시 한 번: A, E, F-1 + 떠날 때 리스너(pagehide, 없으면 visibilitychange→hidden) */
  const init = guard(({ href, referrer, origin, win } = {}) => {
    if (off()) return
    captureLanding(href)
    checkGuide(referrer, origin)
    touchFirstSeen()
    if (win && typeof win.addEventListener === 'function') {
      if ('onpagehide' in win) win.addEventListener('pagehide', onLeave)
      else if (win.document) win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'hidden') onLeave() })
    }
  })

  return { init, captureLanding, onEmptyStateView, markAlone, onIpConnected, onRoomConnected, onLeave, checkGuide, touchFirstSeen, checkReturn }
}

const singleton = createActivationMetrics()
export const activation = singleton
export const {
  captureLanding, onEmptyStateView, markAlone, onIpConnected, onRoomConnected, onLeave, checkGuide, checkReturn
} = singleton
export const initActivationMetrics = () => {
  if (typeof window === 'undefined') return
  singleton.init({ href: window.location.href, referrer: document.referrer, origin: window.location.origin, win: window })
}
