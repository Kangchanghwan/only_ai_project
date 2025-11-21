import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationToast from './NotificationToast.vue'

describe('NotificationToast', () => {
  describe('메시지 알림', () => {
    it('메시지가 있으면 표시해야 한다', () => {
      const wrapper = mount(NotificationToast, {
        props: {
          message: '테스트 메시지'
        }
      })

      expect(wrapper.text()).toContain('테스트 메시지')
    })

    it('메시지가 없으면 표시하지 않아야 한다', () => {
      const wrapper = mount(NotificationToast, {
        props: {
          message: null
        }
      })

      expect(wrapper.find('.notification').exists()).toBe(false)
    })
  })

  describe('업로드 프로그레스 패널', () => {
    it('uploads가 있으면 업로드 패널을 표시해야 한다', () => {
      const uploads = new Map([
        ['id-1', { fileName: 'file1.png', percent: 50, status: 'uploading' }]
      ])

      const wrapper = mount(NotificationToast, {
        props: {
          message: null,
          uploads
        }
      })

      expect(wrapper.find('.upload-panel').exists()).toBe(true)
    })

    it('uploads가 비어있으면 업로드 패널을 표시하지 않아야 한다', () => {
      const wrapper = mount(NotificationToast, {
        props: {
          message: null,
          uploads: new Map()
        }
      })

      expect(wrapper.find('.upload-panel').exists()).toBe(false)
    })

    it('업로드 개수를 표시해야 한다', () => {
      const uploads = new Map([
        ['id-1', { fileName: 'file1.png', percent: 50, status: 'uploading' }],
        ['id-2', { fileName: 'file2.jpg', percent: 30, status: 'uploading' }],
        ['id-3', { fileName: 'file3.pdf', percent: 100, status: 'completed' }]
      ])

      const wrapper = mount(NotificationToast, {
        props: {
          message: null,
          uploads
        }
      })

      expect(wrapper.text()).toContain('3')
    })

    it('각 파일의 UploadProgressItem을 렌더링해야 한다', () => {
      const uploads = new Map([
        ['id-1', { fileName: 'file1.png', percent: 50, status: 'uploading' }],
        ['id-2', { fileName: 'file2.jpg', percent: 100, status: 'completed' }]
      ])

      const wrapper = mount(NotificationToast, {
        props: {
          message: null,
          uploads
        }
      })

      expect(wrapper.text()).toContain('file1.png')
      expect(wrapper.text()).toContain('file2.jpg')
    })
  })

  describe('동시 표시', () => {
    it('메시지와 업로드를 동시에 표시할 수 있어야 한다', () => {
      const uploads = new Map([
        ['id-1', { fileName: 'file1.png', percent: 50, status: 'uploading' }]
      ])

      const wrapper = mount(NotificationToast, {
        props: {
          message: '새 알림',
          uploads
        }
      })

      expect(wrapper.find('.notification').exists()).toBe(true)
      expect(wrapper.find('.upload-panel').exists()).toBe(true)
    })
  })
})
