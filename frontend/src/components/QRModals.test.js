import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MultiFileQRCodeModal from './MultiFileQRCodeModal.vue'
import i18n from '../i18n/index.js'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue() } }))

let wrapper
afterEach(() => wrapper?.unmount())
const mk = (files) => mount(MultiFileQRCodeModal, { props: { files, roomId: 'r1', isOpen: true }, global: { plugins: [i18n] }, attachTo: document.body })

describe('MultiFileQRCodeModal 접근성/수명', () => {
  it('role=dialog, aria-modal, aria-labelledby가 제목을 가리키고 Escape로 닫힌다', async () => {
    wrapper = mk([{ name: 'a.txt' }, { name: 'b.txt' }])
    const dlg = document.body.querySelector('[role="dialog"]')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(dlg.getAttribute('aria-labelledby'))
    expect(title.textContent).toContain('다중 파일 다운로드 QR')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('파일이 1개면 단수 제목을 쓴다', () => {
    wrapper = mk([{ name: 'a.txt' }])
    expect(document.body.querySelector('[role="dialog"] h2').textContent).toContain('파일 다운로드 QR')
    expect(document.body.querySelector('[role="dialog"] h2').textContent).not.toContain('다중')
  })

  it('열려 있는 동안 보여 주는 파일이 지워지면 닫는다 (0개 파일을 보이지 않는다)', async () => {
    wrapper = mk([{ name: 'a.txt' }, { name: 'b.txt' }])
    expect(wrapper.emitted('close')).toBeFalsy()
    await wrapper.setProps({ files: [] })
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('오버레이가 body 직속에 있어 하단 바보다 위에 놓인다', () => {
    wrapper = mk([{ name: 'a.txt' }])
    const overlay = document.body.querySelector('[data-testid="qr-modal-overlay"]')
    expect(wrapper.element.contains(overlay)).toBe(false)
    expect(document.body.contains(overlay)).toBe(true)
    expect(overlay.className).toContain('z-[80]')
  })
})
