import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const publish = vi.fn()
const addFile = vi.fn()
const uploadFilesMock = vi.fn(async () => ({ successCount: 0 }))
let messageHandler = null

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(false), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: ref({}),
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn((cb) => { messageHandler = cb; return () => {} }), onUserLeft: vi.fn(() => () => {}),
    publishMessage: (...a) => publish(...a), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true }))
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: (...a) => uploadFilesMock(...a), hasMoreForRoom: () => false, addFile: (...a) => addFile(...a), removeFile: vi.fn(), clearRoomFiles: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { usePrivateRooms } from './composables/usePrivateRooms.js'
import { newRoomSecret } from './utils/pairCrypto.js'
import { notificationService } from './services/notificationService.js'

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'uploads', 'texts', 'privateRooms'] }
const flush = async () => { for (let i = 0; i < 5; i++) await flushPromises() }
const room = (w) => w.findComponent({ name: 'RoomScreen' })
const textEmit = (w, content) => new Promise((resolve) => room(w).vm.$emit('share-text', { content, done: resolve }))

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

const G = 'prv-g-' + 'ab12'.repeat(6)

describe('App 도착 알림: 어느 방인지 표시', () => {
  const pr = usePrivateRooms()
  let w, toastSpy
  const shown = () => toastSpy.mock.calls.map(([m]) => String(m))
  beforeEach(async () => {
    i18n.global.locale.value = 'ko'
    addFile.mockReset(); addFile.mockReturnValue(true)
    pr.resetPrivateRooms()
    await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), ticket: 'T', name: '졸린 판다의 방' })
    notificationService.hideNotification()
    toastSpy = vi.spyOn(notificationService, 'showNotification')
  })
  afterEach(() => { toastSpy?.mockRestore(); w?.unmount(); localStorage.clear(); pr.resetPrivateRooms() })

  it('텍스트: 같은 네트워크 / 전체 공유를 붙인다', async () => {
    w = await mountApp()
    messageHandler({ type: 'text-shared', textId: 'a', content: 'hi', timestamp: 1, roomId: 'I' })
    await flush()
    messageHandler({ type: 'text-shared', textId: 'b', content: 'hi', timestamp: 2, roomId: 'G' })
    await flush()
    expect(shown().some((m) => m.includes('같은 네트워크에 새 텍스트가 왔어요'))).toBe(true)
    expect(shown().some((m) => m.includes('전체 공유에 새 텍스트가 왔어요'))).toBe(true)
    expect(shown().some((m) => m.includes('새 텍스트가 공유되었습니다'))).toBe(false)
  })

  it('파일: 같은 네트워크에 새 파일이 왔어요', async () => {
    w = await mountApp()
    messageHandler({ type: 'file-uploaded', fileName: 'ok', url: 'http://ok', size: 1, created: 'now', roomId: 'I' })
    await flush()
    expect(shown().some((m) => m.includes('같은 네트워크에 새 파일이 왔어요'))).toBe(true)
    expect(shown().some((m) => m.includes('업로드되었습니다'))).toBe(false)
    messageHandler({ type: 'file-uploaded', locked: true, fileName: 'id1', size: 3, created: 'now', roomId: G })
    await flush()
    expect(shown().some((m) => m.includes("'졸린 판다의 방'에 새 파일이 왔어요"))).toBe(true)
  })

  it('방: 다른 기기가 텍스트를 모두 지우면 방 이름을 붙여 알린다', async () => {
    w = await mountApp()
    messageHandler({ type: 'texts-cleared', roomId: G })
    await flush()
    expect(shown().some((m) => m.includes("'졸린 판다의 방'의 텍스트가 모두 삭제됐어요"))).toBe(true)
  })

  it('방 이름 없는 방은 "이름 없는 방"', async () => {
    const G2 = 'prv-g-' + 'cd34'.repeat(6)
    await pr.addRoom({ roomId: G2, roomSecret: newRoomSecret(), ticket: 'T2', name: '' })
    w = await mountApp()
    messageHandler({ type: 'texts-cleared', roomId: G2 })
    await flush()
    expect(shown().some((m) => m.includes("'이름 없는 방'의 텍스트가 모두 삭제됐어요"))).toBe(true)
  })
})
