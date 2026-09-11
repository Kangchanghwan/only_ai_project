import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { r2Service } from '../services/r2Service'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import FileCard from './FileCard.vue'

const stubs = {
  FileQRCodeModal: {
    name: 'FileQRCodeModal',
    props: ['file', 'isOpen'],
    template: '<div class="qr-modal-stub" />'
  }
}

const imageFile = {
  name: 'photo.png',
  roomId: 'room-shared',
  url: 'https://store.example/room-shared/photo.png',
  size: 5 * 1024 * 1024,
  created: '2026-01-01T00:00:00.000Z'
}

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

function mountCard(file) {
  wrapper = mount(FileCard, { props: { file, isSelected: false }, global: { stubs } })
  return wrapper
}

describe('FileCard.vue - 이미지 썸네일', () => {
  it('이미지 미리보기는 원본이 아니라 썸네일 URL을 사용한다', () => {
    const img = mountCard(imageFile).find('img')

    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(r2Service.getThumbUrl('room-shared', 'photo.png'))
    expect(img.attributes('src')).not.toBe(imageFile.url)
  })

  it('디코딩을 비동기로 하고 크기를 예약해 레이아웃 이동을 막는다', () => {
    const img = mountCard(imageFile).find('img')

    expect(img.attributes('decoding')).toBe('async')
    expect(img.attributes('loading')).toBe('lazy')
    expect(img.attributes('width')).toBeTruthy()
    expect(img.attributes('height')).toBeTruthy()
  })

  it('썸네일 로드에 실패하면 원본 URL로 한 번 폴백하고 다시 실패해도 멈춘다', async () => {
    const card = mountCard(imageFile)
    const img = card.find('img')

    await img.trigger('error')
    expect(card.find('img').attributes('src')).toBe(imageFile.url)

    await card.find('img').trigger('error')
    expect(card.find('img').attributes('src')).toBe(imageFile.url)
  })

  it('파일 객체에 thumbUrl이 있으면 그것을 우선 사용한다', () => {
    const img = mountCard({ ...imageFile, thumbUrl: 'https://store.example/custom-thumb.jpg' }).find('img')

    expect(img.attributes('src')).toBe('https://store.example/custom-thumb.jpg')
  })

  it('roomId가 없는 이미지는 원본 URL을 그대로 사용한다', () => {
    const { roomId, ...noRoom } = imageFile
    const img = mountCard(noRoom).find('img')

    expect(img.attributes('src')).toBe(imageFile.url)
  })

  it('이미지가 아닌 파일은 img를 렌더링하지 않는다', () => {
    const card = mountCard({ ...imageFile, name: 'notes.pdf' })

    expect(card.find('img').exists()).toBe(false)
  })
})
