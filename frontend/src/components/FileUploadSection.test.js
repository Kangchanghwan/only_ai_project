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

  describe('크기 상태', () => {
    it('파일이 없으면(기본) 큰 드롭 영역: 제목·큰 버튼·한도 안내가 보인다', () => {
      const w = mount(FileUploadSection, mountOptions)
      const zone = w.find('[data-testid="upload-dropzone"]')
      expect(zone.attributes('data-state')).toBe('big')
      expect(zone.classes()).toContain('sm:min-h-[300px]')
      expect(w.find('[data-testid="upload-heading"]').text()).toContain('끌어다 놓으세요')
      expect(w.find('[data-testid="choose-files"]').classes()).toContain('min-h-[52px]')
      expect(w.find('[data-testid="upload-limit"]').exists()).toBe(true)
    })

    it('compact면 한 줄 막대: 힌트 + 파일 선택, 큰 제목/한도 줄은 없다', () => {
      const w = mount(FileUploadSection, { ...mountOptions, props: { compact: true } })
      const zone = w.find('[data-testid="upload-dropzone"]')
      expect(zone.attributes('data-state')).toBe('compact')
      expect(zone.classes()).toContain('min-h-[56px]')
      expect(w.find('[data-testid="upload-compact-hint"]').classes()).toContain('truncate')
      expect(w.find('[data-testid="choose-files"]').exists()).toBe(true)
      expect(w.find('[data-testid="upload-heading"]').exists()).toBe(false)
      expect(w.find('[data-testid="upload-limit"]').exists()).toBe(false)
    })

    it('compact에서도 슬롯(붙여넣기)은 유지되고 파일 선택이 열린다', async () => {
      const w = mount(FileUploadSection, { ...mountOptions, props: { compact: true }, slots: { default: '<button data-testid="slot-btn">p</button>' } })
      expect(w.find('[data-testid="slot-btn"]').exists()).toBe(true)
      const spy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
      await w.find('[data-testid="choose-files"]').trigger('click')
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})
