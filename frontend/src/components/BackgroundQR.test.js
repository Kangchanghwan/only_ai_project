import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR')
  }
}))

import BackgroundQR from './BackgroundQR.vue'

function setMatchMedia(matcher) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: matcher(q),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}

describe('BackgroundQR.vue', () => {
  beforeEach(() => {
    global.gtag = vi.fn()
    vi.clearAllMocks()
    setMatchMedia(() => false)
  })

  async function mountReady() {
    const wrapper = mount(BackgroundQR)
    await flushPromises()
    return wrapper
  }

  it('마운트 후 QR 이미지를 렌더링한다', async () => {
    const wrapper = await mountReady()
    const img = wrapper.find('.bg-qr-img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain('data:image/png')
  })

  it('데스크톱에서 호버하면 revealed 상태가 되고 벗어나면 해제된다', async () => {
    const wrapper = await mountReady()
    const plate = wrapper.find('.bg-qr-plate')

    await plate.trigger('mouseenter')
    expect(wrapper.find('.bg-qr-layer').classes()).toContain('is-revealed')

    await plate.trigger('mouseleave')
    expect(wrapper.find('.bg-qr-layer').classes()).not.toContain('is-revealed')
  })

  it('터치 환경에서는 탭으로 reveal하고 스크림 탭으로 해제한다', async () => {
    setMatchMedia((q) => q === '(hover: none)')
    const wrapper = await mountReady()

    await wrapper.find('.bg-qr-plate').trigger('click')
    expect(wrapper.find('.bg-qr-layer').classes()).toContain('is-revealed')

    await wrapper.find('.bg-qr-scrim').trigger('click')
    expect(wrapper.find('.bg-qr-layer').classes()).not.toContain('is-revealed')
  })

  it('prefers-reduced-motion이면 reduced-motion 클래스가 붙는다', async () => {
    setMatchMedia((q) => q === '(prefers-reduced-motion: reduce)')
    const wrapper = await mountReady()
    expect(wrapper.find('.bg-qr-layer').classes()).toContain('reduced-motion')
  })

  it('QR 생성 실패 시 레이어를 렌더링하지 않는다', async () => {
    const QRCode = (await import('qrcode')).default
    QRCode.toDataURL.mockRejectedValueOnce(new Error('fail'))
    const wrapper = mount(BackgroundQR)
    await flushPromises()
    expect(wrapper.find('.bg-qr-layer').exists()).toBe(false)
  })
})
