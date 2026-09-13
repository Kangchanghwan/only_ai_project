import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const canInstall = ref(false)
const isInstalled = ref(false)
const promptInstall = vi.fn().mockResolvedValue()
vi.mock('../composables/usePWAInstall.js', () => ({
  usePWAInstall: () => ({ canInstall, isInstalled, promptInstall })
}))

const trackEvent = vi.fn()
vi.mock('../utils/analytics', () => ({ trackEvent: (...args) => trackEvent(...args) }))

import KeepUsingCard from './KeepUsingCard.vue'

const originalShare = navigator.share
const originalClipboard = navigator.clipboard

describe('KeepUsingCard.vue', () => {
  beforeEach(() => {
    canInstall.value = false
    promptInstall.mockClear()
    trackEvent.mockClear()
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue() },
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true, writable: true })
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true, writable: true })
  })

  it('isOpen이 false면 렌더링하지 않는다', () => {
    const w = mount(KeepUsingCard, { props: { isOpen: false } })
    expect(w.find('[data-testid="keep-using-card"]').exists()).toBe(false)
  })

  it('isOpen이 true면 제목과 두 버튼을 렌더링한다', () => {
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    const card = w.find('[data-testid="keep-using-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('nudge.title')
    expect(card.text()).toContain('nudge.install')
    expect(card.text()).toContain('nudge.share')
  })

  it('닫기 버튼은 dismiss를 emit한다', async () => {
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    await w.find('[data-testid="nudge-dismiss"]').trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })

  it('canInstall이면 설치 버튼이 promptInstall을 호출하고 done을 emit한다', async () => {
    canInstall.value = true
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    await w.find('[data-testid="nudge-install"]').trigger('click')
    await Promise.resolve()
    expect(promptInstall).toHaveBeenCalled()
    expect(w.emitted('done')).toHaveLength(1)
    expect(trackEvent).toHaveBeenCalledWith('nudge_install_click', { canInstall: true })
  })

  it('설치 프롬프트가 없는 데스크톱에서는 북마크 힌트를 보여준다', async () => {
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    await w.find('[data-testid="nudge-install"]').trigger('click')
    expect(w.find('[data-testid="nudge-hint"]').text()).toContain('nudge.bookmarkHint')
    expect(w.emitted('done')).toBeUndefined()
  })

  it('navigator.share가 있으면 그것으로 공유하고 done을 emit한다', async () => {
    const share = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    await w.find('[data-testid="nudge-share"]').trigger('click')
    await Promise.resolve()
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.clipboardapp.org/' }))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(w.emitted('done')).toHaveLength(1)
    expect(trackEvent).toHaveBeenCalledWith('nudge_share_click', { method: 'web_share' })
  })

  it('navigator.share가 없으면 URL을 클립보드에 복사하고 copied/done을 emit한다', async () => {
    const w = mount(KeepUsingCard, { props: { isOpen: true } })
    await w.find('[data-testid="nudge-share"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://www.clipboardapp.org/')
    expect(w.emitted('copied')[0]).toEqual(['nudge.copied'])
    expect(w.emitted('done')).toHaveLength(1)
    expect(trackEvent).toHaveBeenCalledWith('nudge_share_click', { method: 'copy' })
  })
})
