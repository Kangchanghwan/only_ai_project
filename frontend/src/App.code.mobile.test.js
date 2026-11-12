import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const codeMock = vi.hoisted(() => ({ hosts: [], joiners: [], joinResult: null }))
const joinPrivate = vi.fn()
const createPrivate = vi.fn()
const invitePrivate = vi.fn()
const loadFiles = vi.fn()
const track = vi.fn()
const privateDevices = ref({})

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: privateDevices,
    myIdentity: ref({ adj: 1, animal: 1 }), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn(() => () => {}), onUserLeft: vi.fn(() => () => {}),
    publishMessage: vi.fn(), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true })),
    joinPrivate: (...a) => joinPrivate(...a), createPrivate: (...a) => createPrivate(...a), invitePrivate: (...a) => invitePrivate(...a)
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: (...a) => loadFiles(...a), roomSize: () => 0,
    uploadFiles: vi.fn(), hasMoreForRoom: () => false, addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: { getCodeAdapter: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) } }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }))
vi.mock('./utils/analytics', async (orig) => ({ ...(await orig()), trackEvent: (...a) => track(...a) }))
// 그림 코드 상태 기계는 가짜로 바꾼다(실제 왕복은 codeJoin.test.js와 로컬 e2e에서 확인)
vi.mock('./services/codeJoin.js', async () => {
  const { ref } = await import('vue')
  const mock = codeMock
  return {
    createCodeHost: (opts) => {
      const h = { opts, code: ref([0, 2, 3, 4]), expiresAt: ref(Date.now() + 300000), pendingRequest: ref(null), requestCount: ref(0), status: ref('open'),
        start: vi.fn(async () => true), renew: vi.fn(), decide: vi.fn(), close: vi.fn(async () => {}) }
      mock.hosts.push(h)
      return h
    },
    createCodeJoiner: () => {
      const j = { status: ref('idle'), warn: ref(false), retryAfterSec: ref(0), cancel: vi.fn(), join: vi.fn(async () => mock.joinResult) }
      mock.joiners.push(j)
      return j
    }
  }
})

import App from './App.vue'
import i18n from './i18n/index.js'
import { usePrivateRooms } from './composables/usePrivateRooms.js'
import { notificationService } from './services/notificationService.js'
import { createMemoryPrivateRoomStore } from './utils/privateRoomDb.js'
import { b64u } from './utils/lockCrypto.js'

const G = 'prv-g-' + 'ab12'.repeat(6)
const G2 = 'prv-g-' + 'cd34'.repeat(6)
const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'privateRooms'], emits: ['group-create', 'group-add', 'code-enter', 'group-invite', 'leave-private'] }
const flush = async () => { for (let i = 0; i < 6; i++) await flushPromises() }
const room = (w) => w.findComponent({ name: 'RoomScreen' })
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const mock = () => codeMock

async function mountApp() {
  localStorage.setItem('share-scope', 'ip')
  const wrapper = mount(App, {
    global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } },
    attachTo: document.body
  })
  await new Promise((r) => setTimeout(r, 300))
  await flush()
  return wrapper
}

const pr = usePrivateRooms()
let w, toastSpy
beforeEach(() => {
  joinPrivate.mockReset(); createPrivate.mockReset(); invitePrivate.mockReset(); loadFiles.mockReset(); track.mockReset()
  joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: [] })
  invitePrivate.mockResolvedValue({ ok: true, ticket: 'pv1.' + G + '.inv', expiresAt: Date.now() + 600000 })
  createPrivate.mockResolvedValue({ ok: true, roomId: G, ticket: 'pv1.own', devices: [{ socketId: 'me' }] })
  privateDevices.value = {}
  pr.setStore(createMemoryPrivateRoomStore())
  pr.resetPrivateRooms()
  mock().hosts.length = 0; mock().joiners.length = 0; mock().joinResult = null
  notificationService.hideNotification()
  toastSpy = vi.spyOn(notificationService, 'showNotification')
})
afterEach(() => { toastSpy?.mockRestore(); w?.unmount(); localStorage.clear(); pr.resetPrivateRooms() })
const toasts = (text) => toastSpy.mock.calls.filter(([m]) => String(m).includes(text)).length

Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', configurable: true })

describe('App 그림 코드 (폰)', () => {
  const ua = navigator.userAgent
  it('폰이면 초대 시트가 그림 탭으로 열리고 코드가 바로 열린다', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-create')
    await vi.waitFor(() => expect(mock().hosts).toHaveLength(1))
    await flush()
    expect(q('group-invite-tab-picture').getAttribute('aria-selected')).toBe('true')
    expect(q('picture-code-show')).not.toBeNull()
    expect(track).not.toHaveBeenCalledWith('code_enter_open')
    void ua
  })
})
