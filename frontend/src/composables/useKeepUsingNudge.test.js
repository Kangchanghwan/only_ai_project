import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const isInstalled = ref(false)
vi.mock('./usePWAInstall.js', () => ({
  usePWAInstall: () => ({ isInstalled, canInstall: ref(false), promptInstall: vi.fn() })
}))

const trackEvent = vi.fn()
vi.mock('../utils/analytics', () => ({ trackEvent: (...args) => trackEvent(...args) }))

import {
  useKeepUsingNudge,
  NUDGE_DONE_KEY,
  NUDGE_LAST_SHOWN_KEY,
  NUDGE_COOLDOWN_MS
} from './useKeepUsingNudge.js'

describe('useKeepUsingNudge', () => {
  let nudge

  beforeEach(() => {
    window.localStorage.clear()
    delete window.__PRERENDER__
    isInstalled.value = false
    trackEvent.mockClear()
    nudge = useKeepUsingNudge()
    nudge._reset()
  })

  it('첫 공유 성공 시 카드를 띄우고 nudge_shown 이벤트와 lastShown을 기록한다', () => {
    expect(nudge.maybeShow('file_upload')).toBe(true)
    expect(nudge.isVisible.value).toBe(true)
    expect(nudge.trigger.value).toBe('file_upload')
    expect(Number(window.localStorage.getItem(NUDGE_LAST_SHOWN_KEY))).toBeGreaterThan(0)
    expect(trackEvent).toHaveBeenCalledWith('nudge_shown', { trigger: 'file_upload' })
  })

  it('같은 세션에서는 두 번째 공유에 다시 띄우지 않는다', () => {
    nudge.maybeShow('text_share')
    nudge.markDone()
    expect(nudge.maybeShow('file_upload')).toBe(false)
  })

  it('done 플래그가 있으면 띄우지 않는다', () => {
    window.localStorage.setItem(NUDGE_DONE_KEY, '1')
    expect(nudge.maybeShow('file_upload')).toBe(false)
    expect(nudge.isVisible.value).toBe(false)
  })

  it('7일 이내에 이미 보여줬으면 띄우지 않고, 7일이 지나면 다시 띄운다', () => {
    window.localStorage.setItem(NUDGE_LAST_SHOWN_KEY, String(Date.now() - NUDGE_COOLDOWN_MS + 60_000))
    expect(nudge.shouldShow()).toBe(false)
    window.localStorage.setItem(NUDGE_LAST_SHOWN_KEY, String(Date.now() - NUDGE_COOLDOWN_MS - 60_000))
    expect(nudge.shouldShow()).toBe(true)
  })

  it('설치된 PWA(standalone)에서는 띄우지 않는다', () => {
    isInstalled.value = true
    expect(nudge.shouldShow()).toBe(false)
  })

  it('프리렌더 중에는 띄우지 않는다', () => {
    window.__PRERENDER__ = true
    expect(nudge.shouldShow()).toBe(false)
  })

  it('dismiss는 done 플래그를 저장하고 nudge_dismiss를 보낸 뒤 카드를 닫는다', () => {
    nudge.maybeShow('text_share')
    nudge.dismiss()
    expect(nudge.isVisible.value).toBe(false)
    expect(window.localStorage.getItem(NUDGE_DONE_KEY)).toBe('1')
    expect(trackEvent).toHaveBeenCalledWith('nudge_dismiss', { trigger: 'text_share' })
  })
})
