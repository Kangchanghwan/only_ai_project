import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'

// 하위 컴포넌트 스텁
const stubs = {
  AppHeader: {
    name: 'AppHeader',
    template: '<div class="app-header-stub"><slot /></div>',
    props: ['userCount', 'isConnecting']
  },
  ShareScopeTabs: {
    name: 'ShareScopeTabs',
    template: '<div class="share-scope-tabs-stub"></div>',
    props: ['scope', 'ipDevices', 'globalDevices'],
    emits: ['select']
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
  },
  AppFooter: {
    name: 'AppFooter',
    template: '<div class="app-footer-stub"></div>'
  }
}

describe('RoomScreen.vue', () => {
  const defaultProps = {
    roomId: 'room-shared',
    files: [],
    texts: [],
    isLoading: false,
    userCount: 1,
    isConnecting: false,
    scope: 'ip',
    ipRoomDevices: [],
    globalRoomDevices: []
  }

  describe('컴포넌트 렌더링', () => {
    it('모든 하위 컴포넌트가 렌더링되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      expect(wrapper.find('.app-header-stub').exists()).toBe(true)
      expect(wrapper.find('.file-gallery-stub').exists()).toBe(true)
      expect(wrapper.find('.text-share-box-stub').exists()).toBe(true)
    })

    it('props가 하위 컴포넌트에 올바르게 전달되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          userCount: 5,
          isConnecting: true
        },
        global: { plugins: [i18n], stubs }
      })

      const appHeader = wrapper.findComponent({ name: 'AppHeader' })
      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })

      expect(appHeader.props('userCount')).toBe(5)
      expect(appHeader.props('isConnecting')).toBe(true)
      expect(fileGallery.props('isLoading')).toBe(false)
    })

    it('ShareScopeTabs가 렌더링되고 scope/기기 목록 props를 전달받는다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, scope: 'global', ipRoomDevices: [{ socketId: 'a' }], globalRoomDevices: [{ socketId: 'b' }] },
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findComponent({ name: 'ShareScopeTabs' })
      expect(tabs.exists()).toBe(true)
      expect(tabs.props('scope')).toBe('global')
      expect(tabs.props('ipDevices')).toEqual([{ socketId: 'a' }])
      expect(tabs.props('globalDevices')).toEqual([{ socketId: 'b' }])
    })
  })

  describe('이벤트 전파', () => {
    it('FileGallery에서 copy-image 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
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
        global: { plugins: [i18n], stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-file', file)

      expect(wrapper.emitted()).toHaveProperty('download-file')
      expect(wrapper.emitted('download-file')[0][0]).toEqual(file)
    })

    it('FileGallery에서 download-parallel 이벤트가 전파되어야 한다', async () => {
      const files = [{ name: 'test.png', url: 'https://example.com/test.png' }]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('download-parallel', files)

      expect(wrapper.emitted()).toHaveProperty('download-parallel')
      expect(wrapper.emitted('download-parallel')[0][0]).toEqual(files)
    })

    it('FileGallery에서 copy-selected-to-clipboard 이벤트가 전파되어야 한다', async () => {
      const files = [{ name: 'test.png', url: 'https://example.com/test.png' }]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
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
        global: { plugins: [i18n], stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('upload-files', files)

      expect(wrapper.emitted()).toHaveProperty('upload-files')
      expect(wrapper.emitted('upload-files')[0][0]).toEqual(files)
    })

    it('TextShareBox에서 remove-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('remove-text', 'text-id-123')

      expect(wrapper.emitted()).toHaveProperty('remove-text')
      expect(wrapper.emitted('remove-text')[0][0]).toBe('text-id-123')
    })

    it('TextShareBox에서 clear-all 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('clear-all')

      expect(wrapper.emitted()).toHaveProperty('clear-all-texts')
    })

    it('TextShareBox에서 copy-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      await textShareBox.vm.$emit('copy-text', 'text-id-456')

      expect(wrapper.emitted()).toHaveProperty('copy-text')
      expect(wrapper.emitted('copy-text')[0][0]).toBe('text-id-456')
    })

    it('ShareScopeTabs에서 select 이벤트가 select-scope로 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findComponent({ name: 'ShareScopeTabs' })
      await tabs.vm.$emit('select', 'global')

      expect(wrapper.emitted('select-scope')).toBeTruthy()
      expect(wrapper.emitted('select-scope')[0]).toEqual(['global'])
    })

  })

  describe('Props 변경', () => {
    it('files props가 FileGallery에 전달되어야 한다', () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png', created: new Date().toISOString() }
      ]
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, files },
        global: { plugins: [i18n], stubs }
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
        global: { plugins: [i18n], stubs }
      })

      const textShareBox = wrapper.findComponent({ name: 'TextShareBox' })
      expect(textShareBox.props('texts')).toEqual(texts)
    })

    it('isLoading props가 FileGallery에 전달되어야 한다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, isLoading: true },
        global: { plugins: [i18n], stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      expect(fileGallery.props('isLoading')).toBe(true)
    })
  })

  describe('모바일 파일/텍스트 탭 전환', () => {
    it('기본값은 파일 탭이며 파일 섹션만 보이고 텍스트 섹션은 숨겨진다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const sections = wrapper.findAll('section')
      expect(sections).toHaveLength(2)
      expect(sections[0].classes()).not.toContain('hidden')
      expect(sections[1].classes()).toContain('hidden')
    })

    it('role=tablist와 role=tab 버튼 2개를 렌더링한다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
    })

    it('텍스트 탭 클릭 시 텍스트 섹션이 보이고 파일 섹션은 숨겨진다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      await tabs[1].trigger('click')

      const sections = wrapper.findAll('section')
      expect(sections[0].classes()).toContain('hidden')
      expect(sections[1].classes()).not.toContain('hidden')
      expect(tabs[1].attributes('aria-selected')).toBe('true')
      expect(tabs[0].attributes('aria-selected')).toBe('false')
    })

    it('텍스트 탭으로 전환 후 파일 탭을 다시 클릭하면 파일 섹션이 다시 보인다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      await tabs[1].trigger('click')
      await tabs[0].trigger('click')

      const sections = wrapper.findAll('section')
      expect(sections[0].classes()).not.toContain('hidden')
      expect(sections[1].classes()).toContain('hidden')
    })

    it('탭 라벨에 파일/텍스트 개수가 표시된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          files: [{ name: 'a.png', roomId: 'room-shared', url: 'https://example.com/a.png' }],
          texts: [
            { id: '1', content: 'hi', timestamp: Date.now() },
            { id: '2', content: 'yo', timestamp: Date.now() }
          ]
        },
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs[0].text()).toContain('1')
      expect(tabs[1].text()).toContain('2')
    })
  })

  describe('하단 고정 액션바 여백', () => {
    it('파일이 있으면 루트 컨테이너에 pb-24가 적용된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          files: [{ name: 'a.png', roomId: 'room-shared', url: 'https://example.com/a.png', size: 1, created: '2026-01-01T00:00:00.000Z' }]
        },
        global: { plugins: [i18n], stubs }
      })
      expect(wrapper.element.className).toContain('pb-24')
      expect(wrapper.element.className).not.toContain('pb-6')
    })

    it('파일이 없으면 pb-6을 유지하고 pb-24는 적용하지 않는다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })
      expect(wrapper.element.className).toContain('pb-6')
      expect(wrapper.element.className).not.toContain('pb-24')
    })

    it('파일이 있어도 로딩 중이면 액션바가 렌더링되지 않으므로 pb-6을 유지한다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          files: [{ name: 'a.png', roomId: 'room-shared', url: 'https://example.com/a.png', size: 1, created: '2026-01-01T00:00:00.000Z' }],
          isLoading: true
        },
        global: { plugins: [i18n], stubs }
      })
      expect(wrapper.element.className).toContain('pb-6')
      expect(wrapper.element.className).not.toContain('pb-24')
    })
  })
})
