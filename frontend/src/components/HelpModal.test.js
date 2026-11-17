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
  it('열려 있을 때 6개 묶음(연결·보내기·받기·누가 보나·얼마나 남나·더 편하게)을 순서대로 그린다', () => {
    wrapper = mount(HelpModal, { props: { isOpen: true } })
    const m = findModal()
    const ids = m.findAll('[data-testid^="help-section-"]').map((e) => e.attributes('data-testid').replace('help-section-', ''))
    expect(ids).toEqual(['connect', 'send', 'receive', 'who', 'keep', 'more'])
    const text = m.text()
    for (const k of ['help.connectTitle', 'help.connect1', 'help.connect7', 'help.send5', 'help.receive3', 'help.who6', 'help.keep3', 'help.more3']) {
      expect(text).toContain(k)
    }
    expect(m.findAll('[data-testid="help-section-connect"] li')).toHaveLength(7)
  })
  it('열면 닫기 버튼으로 포커스가 가고, 닫으면 이전 요소로 돌아간다', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    wrapper = mount(HelpModal, { props: { isOpen: false }, attachTo: document.body })
    await wrapper.setProps({ isOpen: true })
    await new Promise((r) => setTimeout(r, 0))
    const closeBtn = document.body.querySelector('[data-testid="help-modal"] button[aria-label="help.close"]')
    expect(document.activeElement).toBe(closeBtn)
    expect(findModal().attributes('aria-labelledby')).toBe('help-modal-title')
    await wrapper.setProps({ isOpen: false })
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
