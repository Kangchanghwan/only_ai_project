import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

const track = vi.hoisted(() => vi.fn())
const pwa = vi.hoisted(() => ({
  standalone: false,
  ios: false,
  canInstall: null,
  isInstalled: null,
  promptInstall: vi.fn()
}))
const mobile = vi.hoisted(() => ({ value: false }))

vi.mock('../utils/analytics', () => ({ trackEvent: track }))
vi.mock('../services/p2pProbe', () => ({ isMobileUa: () => mobile.value }))
vi.mock('./usePWAInstall', () => ({
  isStandalone: () => pwa.standalone,
  isIOS: () => pwa.ios,
  usePWAInstall: () => ({ canInstall: pwa.canInstall, isInstalled: pwa.isInstalled, promptInstall: pwa.promptInstall })
}))

import { useNextTimeHint, pickPairTarget, NEXT_TIME_KEY, SHOW_DELAY_MS, AUTO_HIDE_MS } from './useNextTimeHint'

const stored = () => JSON.parse(localStorage.getItem(NEXT_TIME_KEY))
const wait = (ms = SHOW_DELAY_MS) => vi.advanceTimersByTime(ms)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  track.mockClear()
  pwa.promptInstall.mockClear()
  pwa.standalone = false
  pwa.ios = false
  pwa.canInstall = ref(false)
  pwa.isInstalled = ref(false)
  mobile.value = false
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })


const ME = 'me'
const PEER = { socketId: 'p1', identity: { adj: 1, animal: 2, suffix: 0 } }
const base = () => ({ scope: 'ip', devices: [{ socketId: ME }, PEER], mySocketId: ME, pairStates: {}, rooms: [], busy: false })
/** 상대가 늘 있는 상태의 힌트 */
const mk = (extra = {}) => {
  const onPair = vi.fn()
  const h = useNextTimeHint({ getPairTarget: (scope) => pickPairTarget({ ...base(), scope }), onPair, ...extra })
  return { h, onPair }
}

describe('pickPairTarget: 4가지 조건', () => {
  it('모두 만족하면 그 기기', () => {
    expect(pickPairTarget(base())).toBe(PEER)
  })
  it('1) 같은 네트워크 탭이 아니면 null', () => {
    expect(pickPairTarget({ ...base(), scope: 'global' })).toBeNull()
    expect(pickPairTarget({ ...base(), scope: 'prv' })).toBeNull()
  })
  it('2) 다른 기기가 정확히 1대가 아니면 null', () => {
    expect(pickPairTarget({ ...base(), devices: [{ socketId: ME }] })).toBeNull()
    expect(pickPairTarget({ ...base(), devices: [{ socketId: ME }, PEER, { socketId: 'p2' }] })).toBeNull()
  })
  it('3) 그 기기와 이미 1:1 방이 있으면 null (소켓이 바뀌어도 이름표로 안다)', () => {
    expect(pickPairTarget({ ...base(), pairStates: { p1: { state: 'paired', roomId: 'r' } } })).toBeNull()
    expect(pickPairTarget({ ...base(), rooms: [{ roomId: 'r', peer: { socketId: 'old', identity: { ...PEER.identity } } }] })).toBeNull()
  })
  it('4) 다른 초대가 진행 중이면 null', () => {
    expect(pickPairTarget({ ...base(), busy: true })).toBeNull()
    expect(pickPairTarget({ ...base(), pairStates: { x: { state: 'pending' } } })).toBeNull()
  })
})

describe('useNextTimeHint pair 변형', () => {
  it('같은 네트워크에서 성공 1.2초 뒤 pair로 보이고 view를 기록한다', () => {
    const { h } = mk()
    h.markSuccess('text', 'ip')
    expect(h.visible.value).toBe(false)
    wait()
    expect(h.visible.value).toBe(true)
    expect(h.variant.value).toBe('pair')
    expect(h.peer.value).toEqual(PEER)
    expect(track).toHaveBeenCalledWith('next_time_hint_view', { variant: 'pair', kind: 'text' })
  })

  it('조건이 안 맞으면 아무것도 보여 주지 않는다 (예전 변형도 안 보임)', () => {
    pwa.canInstall.value = true
    const { h } = mk()
    h.markSuccess('upload', 'global'); wait()
    expect(h.visible.value).toBe(false)
    expect(track).not.toHaveBeenCalled()
    const h2 = useNextTimeHint()
    h2.markSuccess('upload', 'ip'); wait()
    expect(h2.visible.value).toBe(false)
  })

  it('버튼: 초대 함수를 그 기기 대상으로 1번 호출, click 기록, done', () => {
    const { h, onPair } = mk()
    h.markSuccess('text', 'ip'); wait()
    h.act()
    expect(onPair).toHaveBeenCalledTimes(1)
    expect(onPair).toHaveBeenCalledWith(expect.objectContaining({ socketId: "p1" }))
    expect(track).toHaveBeenCalledWith('next_time_hint_click', { variant: 'pair' })
    expect(h.visible.value).toBe(false)
    expect(stored().done).toBe(true)
  })

  it('닫기: dismiss 기록, 초대하지 않는다', () => {
    const { h, onPair } = mk()
    h.markSuccess('text', 'ip'); wait()
    h.dismiss()
    expect(onPair).not.toHaveBeenCalled()
    expect(track).toHaveBeenCalledWith('next_time_hint_dismiss', { variant: 'pair' })
    expect(stored().done).toBe(true)
  })

  it('3회 상한', () => {
    for (let i = 0; i < 4; i++) {
      const { h } = mk()
      h.markSuccess('text', 'ip'); wait()
      expect(h.visible.value).toBe(i < 3)
    }
    expect(stored().shows).toBe(3)
  })

  it('페이지 로드당 1회, 20초 뒤 사라짐(done 아님)', () => {
    const { h } = mk()
    h.markSuccess('text', 'ip'); wait()
    wait(AUTO_HIDE_MS)
    expect(h.visible.value).toBe(false)
    h.markSuccess('text', 'ip'); wait()
    expect(h.visible.value).toBe(false)
    expect(stored()).toEqual({ shows: 1, done: false })
  })

  it('다른 창이 떠 있으면 건너뛴다', () => {
    const { h } = mk({ isBlocked: () => true })
    h.markSuccess('text', 'ip'); wait()
    expect(h.visible.value).toBe(false)
  })

  it('저장소가 던져도 보인다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x') })
    const { h } = mk()
    h.markSuccess('text', 'ip'); wait()
    expect(h.visible.value).toBe(true)
  })
})
