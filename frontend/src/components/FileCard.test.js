import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'

// t()가 키를 그대로 반환하도록 mock — room.qrShareTitle처럼 로케일 파일에
// 실제 값이 없는(사전 존재하는 gap, 이번 작업 범위 밖) 키가 섞여 있어도
// 테스트가 실제 번역 문자열에 의존하지 않도록 한다 (AppHeader.test.js와 동일한 패턴).
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
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

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

function mountCard(props = {}) {
  wrapper = mount(FileCard, {
    props: { file, isSelected: false, ...props },
    global: { stubs }
  })
  return wrapper
}

// 액션 시트는 Teleport로 document.body에 직접 렌더링되므로 wrapper.find()로는 찾을 수 없다
// (wrapper.find는 마운트된 컴포넌트 자신의 DOM 서브트리 안에서만 검색한다).
// document.body를 직접 쿼리하고 DOMWrapper로 감싸서 VTU의 find/trigger API를 그대로 사용한다.
function findSheet() {
  const el = document.body.querySelector('.file-actions-sheet')
  return el ? new DOMWrapper(el) : null
}

describe('FileCard.vue - 받기(primary)와 더보기(secondary)', () => {
  it('행 전체 클릭으로 복사하지 않고, 받기 버튼은 항상 보이며 44px 터치 영역을 가진다', async () => {
    const wrapper = mountCard()
    await wrapper.find('.file-row').trigger('click')
    expect(wrapper.emitted('copy-image')).toBeFalsy()
    const receive = wrapper.find('[data-testid="file-receive"]')
    expect(receive.classes()).toContain('min-h-[44px]')
    await receive.trigger('click')
    expect(wrapper.emitted('download-file')[0]).toEqual([file])
  })

  it('2행은 "보낸 사람 · 용량 · 시간"이며 시간은 한 번만 나온다', () => {
    const wrapper = mountCard()
    const meta = wrapper.find('[data-testid="file-meta"]')
    expect(meta.exists()).toBe(true)
    expect(meta.findAll('span.whitespace-nowrap')).toHaveLength(2)
  })

  it('메타 줄은 줄바꿈/overflow-hidden으로 받기 버튼 영역을 침범하지 않고, 액션은 shrink-0이다', () => {
    const wrapper = mountCard()
    const meta = wrapper.find('[data-testid="file-meta"]')
    expect(meta.classes()).toContain('flex-wrap')
    expect(meta.classes()).toContain('overflow-hidden')
    expect(wrapper.find('.file-row').classes()).toContain('flex-wrap')
    expect(wrapper.find('.file-row').classes()).toContain('sm:flex-nowrap')
    expect(wrapper.find('.file-actions').classes()).toContain('shrink-0')
    expect(meta.classes()).toContain('min-w-0')
    expect(wrapper.find('[data-testid="file-receive"]').classes()).toContain('shrink-0')
    expect(wrapper.find('.more-btn').classes()).toContain('shrink-0')
  })
})

describe('FileCard.vue - 더보기 메뉴', () => {
  beforeEach(() => {
    mountCard()
  })

  it('더보기 트리거는 모든 폭에서 보이며 44px(w-11 h-11)이다', () => {
    const trigger = wrapper.find('[aria-label="file.moreActions"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.classes()).toContain('w-11')
    expect(trigger.classes()).toContain('h-11')
    expect(trigger.classes()).not.toContain('sm:hidden')
  })

  it('더보기 버튼 클릭 시 액션 시트가 열린다', async () => {
    expect(findSheet()).toBe(null)
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    expect(findSheet()).not.toBe(null)
  })

  it('시트에서 다운로드 클릭 시 download-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await findSheet().find('.sheet-download').trigger('click')
    expect(wrapper.emitted('download-file')).toBeTruthy()
    expect(wrapper.emitted('download-file')[0]).toEqual([file])
    expect(findSheet()).toBe(null)
  })

  it('시트에서 삭제 클릭 시 delete-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await findSheet().find('.sheet-delete').trigger('click')
    expect(wrapper.emitted('delete-file')).toBeTruthy()
    expect(wrapper.emitted('delete-file')[0]).toEqual([file])
    expect(findSheet()).toBe(null)
  })

  it('시트에서 QR 코드 클릭 시 QR 모달이 열리고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await findSheet().find('.sheet-qr').trigger('click')
    const modal = wrapper.findComponent({ name: 'FileQRCodeModal' })
    expect(modal.props('isOpen')).toBe(true)
    expect(findSheet()).toBe(null)
  })

  it('파일 QR을 열 때 qr_open(file) 이벤트를 보낸다', async () => {
    window.gtag = vi.fn()
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await findSheet().find('.sheet-qr').trigger('click')
    expect(window.gtag).toHaveBeenCalledWith('event', 'qr_open', { qr_type: 'file' })
    delete window.gtag
  })

  it('배경 클릭 시 아무 이벤트도 emit하지 않고 시트만 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await findSheet().trigger('click')
    expect(findSheet()).toBe(null)
    expect(wrapper.emitted('download-file')).toBeFalsy()
    expect(wrapper.emitted('delete-file')).toBeFalsy()
  })
})
