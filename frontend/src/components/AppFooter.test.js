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

import AppFooter from './AppFooter.vue'

describe('AppFooter.vue', () => {
  beforeEach(() => {
    canInstall.value = false
    isInstalled.value = false
    promptInstall.mockClear()
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
})
