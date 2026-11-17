import { describe, it, expect, vi } from 'vitest'
import { createActivationMetrics, leaveBucket, isQrLanding, guideSlug, FIRST_SEEN_KEY, SEVEN_DAYS_MS } from './activationMetrics'

const store = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }
}
const broken = () => ({ getItem() { throw new Error('x') }, setItem() { throw new Error('x') } })
function setup(o = {}) {
  const clock = { t: 1_800_000_000_000 }
  const track = vi.fn()
  const session = store(); const local = store()
  const am = createActivationMetrics({ track, session: () => session, local: () => local, now: () => clock.t, isPrerender: () => false, ...o })
  const names = () => track.mock.calls.map((c) => c[0])
  return { am, track, clock, session, local, names }
}
const QR = 'https://www.clipboardapp.org/?utm_source=qr&utm_medium=empty_state'

describe('A/B qr_arrive, qr_arrive_alone', () => {
  it('QR 주소일 때만 세션당 1회', () => {
    const { am, names } = setup()
    am.captureLanding('https://www.clipboardapp.org/?utm_source=qr')
    am.captureLanding('https://www.clipboardapp.org/')
    expect(names()).toEqual([])
    am.captureLanding(QR); am.captureLanding(QR)
    expect(names()).toEqual(['qr_arrive'])
  })
  it('B: QR 도착 세션에서만, empty_state_view 시점에 1회', () => {
    const a = setup(); a.am.onEmptyStateView(); expect(a.names()).toEqual([])
    const b = setup(); b.am.captureLanding(QR); b.am.onEmptyStateView(); b.am.onEmptyStateView()
    expect(b.names()).toEqual(['qr_arrive', 'qr_arrive_alone'])
  })
  it('isQrLanding', () => {
    expect(isQrLanding(QR)).toBe(true)
    expect(isQrLanding('https://x.org/?utm_source=qr&utm_medium=other')).toBe(false)
    expect(isQrLanding('not a url')).toBe(false)
  })
})

describe('C connected_any', () => {
  it('ip_first: 혼자였던 뒤 합류', () => {
    const { am, track } = setup(); am.markAlone(); am.onIpConnected(); am.onIpConnected(); am.onRoomConnected()
    expect(track.mock.calls).toEqual([['connected_any', { way: 'ip_first' }]])
  })
  it('ip_existing: 혼자였던 적 없음', () => {
    const { am, track } = setup(); am.onIpConnected()
    expect(track).toHaveBeenCalledWith('connected_any', { way: 'ip_existing' })
  })
  it('room', () => {
    const { am, track } = setup(); am.onRoomConnected(); am.onIpConnected()
    expect(track.mock.calls).toEqual([['connected_any', { way: 'room' }]])
  })
})

describe('D alone_leave_*', () => {
  it('구간 경계: 9s fast, 10s mid, 60s mid, 61s long', () => {
    expect(leaveBucket(9000)).toBe('alone_leave_fast')
    expect(leaveBucket(9999)).toBe('alone_leave_fast')
    expect(leaveBucket(10_000)).toBe('alone_leave_mid')
    expect(leaveBucket(60_000)).toBe('alone_leave_mid')
    expect(leaveBucket(61_000)).toBe('alone_leave_long')
  })
  it.each([[9000, 'alone_leave_fast'], [10_000, 'alone_leave_mid'], [60_000, 'alone_leave_mid'], [61_000, 'alone_leave_long']])('%ims → %s, wait_sec 포함, 1회', (ms, name) => {
    const { am, track, clock } = setup()
    am.markAlone(); clock.t += ms; am.onLeave(); am.onLeave()
    expect(track.mock.calls).toEqual([[name, { wait_sec: Math.round(ms / 1000) }]])
  })
  it('혼자 화면이 없었으면 보내지 않는다', () => {
    const { am, track } = setup(); am.onLeave(); expect(track).not.toHaveBeenCalled()
  })
  it('3초 미만이어도 혼자 상태가 시작됐으면 fast', () => {
    const { am, names, clock } = setup(); am.markAlone(); clock.t += 1000; am.onLeave()
    expect(names()).toEqual(['alone_leave_fast'])
  })
  it('peer_joined 또는 connected_any가 있으면 보내지 않는다', () => {
    const a = setup(); a.am.markAlone(); a.session.setItem('cs_peer_joined', '1'); a.am.onLeave()
    const b = setup(); b.am.markAlone(); b.am.onIpConnected(); b.track.mockClear(); b.am.onLeave()
    expect(a.track).not.toHaveBeenCalled(); expect(b.track).not.toHaveBeenCalled()
  })
  it('init: pagehide로 1회, visibilitychange는 pagehide가 있으면 붙이지 않는다', () => {
    const { am, track } = setup()
    const handlers = {}
    const doc = { addEventListener: vi.fn(), visibilityState: 'hidden' }
    const win = { onpagehide: null, document: doc, addEventListener: (e, f) => { handlers[e] = f } }
    am.init({ href: 'https://a/', referrer: '', origin: 'https://a', win })
    am.markAlone(); handlers.pagehide(); handlers.pagehide()
    expect(track).toHaveBeenCalledTimes(1)
    expect(doc.addEventListener).not.toHaveBeenCalled()
  })
  it('init: pagehide가 없으면 visibilitychange→hidden', () => {
    const { am, track } = setup()
    let vc
    const doc = { addEventListener: (e, f) => { vc = f }, visibilityState: 'visible' }
    am.init({ href: 'https://a/', referrer: '', origin: 'https://a', win: { document: doc, addEventListener: vi.fn() } })
    am.markAlone(); vc(); expect(track).not.toHaveBeenCalled()
    doc.visibilityState = 'hidden'; vc(); vc()
    expect(track).toHaveBeenCalledTimes(1)
  })
})

