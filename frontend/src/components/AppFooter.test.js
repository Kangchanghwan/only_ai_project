import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const canInstall = ref(false)
const isInstalled = ref(false)
const promptInstall = vi.fn()

vi.mock('../composables/usePWAInstall.js', () => ({
  usePWAInstall: () => ({ canInstall, isInstalled, promptInstall })
}))

const pushSupported = ref(false)
const pushEnabled = ref(false)
const pushPermission = ref('default')
const pushEnable = vi.fn()
const pushDisable = vi.fn()
vi.mock('../composables/usePush.js', () => ({
  usePush: () => ({ supported: pushSupported, enabled: pushEnabled, permission: pushPermission, enable: pushEnable, disable: pushDisable })
}))
const showSuccess = vi.fn()
const showError = vi.fn()
const showInfo = vi.fn()
vi.mock('../composables/useNotification.js', () => ({
  useNotification: () => ({ showSuccess, showError, showInfo })
}))

import AppFooter from './AppFooter.vue'
import { FEEDBACK_FORM_URL } from '../constants/feedback.js'

describe('AppFooter.vue', () => {
  beforeEach(() => {
    canInstall.value = false
    isInstalled.value = false
    promptInstall.mockClear()
    pushSupported.value = false
    pushEnabled.value = false
    pushPermission.value = 'default'
    pushEnable.mockReset()
    pushDisable.mockReset()
    showSuccess.mockClear(); showError.mockClear(); showInfo.mockClear()
  })

  it('canInstall이 false면 설치 유도 행을 렌더링하지 않는다', () => {
    const wrapper = mount(AppFooter)
    expect(wrapper.find('[data-testid="pwa-install-row"]').exists()).toBe(false)
  })

  it('canInstall이 true이고 isInstalled가 false면 설치 유도 행을 렌더링한다', () => {
    canInstall.value = true
    const wrapper = mount(AppFooter)
    const row = wrapper.find('[data-testid="pwa-install-row"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('footer.installPrompt')
    expect(row.text()).toContain('footer.installButton')
  })

  it('isInstalled가 true면 canInstall이 true여도 렌더링하지 않는다', () => {
    canInstall.value = true
    isInstalled.value = true
    const wrapper = mount(AppFooter)
    expect(wrapper.find('[data-testid="pwa-install-row"]').exists()).toBe(false)
  })

  it('설치 버튼 클릭 시 promptInstall이 호출된다', async () => {
    canInstall.value = true
    const wrapper = mount(AppFooter)
    await wrapper.find('[data-testid="pwa-install-button"]').trigger('click')
    expect(promptInstall).toHaveBeenCalledTimes(1)
  })

  it('건의하기 링크를 상수 URL로 새 탭에서 열도록 렌더링한다', () => {
    const wrapper = mount(AppFooter)
    const link = wrapper.find('[data-testid="feedback-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe(FEEDBACK_FORM_URL)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toBe('footer.feedback')
  })

  describe('도착 알림 켜기/끄기', () => {
    it('푸시를 지원하지 않으면 줄을 렌더링하지 않는다', () => {
      const wrapper = mount(AppFooter)
      expect(wrapper.find('[data-testid="push-row"]').exists()).toBe(false)
    })

    it('지원하고 꺼져 있으면 "켜기" 버튼만 보인다', () => {
      pushSupported.value = true
      const wrapper = mount(AppFooter)
      expect(wrapper.find('[data-testid="push-enable"]').text()).toBe('arrival.pushEnable')
      expect(wrapper.find('[data-testid="push-disable"]').exists()).toBe(false)
    })

    it('켜져 있으면 "켜짐 · 끄기"가 보인다', () => {
      pushSupported.value = true
      pushEnabled.value = true
      const wrapper = mount(AppFooter)
      expect(wrapper.find('[data-testid="push-enable"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="push-row"]').text()).toContain('arrival.pushOn')
      expect(wrapper.find('[data-testid="push-disable"]').text()).toBe('arrival.pushOff')
    })

    it('권한이 denied면 표시하지 않는다', () => {
      pushSupported.value = true
      pushPermission.value = 'denied'
      const wrapper = mount(AppFooter)
      expect(wrapper.find('[data-testid="push-row"]').exists()).toBe(false)
    })

    it('켜기 버튼: enable 호출 후 성공 토스트, 오류면 오류 토스트', async () => {
      pushSupported.value = true
      pushEnable.mockResolvedValueOnce({ ok: true })
      const wrapper = mount(AppFooter)
      await wrapper.find('[data-testid="push-enable"]').trigger('click')
      await Promise.resolve(); await Promise.resolve()
      expect(pushEnable).toHaveBeenCalledTimes(1)
      expect(showSuccess).toHaveBeenCalledWith('arrival.pushEnabled')

      pushEnable.mockResolvedValueOnce({ ok: false, reason: 'error' })
      await wrapper.find('[data-testid="push-enable"]').trigger('click')
      await Promise.resolve(); await Promise.resolve()
      expect(showError).toHaveBeenCalledWith('arrival.pushError')
    })

    it('끄기 버튼: disable 호출 후 안내 토스트', async () => {
      pushSupported.value = true
      pushEnabled.value = true
      pushDisable.mockResolvedValue({ ok: true })
      const wrapper = mount(AppFooter)
      await wrapper.find('[data-testid="push-disable"]').trigger('click')
      await Promise.resolve(); await Promise.resolve()
      expect(pushDisable).toHaveBeenCalledTimes(1)
      expect(showInfo).toHaveBeenCalledWith('arrival.pushDisabled')
    })
  })
})
