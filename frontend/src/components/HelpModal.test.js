import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import HelpModal from './HelpModal.vue'

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

// HelpModal은 Teleport로 document.body에 렌더링되므로 wrapper.find()/wrapper.text()로는
// 찾을 수 없다 (wrapper.find/text는 마운트된 컴포넌트 자신의 DOM 서브트리 안에서만 검색한다).
// document.body를 직접 쿼리하고 DOMWrapper로 감싸서 VTU의 find/text API를 그대로 사용한다
// (FileCard.test.js에서 확립된 패턴).
function findModal() {
  const el = document.body.querySelector('[data-testid="help-modal"]')
  return el ? new DOMWrapper(el) : null
}

describe('HelpModal.vue', () => {
  it('열려 있을 때 PWA 설치 안내 섹션을 렌더링한다', () => {
    wrapper = mount(HelpModal, { props: { isOpen: true } })
    const text = findModal().text()
    expect(text).toContain('help.pwaTitle')
    expect(text).toContain('help.pwaIntro')
    expect(text).toContain('help.pwaAndroidTitle')
    expect(text).toContain('help.pwaAndroidDesc')
    expect(text).toContain('help.pwaIOSTitle')
    expect(text).toContain('help.pwaIOSDesc')
  })
})
