import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))

import InstallGuideSheet from './InstallGuideSheet.vue'

describe('InstallGuideSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    mount(InstallGuideSheet, { props: { isOpen: false }, attachTo: document.body })
    expect(document.querySelector('[data-testid="install-guide-sheet"]')).toBeNull()
  })

  it('열리면 3단계를 보여 주고 닫기 버튼에 포커스한다', async () => {
    const w = mount(InstallGuideSheet, { props: { isOpen: true }, attachTo: document.body })
    await w.vm.$nextTick(); await w.vm.$nextTick()
    expect(document.querySelectorAll('[data-testid="install-guide-step"]').length).toBe(3)
    expect(document.activeElement).toBe(document.querySelector('[data-testid="install-guide-close"]'))
    w.unmount()
  })

  it('Esc와 닫기 버튼이 close를 낸다', async () => {
    const w = mount(InstallGuideSheet, { props: { isOpen: true }, attachTo: document.body })
    await w.vm.$nextTick()
    const dialog = document.querySelector('[role="dialog"]')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(1)
    document.querySelector('[data-testid="install-guide-close"]').click()
    expect(w.emitted('close')).toHaveLength(2)
    w.unmount()
  })
})
