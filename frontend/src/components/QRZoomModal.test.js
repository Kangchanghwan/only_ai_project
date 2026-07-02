import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QRZoomModal from './QRZoomModal.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

describe('QRZoomModal.vue', () => {
  it('isOpen이 false면 아무것도 렌더링하지 않는다', () => {
    const wrapper = mount(QRZoomModal, {
      props: { isOpen: false, qrCodeDataUrl: 'data:image/png;base64,FAKEQR' },
      ...mountOptions
    })
    expect(wrapper.find('.qr-zoom-overlay').exists()).toBe(false)
  })

  it('isOpen이 true면 QR 이미지를 렌더링한다', () => {
    const wrapper = mount(QRZoomModal, {
      props: { isOpen: true, qrCodeDataUrl: 'data:image/png;base64,FAKEQR' },
      ...mountOptions
    })
    const img = wrapper.find('.qr-zoom-image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,FAKEQR')
  })

  it('닫기 버튼 클릭 시 close를 emit한다', async () => {
    const wrapper = mount(QRZoomModal, {
      props: { isOpen: true, qrCodeDataUrl: 'data:image/png;base64,FAKEQR' },
      ...mountOptions
    })
    await wrapper.find('.qr-zoom-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('배경(오버레이) 클릭 시 close를 emit한다', async () => {
    const wrapper = mount(QRZoomModal, {
      props: { isOpen: true, qrCodeDataUrl: 'data:image/png;base64,FAKEQR' },
      ...mountOptions
    })
    await wrapper.find('.qr-zoom-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('모달 내부(카드) 클릭으로는 close가 emit되지 않는다', async () => {
    const wrapper = mount(QRZoomModal, {
      props: { isOpen: true, qrCodeDataUrl: 'data:image/png;base64,FAKEQR' },
      ...mountOptions
    })
    await wrapper.find('.qr-zoom-card').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
