import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import HelpModal from './HelpModal.vue'

describe('HelpModal.vue', () => {
  it('열려 있을 때 PWA 설치 안내 섹션을 렌더링한다', () => {
    // HelpModal은 Teleport로 document.body에 렌더링되므로 wrapper.text()로는 찾을 수 없다
    // (ShareConfirmSheet.test.js와 동일한 패턴).
    mount(HelpModal, { props: { isOpen: true } })
    const text = document.body.textContent
    expect(text).toContain('help.pwaTitle')
    expect(text).toContain('help.pwaIntro')
    expect(text).toContain('help.pwaAndroidTitle')
    expect(text).toContain('help.pwaAndroidDesc')
    expect(text).toContain('help.pwaIOSTitle')
    expect(text).toContain('help.pwaIOSDesc')
  })
})
