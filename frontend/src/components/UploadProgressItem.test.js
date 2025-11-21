import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UploadProgressItem from './UploadProgressItem.vue'

describe('UploadProgressItem', () => {
  describe('렌더링', () => {
    it('파일명을 표시해야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain('test.png')
    })

    it('진행률을 표시해야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 75,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain('75%')
    })

    it('프로그레스 바가 있어야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'uploading'
        }
      })

      expect(wrapper.find('.progress-bar').exists()).toBe(true)
      expect(wrapper.find('.progress-fill').exists()).toBe(true)
    })

    it('프로그레스 바 너비가 진행률에 맞아야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 60,
          status: 'uploading'
        }
      })

      const progressFill = wrapper.find('.progress-fill')
      expect(progressFill.attributes('style')).toContain('width: 60%')
    })
  })

  describe('상태 표시', () => {
    it('uploading 상태일 때 진행률을 표시해야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain('50%')
      expect(wrapper.text()).not.toContain('✓')
      expect(wrapper.text()).not.toContain('✗')
    })

    it('completed 상태일 때 체크 표시를 해야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 100,
          status: 'completed'
        }
      })

      expect(wrapper.text()).toContain('✓')
    })

    it('failed 상태일 때 X 표시를 해야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'failed'
        }
      })

      expect(wrapper.text()).toContain('✗')
    })

    it('상태에 따라 적절한 CSS 클래스가 적용되어야 한다', () => {
      const uploadingWrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'uploading'
        }
      })
      expect(uploadingWrapper.find('.progress-fill').classes()).toContain('uploading')

      const completedWrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 100,
          status: 'completed'
        }
      })
      expect(completedWrapper.find('.progress-fill').classes()).toContain('completed')

      const failedWrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 50,
          status: 'failed'
        }
      })
      expect(failedWrapper.find('.progress-fill').classes()).toContain('failed')
    })
  })

  describe('긴 파일명 처리', () => {
    it('긴 파일명도 렌더링되어야 한다', () => {
      const longFileName = 'very-long-file-name-that-might-overflow-the-container.png'
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: longFileName,
          percent: 50,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain(longFileName)
    })
  })

  describe('props 기본값', () => {
    it('percent가 0일 때도 정상적으로 렌더링되어야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 0,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain('0%')
      const progressFill = wrapper.find('.progress-fill')
      expect(progressFill.attributes('style')).toContain('width: 0%')
    })

    it('percent가 100일 때도 정상적으로 렌더링되어야 한다', () => {
      const wrapper = mount(UploadProgressItem, {
        props: {
          fileName: 'test.png',
          percent: 100,
          status: 'uploading'
        }
      })

      expect(wrapper.text()).toContain('100%')
      const progressFill = wrapper.find('.progress-fill')
      expect(progressFill.attributes('style')).toContain('width: 100%')
    })
  })
})
