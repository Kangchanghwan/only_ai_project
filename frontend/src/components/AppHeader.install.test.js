import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: () => ({ global: { locale: { value: 'ko' }, t: (key) => key } })
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,X') } }))

const state = { canInstall: ref(false), isInstalled: ref(false), ios: false, standalone: false, promptInstall: vi.fn() }
vi.mock('../composables/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: state.canInstall, isInstalled: state.isInstalled, promptInstall: state.promptInstall }),
  isIOS: () => state.ios,
  isStandalone: () => state.standalone,
  isIPad: () => false
}))

import AppHeader from './AppHeader.vue'

const stubs = { LanguageSelector: true, ThemeToggleButton: true, HelpModal: true }
async function mountReady() {
  const w = mount(AppHeader, { global: { stubs }, attachTo: document.body })
  await flushPromises()
  return w
}

describe('AppHeader 설치 버튼', () => {
  beforeEach(() => {
    state.canInstall.value = false
    state.isInstalled.value = false
    state.ios = false
    state.standalone = false
    state.promptInstall = vi.fn()
    global.gtag = vi.fn()
    document.body.innerHTML = ''
  })

  it('지원도 iOS도 아니면 숨긴다', async () => {
    const w = await mountReady()
    expect(w.find('[data-testid="header-install-button"]').exists()).toBe(false)
  })

  it('canInstall이면 보이고 클릭 시 promptInstall을 호출한다', async () => {
    state.canInstall.value = true
    const w = await mountReady()
    const btn = w.find('[data-testid="header-install-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toBe('pwa.installAria')
    await btn.trigger('click')
    expect(state.promptInstall).toHaveBeenCalled()
    expect(document.querySelector('[data-testid="install-guide-sheet"]')).toBeNull()
  })

  it('iOS면 보이고 클릭 시 안내 시트가 열린다', async () => {
    state.ios = true
    const w = await mountReady()
    await w.find('[data-testid="header-install-button"]').trigger('click')
    expect(state.promptInstall).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="install-guide-sheet"]')).not.toBeNull()
    expect(window.gtag).toHaveBeenCalledWith('event', 'pwa_install_click', { platform: 'ios_guide' })
  })

  it('standalone이면 canInstall/iOS여도 숨긴다', async () => {
    state.ios = true
    state.canInstall.value = true
    state.standalone = true
    const w = await mountReady()
    expect(w.find('[data-testid="header-install-button"]').exists()).toBe(false)
  })
})
