import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileUploadSection from './FileUploadSection.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

describe('FileUploadSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('공유 스코프 토글', () => {
    it('기본 스코프는 같은 네트워크(ip)이며 해당 버튼이 활성 상태로 표시된다', () => {
      const wrapper = mount(FileUploadSection, mountOptions)
      const buttons = wrapper.findAll('[role="group"] button')
      expect(buttons).toHaveLength(2)
      expect(buttons[0].attributes('aria-pressed')).toBe('true')
      expect(buttons[1].attributes('aria-pressed')).toBe('false')
    })

    it('전체 공유 버튼을 클릭하면 활성 상태가 바뀌고 localStorage에 저장된다', async () => {
      const wrapper = mount(FileUploadSection, mountOptions)
      const buttons = wrapper.findAll('[role="group"] button')

      await buttons[1].trigger('click')

      expect(buttons[1].attributes('aria-pressed')).toBe('true')
      expect(buttons[0].attributes('aria-pressed')).toBe('false')
      expect(localStorage.getItem('share-scope')).toBe('global')
    })

    it('localStorage에 저장된 마지막 선택이 마운트 시 반영된다', () => {
      localStorage.setItem('share-scope', 'global')
      const wrapper = mount(FileUploadSection, mountOptions)
      const buttons = wrapper.findAll('[role="group"] button')

      expect(buttons[1].attributes('aria-pressed')).toBe('true')
    })
  })

  describe('스코프 토글과 파일 선택 영역 분리', () => {
    it('스코프 토글 클릭은 파일 선택 다이얼로그를 열지 않는다', async () => {
      const wrapper = mount(FileUploadSection, mountOptions)
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click')

      const buttons = wrapper.findAll('[role="group"] button')
      await buttons[1].trigger('click')

      expect(clickSpy).not.toHaveBeenCalled()
      clickSpy.mockRestore()
    })

    it('카드의 다른 영역을 클릭하면 여전히 파일 선택 다이얼로그가 열린다', async () => {
      const wrapper = mount(FileUploadSection, mountOptions)
      // 실제 click()을 호출하면 happy-dom에서 <input type="file">의 클릭 이벤트가
      // 부모 div로 버블링되어 openFileDialog가 재귀 호출되므로, 구현을 비워 막는다.
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

      await wrapper.find('.cursor-pointer').trigger('click')

      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })
  })
})
