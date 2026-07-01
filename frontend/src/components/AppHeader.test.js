import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: () => ({ global: { locale: { value: 'ko' } } })
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKEQR')
  }
}))

import AppHeader from './AppHeader.vue'

const stubs = {
  LanguageSelector: true,
  ThemeToggleButton: true,
  HelpModal: true
}

describe('AppHeader.vue', () => {
  beforeEach(() => {
    global.gtag = vi.fn()
    vi.clearAllMocks()
  })

  async function mountReady() {
    const wrapper = mount(AppHeader, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('마운트 시 헤더 QR 버튼에 QR 이미지를 렌더링한다', async () => {
    const wrapper = await mountReady()
    const qrButton = wrapper.find('.header-qr-button')
    expect(qrButton.exists()).toBe(true)
    const img = qrButton.find('img')
    expect(img.attributes('src')).toBe('data:image/png;base64,FAKEQR')
  })

  it('QR 버튼 클릭 시 확대 모달이 열린다', async () => {
    const wrapper = await mountReady()
    const modal = wrapper.findComponent({ name: 'QRZoomModal' })
    expect(modal.props('isOpen')).toBe(false)

    await wrapper.find('.header-qr-button').trigger('click')

    expect(modal.props('isOpen')).toBe(true)
    expect(modal.props('qrCodeDataUrl')).toBe('data:image/png;base64,FAKEQR')
  })

  it('확대 모달의 close 이벤트를 받으면 닫힌다', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.header-qr-button').trigger('click')
    const modal = wrapper.findComponent({ name: 'QRZoomModal' })
    expect(modal.props('isOpen')).toBe(true)

    await modal.vm.$emit('close')

    expect(modal.props('isOpen')).toBe(false)
  })

  it('QR 생성 실패 시 헤더 QR 버튼을 렌더링하지 않는다', async () => {
    const QRCode = (await import('qrcode')).default
    QRCode.toDataURL.mockRejectedValueOnce(new Error('fail'))
    const wrapper = mount(AppHeader, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.header-qr-button').exists()).toBe(false)
  })

  it('앱 타이틀은 접근성을 위해 실제 h1 엘리먼트로 렌더링된다', async () => {
    const wrapper = await mountReady()
    const heading = wrapper.find('h1')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe('app.title')
  })

  it('devices prop이 전달되면 ConnectedDevices가 렌더링된다', async () => {
    const devices = [
      { socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }
    ]
    const wrapper = mount(AppHeader, { props: { devices }, global: { stubs } })
    await flushPromises()

    const connectedDevices = wrapper.findComponent({ name: 'ConnectedDevices' })
    expect(connectedDevices.exists()).toBe(true)
    expect(connectedDevices.props('devices')).toEqual(devices)
  })
})
