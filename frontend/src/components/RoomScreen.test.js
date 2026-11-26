import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RoomScreen from './RoomScreen.vue'
import i18n from '../i18n/index.js'
import { createI18n } from 'vue-i18n'
import koMsgs from '../i18n/locales/ko.json'
import enMsgs from '../i18n/locales/en.json'

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
    props: ['scope'],
    emits: ['select']
  },
  FileGallery: {
    name: 'FileGallery',
    template: '<div class="file-gallery-stub"><slot name="composer" /></div>',
    props: ['files', 'texts', 'isLoading'],
    emits: ['copy-image', 'download-file', 'download-selected', 'download-parallel', 'download-all', 'copy-selected-to-clipboard', 'upload-files', 'remove-text', 'clear-all-texts', 'copy-text']
  },
  TextShareBox: {
    name: 'TextShareBox',
    template: '<div class="text-share-box-stub"></div>',
    props: ['scope'],
    emits: ['share-text', 'upload-files', 'paste-content']
  },
  AppFooter: {
    name: 'AppFooter',
    template: '<div class="app-footer-stub"></div>'
  },
  LandingContent: {
    name: 'LandingContent',
    template: '<div class="landing-content-stub"></div>'
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

  describe('같은 네트워크 탭의 QR 줄', () => {
    const me = { socketId: 'me', identity: { adj: 1, animal: 1, suffix: 0 } }
    const other = { socketId: 'o1', identity: { adj: 2, animal: 2, suffix: 0 } }
    const ipWake = (w) => w.findAll('[data-testid="room-wake-qr-toggle"]').filter((b) => b.text() === 'QR로 휴대폰 연결하기')
    it('다른 기기가 있으면 접힌 QR 줄을 보이고, 혼자면(빈 화면 QR이 있으면) 숨긴다', async () => {
      i18n.global.locale.value = 'ko'
      const w = mount(RoomScreen, { props: { ...defaultProps, mySocketId: 'me', myIdentity: me.identity, ipRoomDevices: [me, other] }, global: { plugins: [i18n], stubs } })
      expect(ipWake(w).length).toBe(1)
      await w.setProps({ ipRoomDevices: [me] })
      expect(ipWake(w).length).toBe(0)
      await w.setProps({ ipRoomDevices: [me, other], scope: 'global' })
      expect(ipWake(w).length).toBe(0)
    })
  })

  describe('도움말 창 안의 안내·소개·푸터', () => {
    it('more-info 블록은 더 이상 없고 안내·랜딩·푸터는 AppHeader 슬롯으로 전달된다', () => {
      const w = mount(RoomScreen, { props: defaultProps, global: { plugins: [i18n], stubs } })
      expect(w.find('[data-testid="more-info"]').exists()).toBe(false)
      const h = w.find('.app-header-stub')
      expect(h.find('[data-testid="usage-notes"]').exists()).toBe(false)
      expect(h.find('[data-testid="landing-separator"]').exists()).toBe(true)
      expect(h.find('.app-footer-stub').exists()).toBe(true)
    })

    it('모달이 닫혀 있어도 landing-content·FAQ·푸터 링크가 DOM에 있고 숨겨져 있다가 ?를 누르면 보인다', async () => {
      const koI18n = createI18n({ legacy: false, locale: 'ko', fallbackLocale: 'en', messages: { ko: koMsgs, en: enMsgs } })
      const w = mount(RoomScreen, {
        props: defaultProps,
        attachTo: document.body,
        global: { plugins: [koI18n], stubs: { ...stubs, AppHeader: false, AppFooter: false, LandingContent: false } }
      })
      const modal = () => document.body.querySelector('[data-testid="help-modal"]')
      expect(modal()).not.toBeNull()
      const overlay = modal().parentElement
      expect(overlay.style.display).toBe('none')
      expect(modal().querySelector('[data-testid="landing-content"]')).not.toBeNull()
      expect(modal().querySelector('[data-testid="help-section-keep"]')).not.toBeNull()
      expect(modal().querySelector('[data-testid="feedback-link"]')).not.toBeNull()
      expect(document.body.innerHTML).toContain(koI18n.global.t('landing.faqTitle'))
      expect(document.body.querySelector('[data-testid="more-info"]')).toBeNull()

      await w.find('button[aria-label="' + koI18n.global.t('app.help') + '"]').trigger('click')
      expect(overlay.style.display).not.toBe('none')
      w.unmount()
    })
  })

  describe('방·기기 줄', () => {
    const mountScope = (scope, extra = {}) => mount(RoomScreen, {
      props: { ...defaultProps, scope, ...extra },
      global: { plugins: [i18n], stubs }
    })

    it('방 탭 줄(위)과 기기 줄(아래)이 나뉘어 있고 왼쪽 기기 패널(device-panel)은 없다', () => {
      const w = mountScope('ip', { ipRoomDevices: [{ socketId: 'a', browser: 'x', os: 'y' }] })
      const row = w.find('[data-testid="room-row"]')
      expect(row.find('.share-scope-tabs-stub').exists()).toBe(true)
      expect(row.find('[data-testid="connection-card"]').exists()).toBe(false)
      expect(w.find('[data-testid="device-row"] [data-testid="connection-card"]').exists()).toBe(true)
      expect(w.find('[data-testid="device-panel"]').exists()).toBe(false)
    })

    it('같은 네트워크면 ipNotice 한 줄이 항상 보인다', () => {
      const w = mountScope('ip')
      expect(w.find('[data-testid="ip-notice"]').text()).toContain('같은 네트워크를 쓰는 다른 사람도 볼 수 있어요')
    })

    it('전체 공유면 경고 박스만 보이고 ipNotice 줄은 없다', () => {
      const w = mountScope('global')
      expect(w.find('[data-testid="global-warning"]').exists()).toBe(true)
      expect(w.find('[data-testid="ip-notice"]').exists()).toBe(false)
    })
  })

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

    it('ShareScopeTabs가 렌더링되고 scope props를 전달받는다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, scope: 'global' },
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findComponent({ name: 'ShareScopeTabs' })
      expect(tabs.exists()).toBe(true)
      expect(tabs.props('scope')).toBe('global')
    })

    it('LandingContent가 렌더링되어야 한다', () => {
      const wrapper = mount(RoomScreen, { props: defaultProps, global: { plugins: [i18n], stubs } })
      expect(wrapper.find('.landing-content-stub').exists()).toBe(true)
    })
  })

  describe('연결된 기기 카드', () => {
    it('현재 scope가 ip이면 ipRoomDevices가 DeviceCards에 전달된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          scope: 'ip',
          ipRoomDevices: [{ socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }],
          globalRoomDevices: [{ socketId: 'b', deviceType: 'mobile', browser: 'Safari', os: 'iOS' }]
        },
        global: { plugins: [i18n], stubs }
      })

      const badge = wrapper.findComponent({ name: 'DeviceCards' })
      expect(badge.exists()).toBe(true)
      expect(badge.props('devices')).toEqual([{ socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }])
    })

    it('현재 scope가 global이면 globalRoomDevices가 DeviceCards에 전달된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          scope: 'global',
          ipRoomDevices: [{ socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }],
          globalRoomDevices: [{ socketId: 'b', deviceType: 'mobile', browser: 'Safari', os: 'iOS' }]
        },
        global: { plugins: [i18n], stubs }
      })

      const badge = wrapper.findComponent({ name: 'DeviceCards' })
      expect(badge.exists()).toBe(true)
      expect(badge.props('devices')).toEqual([{ socketId: 'b', deviceType: 'mobile', browser: 'Safari', os: 'iOS' }])
    })

    it('현재 scope의 기기 목록이 비어있으면 배지가 렌더링되지 않는다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, scope: 'ip', ipRoomDevices: [], globalRoomDevices: [{ socketId: 'b' }] },
        global: { plugins: [i18n], stubs }
      })

      expect(wrapper.findComponent({ name: 'ConnectedDevices' }).exists()).toBe(false)
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

    it('통합 보내기 상자의 upload-files 이벤트가 전파되어야 한다', async () => {
      const files = [new File(['test'], 'test.png', { type: 'image/png' })]
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const box = wrapper.findComponent({ name: 'TextShareBox' })
      await box.vm.$emit('upload-files', files)

      expect(wrapper.emitted()).toHaveProperty('upload-files')
      expect(wrapper.emitted('upload-files')[0][0]).toEqual(files)
    })

    it('FileGallery(통합 목록)에서 remove-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const gallery = wrapper.findComponent({ name: 'FileGallery' })
      await gallery.vm.$emit('remove-text', 'text-id-123')

      expect(wrapper.emitted()).toHaveProperty('remove-text')
      expect(wrapper.emitted('remove-text')[0][0]).toBe('text-id-123')
    })

    it('FileGallery(통합 목록)에서 clear-all-texts 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const gallery = wrapper.findComponent({ name: 'FileGallery' })
      await gallery.vm.$emit('clear-all-texts')

      expect(wrapper.emitted()).toHaveProperty('clear-all-texts')
    })

    it('FileGallery(통합 목록)에서 copy-text 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const gallery = wrapper.findComponent({ name: 'FileGallery' })
      await gallery.vm.$emit('copy-text', 'text-id-456')

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

    it('texts props가 FileGallery(통합 목록)에 전달되어야 한다', () => {
      const texts = [
        { id: '1', content: 'Hello', timestamp: Date.now() }
      ]
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, texts },
        global: { plugins: [i18n], stubs }
      })

      const gallery = wrapper.findComponent({ name: 'FileGallery' })
      expect(gallery.props('texts')).toEqual(texts)
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

  describe('한 화면 작업 영역 (파일/텍스트 탭 없음)', () => {
    it('파일/텍스트 전환 tablist·tab이 렌더링되지 않는다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
      expect(wrapper.find('[data-testid="workspace-stack"]').exists()).toBe(true)
    })

    it('텍스트 입력(composer)이 FileGallery의 composer 슬롯에 항상 있고 share-text가 올라간다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const box = wrapper.findComponent({ name: 'TextShareBox' })
      expect(wrapper.find('.file-gallery-stub .text-share-box-stub').exists()).toBe(true)
      await box.vm.$emit('share-text', { content: 'hi', done: () => {} })
      expect(wrapper.emitted('share-text')[0][0].content).toBe('hi')
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
