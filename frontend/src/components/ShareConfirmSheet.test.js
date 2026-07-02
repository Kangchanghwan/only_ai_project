import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import ShareConfirmSheet from './ShareConfirmSheet.vue'

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

function mountSheet(props = {}) {
  wrapper = mount(ShareConfirmSheet, {
    props: { isOpen: true, fileCount: 0, hasText: false, ...props }
  })
  return wrapper
}

// Teleport로 document.body에 렌더링되므로 wrapper.find()로는 찾을 수 없다 (FileCard.test.js와 동일한 패턴).
function findSheet() {
  const el = document.body.querySelector('.share-confirm-sheet')
  return el ? new DOMWrapper(el) : null
}

describe('ShareConfirmSheet', () => {
  it('isOpen이 false면 시트를 렌더링하지 않는다', () => {
    mountSheet({ isOpen: false })
    expect(findSheet()).toBe(null)
  })

  it('isOpen이 true면 시트를 렌더링한다', () => {
    mountSheet({ isOpen: true })
    expect(findSheet()).not.toBe(null)
  })

  it('파일만 있으면 titleFiles 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 2, hasText: false })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleFiles')
  })

  it('텍스트만 있으면 titleText 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 0, hasText: true })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleText')
  })

  it('파일과 텍스트가 모두 있으면 titleFilesAndText 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 2, hasText: true })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleFilesAndText')
  })

  it('기본 선택은 항상 같은 네트워크(ip)이며 coral 스타일이 적용된다', () => {
    mountSheet({ fileCount: 1 })
    const ipButton = findSheet().findAll('button')[0]
    expect(ipButton.classes()).toContain('border-primary')
  })

  it('전체 공유 옵션을 클릭하면 선택이 global로 바뀐다', async () => {
    mountSheet({ fileCount: 1 })
    const globalButton = findSheet().findAll('button')[1]
    await globalButton.trigger('click')
    expect(globalButton.classes()).toContain('border-scope-global')
  })

  it('공유하기 클릭 시 현재 선택된 scope와 함께 confirm을 emit한다', async () => {
    mountSheet({ fileCount: 1 })
    await findSheet().findAll('button')[1].trigger('click') // 전체 공유로 전환
    const confirmButton = findSheet().findAll('button')
      .find((b) => b.text() === 'shareTargetConfirm.confirm')
    await confirmButton.trigger('click')

    expect(wrapper.emitted('confirm')).toBeTruthy()
    expect(wrapper.emitted('confirm')[0]).toEqual(['global'])
  })

  it('취소 클릭 시 cancel만 emit하고 confirm은 emit하지 않는다', async () => {
    mountSheet({ fileCount: 1 })
    const cancelButton = findSheet().findAll('button')
      .find((b) => b.text() === 'shareTargetConfirm.cancel')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('배경 클릭 시 cancel을 emit한다', async () => {
    mountSheet({ fileCount: 1 })
    await findSheet().trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('다시 열릴 때(isOpen false→true) 선택이 항상 ip로 초기화된다', async () => {
    mountSheet({ fileCount: 1, isOpen: true })
    await findSheet().findAll('button')[1].trigger('click') // global 선택
    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true })

    const reopenedIpButton = findSheet().findAll('button')[0]
    expect(reopenedIpButton.classes()).toContain('border-primary')
  })
})
