import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'

// 하위 컴포넌트 스텁
const stubs = {
  AppHeader: {
    name: 'AppHeader',
    template: '<div class="app-header-stub"><slot /></div>',
    props: ['userCount', 'isConnecting']
  },
  RoomInfo: {
    name: 'RoomInfo',
    template: '<div class="room-info-stub"></div>',
    props: ['roomId', 'isConnecting'],
    emits: ['copy-room-code', 'join-other-room']
  },
  FileGallery: {
    name: 'FileGallery',
    template: '<div class="file-gallery-stub"></div>',
    props: ['files', 'isLoading'],
    emits: ['copy-image', 'download-file', 'download-selected', 'download-parallel', 'download-all', 'copy-selected-to-clipboard', 'upload-files']
  },
  TextShareBox: {
    name: 'TextShareBox',
    template: '<div class="text-share-box-stub"></div>',
    props: ['texts'],
    emits: ['remove-text', 'clear-all', 'copy-text']
  }
}

describe('RoomScreen.vue', () => {
  const defaultProps = {
    roomId: 'TEST123',
    files: [],
    texts: [],
    isLoading: false,
    userCount: 1,
    isConnecting: false
  }

  describe('컴포넌트 렌더링', () => {
    it('모든 하위 컴포넌트가 렌더링되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      expect(wrapper.find('.app-header-stub').exists()).toBe(true)
      expect(wrapper.find('.room-info-stub').exists()).toBe(true)
      expect(wrapper.find('.file-gallery-stub').exists()).toBe(true)
      expect(wrapper.find('.text-share-box-stub').exists()).toBe(true)
    })

    it('props가 하위 컴포넌트에 올바르게 전달되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          roomId: 'ROOM456',
          userCount: 5,
          isConnecting: true
        },
        global: { stubs }
      })

      const appHeader = wrapper.findComponent({ name: 'AppHeader' })
      const roomInfo = wrapper.findComponent({ name: 'RoomInfo' })
      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })

      expect(appHeader.props('userCount')).toBe(5)
      expect(appHeader.props('isConnecting')).toBe(true)
      expect(roomInfo.props('roomId')).toBe('ROOM456')
      expect(fileGallery.props('isLoading')).toBe(false)
    })
  })

  describe('이벤트 전파', () => {
    it('RoomInfo에서 copy-room-code 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const roomInfo = wrapper.findComponent({ name: 'RoomInfo' })
      await roomInfo.vm.$emit('copy-room-code')

      expect(wrapper.emitted()).toHaveProperty('copy-room-code')
    })

    it('RoomInfo에서 join-other-room 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const roomInfo = wrapper.findComponent({ name: 'RoomInfo' })
      await roomInfo.vm.$emit('join-other-room', 'NEW456')

      expect(wrapper.emitted()).toHaveProperty('join-other-room')
      expect(wrapper.emitted('join-other-room')[0][0]).toBe('NEW456')
    })

    it('FileGallery에서 copy-image 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('copy-image', 'https://example.com/image.png')

      expect(wrapper.emitted()).toHaveProperty('copy-image')
      expect(wrapper.emitted('copy-image')[0][0]).toBe('https://example.com/image.png')
    })

    it('FileGallery에서 download-file 이벤트가 전파되어야 한다', async () => {
      const file = { name: 'test.png', url: 'https://example.com/test.png' }
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-file', file)

      expect(wrapper.emitted()).toHaveProperty('download-file')
      expect(wrapper.emitted('download-file')[0][0]).toEqual(file)
    })

    it('FileGallery에서 download-selected 이벤트가 전파되어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.png', url: 'https://example.com/test2.png' }
      ]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-selected', files)

      expect(wrapper.emitted()).toHaveProperty('download-selected')
      expect(wrapper.emitted('download-selected')[0][0]).toEqual(files)
    })

    it('FileGallery에서 download-parallel 이벤트가 전파되어야 한다', async () => {
      const files = [{ name: 'test.png', url: 'https://example.com/test.png' }]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-parallel', files)

      expect(wrapper.emitted()).toHaveProperty('download-parallel')
      expect(wrapper.emitted('download-parallel')[0][0]).toEqual(files)
    })

    it('FileGallery에서 download-all 이벤트가 전파되어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' }
      ]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-all', files)

      expect(wrapper.emitted()).toHaveProperty('download-all')
      expect(wrapper.emitted('download-all')[0][0]).toEqual(files)
    })

    it('FileGallery에서 copy-selected-to-clipboard 이벤트가 전파되어야 한다', async () => {
      const files = [{ name: 'test.png', url: 'https://example.com/test.png' }]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('copy-selected-to-clipboard', files)

      expect(wrapper.emitted()).toHaveProperty('copy-selected-to-clipboard')
      expect(wrapper.emitted('copy-selected-to-clipboard')[0][0]).toEqual(files)
    })

    it('FileGallery에서 upload-files 이벤트가 전파되어야 한다', async () => {
      const files = [new File(['test'], 'test.png', { type: 'image/png' })]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('upload-files', files)

      expect(wrapper.emitted()).toHaveProperty('upload-files')
      expect(wrapper.emitted('upload-files')[0][0]).toEqual(files)
    })

    it('TextShareBox에서 remove-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('remove-text', 'text-id-123')

      expect(wrapper.emitted()).toHaveProperty('remove-text')
      expect(wrapper.emitted('remove-text')[0][0]).toBe('text-id-123')
    })

    it('TextShareBox에서 clear-all 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('clear-all')

      expect(wrapper.emitted()).toHaveProperty('clear-all-texts')
    })

    it('TextShareBox에서 copy-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('copy-text', 'text-id-456')

      expect(wrapper.emitted()).toHaveProperty('copy-text')
      expect(wrapper.emitted('copy-text')[0][0]).toBe('text-id-456')
    })
  })

  describe('Props 변경', () => {
    it('files props가 FileGallery에 전달되어야 한다', () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png', created: new Date().toISOString() }
      ]
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, files },
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      expect(fileGallery.props('files')).toEqual(files)
    })

    it('texts props가 TextShareBox에 전달되어야 한다', () => {
      const texts = [
        { id: '1', content: 'Hello', timestamp: Date.now() }
      ]
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, texts },
        global: { stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      expect(textShareBox.props('texts')).toEqual(texts)
    })

    it('isLoading props가 FileGallery에 전달되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, isLoading: true },
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      expect(fileGallery.props('isLoading')).toBe(true)
    })
  })
})
