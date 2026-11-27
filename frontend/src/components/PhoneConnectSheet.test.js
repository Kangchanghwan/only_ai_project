import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import i18n from '../i18n/index.js'
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (v) => `data:${v}`) } }))
const { default: PhoneConnectSheet } = await import('./PhoneConnectSheet.vue')
const URL1 = 'https://www.clipboardapp.org/#/qc?s=a&g=AbCd12'
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const mk = (props) => mount(PhoneConnectSheet, { props: { open: true, qrUrl: URL1, ...props }, attachTo: document.body, global: { plugins: [i18n] } })
beforeEach(() => { i18n.global.locale.value = 'ko'; document.body.innerHTML = '' })

describe('PhoneConnectSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    const w = mount(PhoneConnectSheet, { props: { open: false }, attachTo: document.body, global: { plugins: [i18n] } })
    expect(q('phone-connect-sheet')).toBeNull()
    w.unmount()
  })
  it('제목, QR 주소, 두 줄 문구를 보인다', async () => {
    const w = mk()
    await flushPromises()
    const sheet = q('phone-connect-sheet')
    expect(sheet.querySelector('h2').textContent).toBe('휴대폰 초대')
    expect(sheet.querySelector('[data-testid="wake-qr-img"]').getAttribute('data-qr-value')).toBe(URL1)
    expect(sheet.textContent).toContain('다른 네트워크의 휴대폰이면 연결 요청이 와요')
    expect(sheet.className).toContain('z-[70]')
    w.unmount()
  })
  it('열면 닫기 버튼에 포커스가 가고, 닫기·Esc·배경 클릭이 close를 낸다', async () => {
    const w = mk()
    await flushPromises()
    expect(document.activeElement).toBe(q('phone-connect-close'))
    q('phone-connect-close').click()
    expect(w.emitted('close')).toHaveLength(1)
    q('phone-connect-close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('close')).toHaveLength(2)
    q('phone-connect-sheet').click()
    expect(w.emitted('close')).toHaveLength(3)
    w.unmount()
  })
})
