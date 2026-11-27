import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (v) => `data:${v}`) } }))
const { default: WakeQrPanel } = await import('./WakeQrPanel.vue')
const URL1 = 'https://www.clipboardapp.org/#/qc?s=a&r=TAG'

describe('WakeQrPanel', () => {
  it('QR 그림에 주소를 담고 두 줄 문구를 보인다', async () => {
    const w = mount(WakeQrPanel, { props: { qrUrl: URL1, line1: '첫 줄', line2: '둘째 줄' } })
    await flushPromises()
    const img = w.find('[data-testid="wake-qr-img"]')
    expect(img.attributes('data-qr-value')).toBe(URL1)
    expect(img.attributes('width')).toBe('140')
    expect(w.text()).toContain('첫 줄')
    expect(w.text()).toContain('둘째 줄')
  })
  it('주소가 바뀌면 QR을 다시 만든다', async () => {
    const w = mount(WakeQrPanel, { props: { qrUrl: URL1, line1: 'a', line2: 'b' } })
    await flushPromises()
    await w.setProps({ qrUrl: URL1 + '2' })
    await flushPromises()
    expect(w.find('[data-testid="wake-qr-img"]').attributes('data-qr-value')).toBe(URL1 + '2')
  })
  it('QR 만들기 전에는 빈 상자를 보인다', () => {
    const w = mount(WakeQrPanel, { props: { qrUrl: URL1, line1: 'a', line2: 'b' } })
    expect(w.find('[data-testid="wake-qr-img"]').exists()).toBe(false)
    expect(w.find('[aria-hidden="true"]').exists()).toBe(true)
  })
})
