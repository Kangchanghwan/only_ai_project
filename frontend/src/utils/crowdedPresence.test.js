import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('./analytics.js', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from './analytics.js'
import { createRoomPresence } from './roomPresence'
import { shouldSkipPresenceToast, trackPresenceSkipped, othersBucket, _resetPresenceSkipForTest } from './crowdedPresence'

const dev = (i) => ({ socketId: `s${i}`, identity: { adj: i, animal: i, suffix: 0 } })
const me = { mySocketId: 'me', myKey: null }

/** App.vue의 presenceToast와 같은 판단으로 알림 수를 센다 */
function setup() {
  const shown = []
  const timers = []
  const p = createRoomPresence({
    onJoin: (k, d) => { if (!shouldSkipPresenceToast(k, p.count(k))) shown.push(['join', k]); else trackPresenceSkipped(p.count(k)) },
    onLeave: (k, d) => { if (!shouldSkipPresenceToast(k, p.count(k))) shown.push(['leave', k]); else trackPresenceSkipped(p.count(k)) },
    setTimer: (fn) => { timers.push(fn); return timers.length },
    clearTimer: () => {},
  })
  return { p, shown, flush: () => timers.splice(0).forEach((f) => f()) }
}
const list = (n) => [{ socketId: 'me' }, ...Array.from({ length: n }, (_, i) => dev(i + 1))]

describe('기기가 많은 네트워크에서 입퇴장 알림 끄기', () => {
  beforeEach(() => { sessionStorage.clear(); _resetPresenceSkipForTest(); trackEvent.mockClear() })

  it('다른 기기 4대째가 들어오면 알림이 뜬다', () => {
    const { p, shown } = setup()
    p.update('ip', list(3), me)
    p.update('ip', list(4), me)
    expect(shown).toEqual([['join', 'ip']])
  })

  it('다른 기기 5대에서 들어옴·나감 알림이 뜨지 않는다', () => {
    const { p, shown, flush } = setup()
    p.update('ip', list(4), me)
    p.update('ip', list(5), me)
    p.update('ip', list(6), me)
    p.update('ip', list(5), me)
    flush()
    expect(shown).toEqual([])
  })

  it('그룹 방은 6대여도 알림이 뜬다', () => {
    const { p, shown } = setup()
    p.update('room1', list(5), me)
    p.update('room1', list(6), me)
    expect(shown).toEqual([['join', 'room1']])
  })

  it('presence_toast_skipped는 여러 번 건너뛰어도 1회만 기록된다', () => {
    const { p } = setup()
    p.update('ip', list(9), me)
    p.update('ip', list(10), me)
    p.update('ip', list(11), me)
    p.update('ip', list(12), me)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('presence_toast_skipped', { scope: 'ip', others_bucket: '10_29' })
  })

  it('기기 수 구간', () => {
    expect([5, 9, 10, 29, 30].map(othersBucket)).toEqual(['5_9', '5_9', '10_29', '10_29', '30_plus'])
  })
})
