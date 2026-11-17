import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: () => ({ global: { locale: { value: 'ko' }, t: (key) => key } })
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,X') } }))
vi.mock('../composables/usePWAInstall', () => ({
  usePWAInstall: () => ({ canInstall: ref(false), isInstalled: ref(false), promptInstall: vi.fn() }),
  isIOS: () => false,
  isStandalone: () => false,
  isIPad: () => false
}))
const push = { supported: ref(true), enabled: ref(false), permission: ref('default'), enable: vi.fn(), disable: vi.fn() }
vi.mock('../composables/usePush', () => ({ usePush: () => push }))
const note = { showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }
vi.mock('../composables/useNotification', () => ({ useNotification: () => note }))

import AppHeader from './AppHeader.vue'

const stubs = { LanguageSelector: true, ThemeToggleButton: true, HelpModal: true }
async function openMenu() {
  const w = mount(AppHeader, { global: { stubs }, attachTo: document.body })
  await flushPromises()
  await w.find('[data-testid="header-more-button"]').trigger('click')
  return w
}

describe('AppHeader 더 보기 메뉴의 도착 알림', () => {
  beforeEach(() => {
    push.supported.value = true; push.enabled.value = false; push.permission.value = 'default'
    push.enable.mockReset(); push.disable.mockReset(); note.showSuccess.mockReset(); note.showInfo.mockReset(); note.showError.mockReset()
  })

  it('꺼져 있으면 "도착 알림 켜기"가 있고, 누르면 켜고 메뉴를 닫는다', async () => {
    push.enable.mockResolvedValue({ ok: true })
    const w = await openMenu()
    const b = w.find('[data-testid="header-push-button"]')
    expect(b.text()).toBe('arrival.pushEnable')
    expect(b.attributes('aria-pressed')).toBe('false')
    await b.trigger('click'); await flushPromises()
    expect(push.enable).toHaveBeenCalledTimes(1)
    expect(note.showSuccess).toHaveBeenCalledWith('arrival.pushEnabled')
    expect(w.find('[data-testid="header-more-menu"]').exists()).toBe(false)
    w.unmount()
  })

  it('켜져 있으면 "도착 알림 켜짐"으로 보이고, 누르면 끈다', async () => {
    push.enabled.value = true
    const w = await openMenu()
    const b = w.find('[data-testid="header-push-button"]')
    expect(b.text()).toBe('arrival.pushOn')
    expect(b.attributes('aria-pressed')).toBe('true')
    await b.trigger('click'); await flushPromises()
    expect(push.disable).toHaveBeenCalledTimes(1)
    expect(note.showInfo).toHaveBeenCalledWith('arrival.pushDisabled')
    w.unmount()
  })

  it('지원하지 않거나 거부된 브라우저에서는 보이지 않는다', async () => {
    push.supported.value = false
    let w = await openMenu()
    expect(w.find('[data-testid="header-push-button"]').exists()).toBe(false)
    w.unmount()
    push.supported.value = true; push.permission.value = 'denied'
    w = await openMenu()
    expect(w.find('[data-testid="header-push-button"]').exists()).toBe(false)
    w.unmount()
  })
})
