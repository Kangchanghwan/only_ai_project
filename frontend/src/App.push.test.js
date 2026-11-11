import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const track = vi.fn()
const pushInit = vi.fn(async () => true)
const pushSync = vi.fn(async () => {})
const pushSyncSoon = vi.fn()

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: ref({}),
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn(() => () => {}), onUserLeft: vi.fn(() => () => {}),
    publishMessage: vi.fn(), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true })),
    joinPrivate: vi.fn(async () => ({ ok: true, rooms: [], invalid: [] }))
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: vi.fn(), hasMoreForRoom: () => false, addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn()
  })
}))
vi.mock('./composables/usePush', () => ({
  usePush: () => ({
    supported: ref(false), enabled: ref(false), permission: ref('default'),
    init: pushInit, sync: pushSync, syncSoon: pushSyncSoon, isSupported: vi.fn(async () => false), enable: vi.fn(), disable: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))
vi.mock('./utils/analytics', async (orig) => ({ ...(await orig()), trackEvent: (...a) => track(...a) }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { usePrivateRooms } from './composables/usePrivateRooms.js'
import { createMemoryPrivateRoomStore } from './utils/privateRoomDb.js'
import { newRoomSecret } from './utils/pairCrypto.js'

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'privateRooms'] }
const flush = async () => { for (let i = 0; i < 6; i++) await flushPromises() }
const room = (w) => w.findComponent({ name: 'RoomScreen' })
const PRV = 'prv-0123456789abcdef01234567'

let swListener = null
function installServiceWorker(pendingTarget) {
  const controller = {
    postMessage: (msg, ports) => {
      if (msg?.type === 'GET_PUSH_TARGET') ports[0].postMessage({ type: 'PUSH_TARGET', target: pendingTarget })
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller,
      addEventListener: (type, fn) => { if (type === 'message') swListener = fn },
      removeEventListener: () => { swListener = null },
    },
  })
}

async function mountApp(scope = 'global') {
  localStorage.setItem('share-scope', scope)
  const wrapper = mount(App, {
    global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } },
    attachTo: document.body
  })
  await new Promise((r) => setTimeout(r, 300))
  await flush()
  return wrapper
}

describe('App 도착 알림 열기 처리', () => {
  const pr = usePrivateRooms()
  let w
  beforeEach(async () => {
    track.mockReset(); pushInit.mockClear(); pushSync.mockClear(); pushSyncSoon.mockClear()
    swListener = null
    pr.setStore(createMemoryPrivateRoomStore())
    pr.resetPrivateRooms()
    await pr.addRoom({ roomId: PRV, peer: { socketId: 'p' }, roomSecret: newRoomSecret(), ticket: 'T1' })
  })
  afterEach(() => {
    w?.unmount()
    localStorage.clear()
    pr.resetPrivateRooms()
    delete navigator.serviceWorker
  })

  it('시작하면 푸시 지원을 확인하고 구독을 맞춘다', async () => {
    installServiceWorker(null)
    w = await mountApp()
    expect(pushInit).toHaveBeenCalled()
    expect(pushSync).toHaveBeenCalled()
  })

  it('알림으로 새로 열렸고 target이 ip면 같은 네트워크 탭으로 간다 (방 ID 없이 이벤트 기록)', async () => {
    installServiceWorker('ip')
    w = await mountApp('global')
    expect(room(w).props('scope')).toBe('ip')
    expect(track).toHaveBeenCalledWith('push_open', { target_kind: 'ip' })
  })

  it('target이 내가 가진 비공개 방이면 그 방 탭으로 간다', async () => {
    installServiceWorker(PRV)
    w = await mountApp('ip')
    expect(room(w).props('scope')).toBe(`prv:${PRV}`)
    expect(track).toHaveBeenCalledWith('push_open', { target_kind: 'prv' })
    expect(JSON.stringify(track.mock.calls)).not.toContain(PRV)
  })

  it('모르는 비공개 방이면 탭을 바꾸지 않는다', async () => {
    installServiceWorker('prv-ffffffffffffffffffffffff')
    w = await mountApp('global')
    expect(room(w).props('scope')).toBe('global')
  })

  it('target이 없거나 형식이 틀리면 아무 일도 없다', async () => {
    installServiceWorker('https://evil.example')
    w = await mountApp('global')
    expect(room(w).props('scope')).toBe('global')
    expect(track).not.toHaveBeenCalledWith('push_open', expect.anything())
  })

  it('이미 열려 있을 때는 PUSH_OPEN 메시지로 전환한다', async () => {
    installServiceWorker(null)
    w = await mountApp('global')
    expect(room(w).props('scope')).toBe('global')
    swListener({ data: { type: 'PUSH_OPEN', target: PRV } })
    await flush()
    expect(room(w).props('scope')).toBe(`prv:${PRV}`)
    swListener({ data: { type: 'PUSH_OPEN', target: 'ip' } })
    await flush()
    expect(room(w).props('scope')).toBe('ip')
    swListener({ data: { type: 'SOMETHING_ELSE', target: 'global' } })
    await flush()
    expect(room(w).props('scope')).toBe('ip')
  })
})
