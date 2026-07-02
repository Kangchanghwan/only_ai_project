import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DownloadControls from './DownloadControls.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

function mountControls(props = {}) {
  return mount(DownloadControls, {
    props: { selectedCount: 0, totalCount: 3, allSelected: false, ...props },
    ...mountOptions
  })
}

describe('DownloadControls.vue - 하단 고정 5열 레이아웃', () => {
  it('루트 엘리먼트는 화면 하단에 고정된 5열 그리드다', () => {
    const wrapper = mountControls()
    const root = wrapper.element
    expect(root.className).toContain('fixed')
    expect(root.className).toContain('bottom-0')
    expect(root.className).toContain('z-40')
    expect(root.className).toContain('grid-cols-5')
  })

  it('버튼 5개(전체선택/다운로드/QR/선택삭제/초기화)를 렌더링한다', () => {
    const wrapper = mountControls()
    expect(wrapper.findAll('button')).toHaveLength(5)
  })

  it('선택된 파일이 없으면 다운로드/QR/선택삭제 버튼이 비활성화된다', () => {
    const wrapper = mountControls({ selectedCount: 0 })
    const buttons = wrapper.findAll('button')
    expect(buttons[1].attributes('disabled')).toBeDefined() // 다운로드
    expect(buttons[2].attributes('disabled')).toBeDefined() // QR
    expect(buttons[3].attributes('disabled')).toBeDefined() // 선택 삭제
  })

  it('전체 선택 버튼 클릭 시 toggle-select-all을 emit한다', async () => {
    const wrapper = mountControls()
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('toggle-select-all')).toBeTruthy()
  })

  it('선택된 파일이 있으면 다운로드/QR/선택삭제 버튼 클릭 시 각각의 이벤트를 emit한다', async () => {
    const wrapper = mountControls({ selectedCount: 2 })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('download-parallel')).toBeTruthy()
    await buttons[2].trigger('click')
    expect(wrapper.emitted('show-multi-qr')).toBeTruthy()
    await buttons[3].trigger('click')
    expect(wrapper.emitted('delete-selected')).toBeTruthy()
  })

  it('저장소 초기화 버튼 클릭 시 clear-storage를 emit한다', async () => {
    const wrapper = mountControls()
    await wrapper.findAll('button')[4].trigger('click')
    expect(wrapper.emitted('clear-storage')).toBeTruthy()
  })
})
