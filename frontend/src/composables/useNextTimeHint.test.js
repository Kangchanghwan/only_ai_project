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

import { useNextTimeHint, NEXT_TIME_KEY, SHOW_DELAY_MS, AUTO_HIDE_MS } from './useNextTimeHint'

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

describe('useNextTimeHint 종류 결정', () => {
  it('데스크톱에서 설치 불가면 bookmark', () => {
    const h = useNextTimeHint()
    h.markSuccess('upload')
    expect(h.visible.value).toBe(false) // 성공 토스트가 먼저 보이도록 1.2초 뒤
    wait()
    expect(h.visible.value).toBe(true)
    expect(h.variant.value).toBe('bookmark')
    expect(h.kind.value).toBe('upload')
    expect(track).toHaveBeenCalledWith('next_time_hint_view', { variant: 'bookmark', kind: 'upload' })
  })

  it('iOS는 ios_shortcut (canInstall보다 우선)', () => {
    pwa.ios = true
    mobile.value = true
    pwa.canInstall.value = true
    const h = useNextTimeHint()
    h.markSuccess('text'); wait()
    expect(h.variant.value).toBe('ios_shortcut')
  })

  it('canInstall이면 install (모바일이어도)', () => {
    mobile.value = true
    pwa.canInstall.value = true
    const h = useNextTimeHint()
    h.markSuccess('download'); wait()
    expect(h.variant.value).toBe('install')
  })

  it('표시 시점에 계산한다: 성공 호출 뒤에 canInstall이 생기면 install', () => {
    const h = useNextTimeHint()
    h.markSuccess('copy')
    pwa.canInstall.value = true
    wait()
    expect(h.variant.value).toBe('install')
  })

  it('standalone이거나 설치됨이면 보이지 않는다', () => {
    pwa.standalone = true
    const a = useNextTimeHint()
    a.markSuccess('upload'); wait()
    expect(a.visible.value).toBe(false)
    pwa.standalone = false
    pwa.isInstalled.value = true
    const b = useNextTimeHint()
    b.markSuccess('upload'); wait()
    expect(b.visible.value).toBe(false)
    expect(localStorage.getItem(NEXT_TIME_KEY)).toBeNull()
  })

  it('설치 못 하는 모바일(안드로이드 인앱 등)은 보이지 않는다', () => {
    mobile.value = true
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(false)
    expect(h.variant.value).toBeNull()
  })
})

describe('useNextTimeHint 노출 규칙', () => {
  it('표시하면 shows가 1 늘고, 3회가 되면 더 보이지 않는다', () => {
    for (let i = 1; i <= 3; i++) {
      const h = useNextTimeHint() // 새 인스턴스 = 새 페이지 로드
      h.markSuccess('upload'); wait()
      expect(h.visible.value, `${i}번째`).toBe(true)
      expect(stored().shows).toBe(i)
      expect(stored().done).toBe(false)
    }
    const h4 = useNextTimeHint()
    h4.markSuccess('upload'); wait()
    expect(h4.visible.value).toBe(false)
    expect(stored().shows).toBe(3)
  })

  it('done이면 보이지 않는다', () => {
    localStorage.setItem(NEXT_TIME_KEY, JSON.stringify({ shows: 1, done: true }))
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(false)
  })

  it('페이지 로드당 1회: 두 번째 성공은 무시한다', () => {
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    h.dismiss()
    localStorage.setItem(NEXT_TIME_KEY, JSON.stringify({ shows: 1, done: false }))
    h.markSuccess('text'); wait()
    expect(h.visible.value).toBe(false)
    expect(track.mock.calls.filter((c) => c[0] === 'next_time_hint_view')).toHaveLength(1)
  })

  it('지연 중 연속 성공은 한 번만 예약한다', () => {
    const h = useNextTimeHint()
    h.markSuccess('upload'); h.markSuccess('text'); h.markSuccess('copy'); wait()
    expect(stored().shows).toBe(1)
    expect(h.kind.value).toBe('upload')
  })

  it('도착 알림 안내가 떠 있으면 건너뛰고, 사라진 뒤 다음 성공에서 보인다', () => {
    const blocked = ref(true)
    const h = useNextTimeHint({ isBlocked: () => blocked.value })
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(false)
    expect(localStorage.getItem(NEXT_TIME_KEY)).toBeNull()
    blocked.value = false
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(true)
  })

  it('20초 뒤 자동으로 숨기되 done은 아니다', () => {
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(true)
    wait(AUTO_HIDE_MS - 1)
    expect(h.visible.value).toBe(true)
    wait(1)
    expect(h.visible.value).toBe(false)
    expect(stored()).toEqual({ shows: 1, done: false })
    expect(track.mock.calls.map((c) => c[0])).toEqual(['next_time_hint_view'])
  })

  it('닫기: done=true, dismiss 이벤트(variant만)', () => {
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    h.dismiss()
    expect(h.visible.value).toBe(false)
    expect(stored().done).toBe(true)
    expect(track).toHaveBeenCalledWith('next_time_hint_dismiss', { variant: 'bookmark' })
    wait(AUTO_HIDE_MS) // 숨김 타이머가 남아 있지 않다
    expect(track.mock.calls.filter((c) => c[0] === 'next_time_hint_dismiss')).toHaveLength(1)
  })

  it('버튼 클릭: done=true, click 이벤트, install이면 promptInstall', () => {
    pwa.canInstall.value = true
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    h.act()
    expect(pwa.promptInstall).toHaveBeenCalledTimes(1)
    expect(h.visible.value).toBe(false)
    expect(stored().done).toBe(true)
    expect(track).toHaveBeenCalledWith('next_time_hint_click', { variant: 'install' })
  })

  it('ios_shortcut 클릭은 promptInstall을 부르지 않는다', () => {
    pwa.ios = true
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    h.act()
    expect(pwa.promptInstall).not.toHaveBeenCalled()
    expect(track).toHaveBeenCalledWith('next_time_hint_click', { variant: 'ios_shortcut' })
  })

  it('이벤트 파라미터에는 variant와 kind만 들어간다', () => {
    const h = useNextTimeHint()
    h.markSuccess('copy'); wait(); h.dismiss()
    for (const c of track.mock.calls) {
      expect(Object.keys(c[1] || {}).every((k) => k === 'variant' || k === 'kind')).toBe(true)
    }
  })
})

describe('useNextTimeHint 저장소 예외', () => {
  it('getItem/setItem이 던져도 앱 흐름은 계속되고 안내는 보인다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const h = useNextTimeHint()
    expect(() => { h.markSuccess('upload'); wait() }).not.toThrow()
    expect(h.visible.value).toBe(true)
    expect(() => h.dismiss()).not.toThrow()
    expect(h.visible.value).toBe(false)
  })

  it('깨진 JSON이면 처음 상태로 본다', () => {
    localStorage.setItem(NEXT_TIME_KEY, '{oops')
    const h = useNextTimeHint()
    h.markSuccess('upload'); wait()
    expect(h.visible.value).toBe(true)
    expect(stored().shows).toBe(1)
  })
})