describe('E from_guide', () => {
  it('slug 추출', () => {
    expect(guideSlug('https://www.clipboardapp.org/guide/ios-shortcut.html', 'https://www.clipboardapp.org')).toBe('ios-shortcut')
    expect(guideSlug('https://www.clipboardapp.org/en/guide/foo', 'https://www.clipboardapp.org')).toBe('foo')
    expect(guideSlug('https://www.clipboardapp.org/guide/' + 'a'.repeat(100), 'https://www.clipboardapp.org')).toHaveLength(80)
    expect(guideSlug('https://other.com/guide/x.html', 'https://www.clipboardapp.org')).toBeNull()
    expect(guideSlug('https://www.clipboardapp.org/about', 'https://www.clipboardapp.org')).toBeNull()
    expect(guideSlug('', 'https://www.clipboardapp.org')).toBeNull()
  })
  it('세션당 1회', () => {
    const { am, track } = setup()
    am.checkGuide('https://a.org/guide/x.html', 'https://a.org'); am.checkGuide('https://a.org/guide/y.html', 'https://a.org')
    expect(track.mock.calls).toEqual([['from_guide', { slug: 'x' }]])
  })
})

describe('F return_7d_*', () => {
  it('첫 실행은 기록만 하고 보내지 않는다 (숫자만 저장)', () => {
    const { am, track, local, clock } = setup()
    am.checkReturn(true)
    expect(track).not.toHaveBeenCalled()
    expect(local.getItem(FIRST_SEEN_KEY)).toBe(String(clock.t))
  })
  it('7일 경계: 7일 미만 없음, 7일 이상 room/noroom, 세션당 1회', () => {
    const a = setup(); a.local.setItem(FIRST_SEEN_KEY, a.clock.t - SEVEN_DAYS_MS + 1); a.am.checkReturn(true)
    expect(a.track).not.toHaveBeenCalled()
    const b = setup(); b.local.setItem(FIRST_SEEN_KEY, b.clock.t - SEVEN_DAYS_MS); b.am.checkReturn(true); b.am.checkReturn(false)
    expect(b.track.mock.calls).toEqual([['return_7d_room', undefined]])
    const c = setup(); c.local.setItem(FIRST_SEEN_KEY, c.clock.t - SEVEN_DAYS_MS - 5); c.am.checkReturn(false)
    expect(c.track.mock.calls).toEqual([['return_7d_noroom', undefined]])
  })
  it('숫자가 아닌 값은 지금으로 덮어쓰고 보내지 않는다', () => {
    const { am, track, local, clock } = setup(); local.setItem(FIRST_SEEN_KEY, 'abc'); am.checkReturn(true)
    expect(track).not.toHaveBeenCalled(); expect(local.getItem(FIRST_SEEN_KEY)).toBe(String(clock.t))
  })
})

describe('저장소 불가·프리렌더·오류 격리', () => {
  it('localStorage 불가: F는 아무것도 보내지 않는다', () => {
    const a = setup({ local: () => null }); a.am.checkReturn(true)
    const b = setup({ local: () => broken() }); b.am.checkReturn(true)
    expect(a.track).not.toHaveBeenCalled(); expect(b.track).not.toHaveBeenCalled()
  })
  it('sessionStorage 불가: 이 페이지 로드 동안 1회는 지킨다', () => {
    for (const session of [() => null, () => broken()]) {
      const { am, track } = setup({ session })
      am.captureLanding(QR); am.captureLanding(QR); am.markAlone(); am.onEmptyStateView(); am.onEmptyStateView()
      expect(track.mock.calls.map((c) => c[0])).toEqual(['qr_arrive', 'qr_arrive_alone'])
    }
  })
  it('프리렌더: 아무것도 보내지 않고 리스너도 붙이지 않는다', () => {
    const { am, track, local } = setup({ isPrerender: () => true })
    const win = { onpagehide: null, addEventListener: vi.fn() }
    am.init({ href: QR, referrer: 'https://a.org/guide/x', origin: 'https://a.org', win })
    am.markAlone(); am.onEmptyStateView(); am.onIpConnected(); am.onRoomConnected(); am.onLeave(); am.checkReturn(true)
    expect(track).not.toHaveBeenCalled(); expect(win.addEventListener).not.toHaveBeenCalled(); expect(local.m.size).toBe(0)
  })
  it('track이 던져도 예외가 밖으로 나가지 않는다', () => {
    const { am } = setup({ track: () => { throw new Error('boom') } })
    expect(() => { am.captureLanding(QR); am.onRoomConnected() }).not.toThrow()
  })
})
