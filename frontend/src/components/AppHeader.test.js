import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  // translate.js(utils/useQRCode)가 i18n.global.t를 호출하므로 fixture에도 t를 둔다
  createI18n: () => ({ global: { locale: { value: 'ko' }, t: (key) => key } })
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

  async function openMenuQr(wrapper) {
    await wrapper.find('[data-testid="header-more-button"]').trigger('click')
    await wrapper.find('[data-testid="header-qr-menu-item"]').trigger('click')
  }

  it('헤더에는 QR 썸네일 버튼이 없다', async () => {
    const wrapper = await mountReady()
    expect(wrapper.find('.header-qr-button').exists()).toBe(false)
  })

  it('더보기 메뉴의 사이트 주소 QR 항목이 확대 모달을 열고 메뉴를 닫는다', async () => {
    const wrapper = await mountReady()
    const modal = wrapper.findComponent({ name: 'QRZoomModal' })
    expect(modal.props('isOpen')).toBe(false)
    await wrapper.find('[data-testid="header-more-button"]').trigger('click')
    expect(wrapper.find('[data-testid="header-qr-menu-item"]').text()).toContain('header.siteQr')

    await wrapper.find('[data-testid="header-qr-menu-item"]').trigger('click')

    expect(modal.props('isOpen')).toBe(true)
    expect(modal.props('qrCodeDataUrl')).toBe('data:image/png;base64,FAKEQR')
    expect(wrapper.find('[data-testid="header-more-menu"]').exists()).toBe(false)
  })

  it('마운트만으로는 이벤트를 보내지 않고, 메뉴에서 사이트 QR을 열 때 qr_open(site, source menu)을 보낸다', async () => {
    window.gtag = vi.fn()
    const wrapper = await mountReady()
    expect(window.gtag).not.toHaveBeenCalled()

    await openMenuQr(wrapper)

    expect(window.gtag).toHaveBeenCalledWith('event', 'qr_open', { qr_type: 'site', source: 'menu' })
    delete window.gtag
  })

  it('확대 모달의 close 이벤트를 받으면 닫힌다', async () => {
    const wrapper = await mountReady()
    await openMenuQr(wrapper)
    const modal = wrapper.findComponent({ name: 'QRZoomModal' })
    expect(modal.props('isOpen')).toBe(true)

    await modal.vm.$emit('close')

    expect(modal.props('isOpen')).toBe(false)
  })


  it('앱 타이틀은 접근성을 위해 실제 h1 엘리먼트로 렌더링된다', async () => {
    const wrapper = await mountReady()
    const heading = wrapper.find('h1')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe('app.title')
  })

  it('헤더는 스크롤 시 상단에 고정되도록 sticky 클래스를 갖는다', async () => {
    const wrapper = await mountReady()
    const header = wrapper.find('header')
    expect(header.classes()).toContain('sticky')
    expect(header.classes()).toContain('top-0')
    expect(header.classes()).toContain('z-40')
    expect(header.classes()).toContain('bg-surface')
  })

  it('개인정보 처리방침 링크가 ⋯ 메뉴 안에 있다', async () => {
    const wrapper = await mountReady()
    await wrapper.find('[data-testid="header-more-button"]').trigger('click')
    const link = wrapper.find('[data-testid="header-more-menu"] [data-testid="header-privacy-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('PRIVACY.md')
  })
})
