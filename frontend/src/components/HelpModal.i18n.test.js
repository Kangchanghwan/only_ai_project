import { describe, it, expect, afterEach } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import HelpModal from './HelpModal.vue'
import i18n from '../i18n/index.js'

let wrapper
afterEach(() => wrapper?.unmount())

function modalText(locale) {
  i18n.global.locale.value = locale
  wrapper = mount(HelpModal, { props: { isOpen: true }, global: { plugins: [i18n] } })
  return new DOMWrapper(document.body.querySelector('[data-testid="help-modal"]'))
}

describe('HelpModal 실제 번역 렌더', () => {
  it('한국어: 화면과 같은 말(방, 받기, ZIP)과 확인한 사실(5GB, 10분, 1일)을 쓴다', () => {
    const m = modalText('ko')
    const text = m.text()
    expect(text).toContain('사용 방법')
    expect(text).toContain("'그림으로 들어가기'")
    expect(text).toContain('ZIP 하나로 받아요')
    expect(text).toContain('5GB')
    expect(text).toContain('텍스트는 10분 동안 보관')
    expect(text).toContain('최대 1일')
    expect(text).not.toContain('룸')
    expect(text).not.toContain('순차')
    i18n.global.locale.value = 'ko'
  })

  it('영어: 같은 6개 묶음, 짧은 주소는 clipboardapp.org', () => {
    const m = modalText('en')
    expect(m.text()).toContain('How to use')
    expect(m.text()).toContain('clipboardapp.org')
    expect(m.text()).not.toContain('핑.한국')
    i18n.global.locale.value = 'ko'
  })
})
