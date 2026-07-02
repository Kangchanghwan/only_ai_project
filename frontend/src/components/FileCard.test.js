import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// t()가 키를 그대로 반환하도록 mock — room.qrShareTitle처럼 로케일 파일에
// 실제 값이 없는(사전 존재하는 gap, 이번 작업 범위 밖) 키가 섞여 있어도
// 테스트가 실제 번역 문자열에 의존하지 않도록 한다 (AppHeader.test.js와 동일한 패턴).
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import FileCard from './FileCard.vue'

const file = {
  name: 'photo.png',
  roomId: 'room-shared',
  url: 'https://example.com/photo.png',
  size: 12345,
  created: '2026-01-01T00:00:00.000Z'
}

const stubs = {
  FileQRCodeModal: {
    name: 'FileQRCodeModal',
    props: ['file', 'isOpen'],
    template: '<div class="qr-modal-stub" />'
  }
}

function mountCard(props = {}) {
  return mount(FileCard, {
    props: { file, isSelected: false, ...props },
    global: { stubs }
  })
}

describe('FileCard.vue - 데스크톱 액션 버튼 행 (sm 이상)', () => {
  it('아이콘 버튼 행에는 hidden sm:flex 클래스가 있다', () => {
    const wrapper = mountCard()
    const actionsRow = wrapper.find('.file-row > div.gap-1.flex-shrink-0')
    expect(actionsRow.classes()).toContain('hidden')
    expect(actionsRow.classes()).toContain('sm:flex')
  })
})

describe('FileCard.vue - 모바일 더보기 버튼 (sm 미만)', () => {
  let wrapper

  beforeEach(() => {
    wrapper = mountCard()
  })

  it('더보기 트리거 버튼은 flex sm:hidden 클래스를 갖는다', () => {
    const trigger = wrapper.find('[aria-label="file.moreActions"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.classes()).toContain('flex')
    expect(trigger.classes()).toContain('sm:hidden')
  })

  it('더보기 버튼 클릭 시 액션 시트가 열린다', async () => {
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(true)
  })

  it('시트에서 다운로드 클릭 시 download-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-download').trigger('click')
    expect(wrapper.emitted('download-file')).toBeTruthy()
    expect(wrapper.emitted('download-file')[0]).toEqual([file])
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('시트에서 삭제 클릭 시 delete-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-delete').trigger('click')
    expect(wrapper.emitted('delete-file')).toBeTruthy()
    expect(wrapper.emitted('delete-file')[0]).toEqual([file])
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('시트에서 QR 코드 클릭 시 QR 모달이 열리고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-qr').trigger('click')
    const modal = wrapper.findComponent({ name: 'FileQRCodeModal' })
    expect(modal.props('isOpen')).toBe(true)
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('배경 클릭 시 아무 이벤트도 emit하지 않고 시트만 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet').trigger('click')
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
    expect(wrapper.emitted('download-file')).toBeFalsy()
    expect(wrapper.emitted('delete-file')).toBeFalsy()
  })
})
