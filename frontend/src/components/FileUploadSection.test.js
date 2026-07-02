import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileUploadSection from './FileUploadSection.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

describe('FileUploadSection', () => {
  describe('파일 선택 영역', () => {
    it('카드를 클릭하면 파일 선택 다이얼로그가 열린다', async () => {
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
