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
  it('영어 intro는 굵은 제목 뒤에 공백이 있다 ("Clipboard Share is")', () => {
    const m = modalText('en')
    expect(m.text()).toContain('Clipboard Share is a web application')
    expect(m.text()).not.toContain('Clipboard Shareis')
  })

  it('보관 1일 제한 문구와 ⋯ 더보기 설명이 렌더된다 (ko/en)', () => {
    let m = modalText('ko')
    expect(m.text()).toContain('최대 약 1일 보관')
    expect(m.text()).toContain('QR 코드 공유 · 다운로드 · 삭제')
    wrapper.unmount()
    m = modalText('en')
    expect(m.text()).toContain('about 1 day at most')
    expect(m.text()).toContain('QR code sharing, download and delete')
    i18n.global.locale.value = 'ko'
  })
})
