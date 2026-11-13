import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const privateDevices = ref({})
const ipDevices = ref([])
let userLeftCb = null

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(1), ipRoomDevices: ipDevices, globalRoomDevices: ref([]), privateRoomDevices: privateDevices,
    myIdentity: ref({ adj: 1, animal: 1 }), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn(() => () => {}), onUserLeft: vi.fn((cb) => { userLeftCb = cb; return () => {} }),
    publishMessage: vi.fn(), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true })),
    joinPrivate: vi.fn(async () => ({ ok: true, rooms: [], invalid: [] })), createPrivate: vi.fn(), invitePrivate: vi.fn()
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(async () => {}), roomSize: () => 0,
    uploadFiles: vi.fn(), hasMoreForRoom: () => false, addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { usePrivateRooms } from './composables/usePrivateRooms.js'
import { notificationService } from './services/notificationService.js'
import { createMemoryPrivateRoomStore } from './utils/privateRoomDb.js'
import { newRoomSecret } from './utils/pairCrypto.js'

const G = 'prv-g-' + 'ab12'.repeat(6)
const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'privateRooms'] }
const flush = async () => { for (let i = 0; i < 6; i++) await flushPromises() }
const me = { socketId: 'me', identity: { adj: 1, animal: 1 } }
const octo = (socketId = 'o1') => ({ socketId, identity: { adj: 3, animal: 5 }, deviceType: 'desktop', browser: 'Chrome', os: 'macOS' })

describe('App 입장·퇴장 토스트 (어느 방인지 표시)', () => {
  const pr = usePrivateRooms()
  let w, toastSpy
  const shown = () => toastSpy.mock.calls.map(([m]) => String(m))
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    i18n.global.locale.value = 'ko'
    privateDevices.value = {}
    ipDevices.value = []
    pr.setStore(createMemoryPrivateRoomStore())
    pr.resetPrivateRooms()
    notificationService.hideNotification()
    toastSpy = vi.spyOn(notificationService, 'showNotification')
    localStorage.setItem('share-scope', 'ip')
    w = mount(App, { global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } }, attachTo: document.body })
    await vi.advanceTimersByTimeAsync(300)
    await flush()
  })
  afterEach(() => { toastSpy?.mockRestore(); w?.unmount(); localStorage.clear(); pr.resetPrivateRooms(); vi.useRealTimers() })

  it('같은 네트워크: "같은 네트워크에 … 들어왔어요", 20초 뒤 "같은 네트워크에서 … 나갔어요"', async () => {
    ipDevices.value = [me]
    await flush()
    ipDevices.value = [me, octo()]
    await flush()
    expect(shown().some((m) => m.includes('같은 네트워크에 ') && m.includes('들어왔어요'))).toBe(true)
    ipDevices.value = [me]
    await flush()
    expect(shown().some((m) => m.includes('나갔어요'))).toBe(false)
    await vi.advanceTimersByTimeAsync(20000)
    await flush()
    expect(shown().some((m) => m.includes('같은 네트워크에서 ') && m.includes('나갔어요'))).toBe(true)
  })

  it('그룹 방: 방 이름을 붙여 알린다', async () => {
    await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), ticket: 'T', name: '날쌘 코알라의 방' })
    pr.setStatus(G, 'online')
    privateDevices.value = { [G]: [me] }
    await flush()
    privateDevices.value = { [G]: [me, octo()] }
    await flush()
    expect(shown().some((m) => m.includes("'날쌘 코알라의 방'에 ") && m.includes('들어왔어요'))).toBe(true)
    privateDevices.value = { [G]: [me] }
    await flush()
    await vi.advanceTimersByTimeAsync(20000)
    await flush()
    expect(shown().some((m) => m.includes("'날쌘 코알라의 방'에서 ") && m.includes('나갔어요'))).toBe(true)
  })

  it('잠깐 끊겼다 새 소켓으로 돌아오면 아무것도 알리지 않는다', async () => {
    ipDevices.value = [me, octo('o1')]
    await flush()
    toastSpy.mockClear()
    ipDevices.value = [me]
    await flush()
    ipDevices.value = [me, octo('o2')]
    await flush()
    await vi.advanceTimersByTimeAsync(25000)
    await flush()
    expect(shown().filter((m) => /들어왔어요|나갔어요/.test(m))).toEqual([])
  })

  it('예전 "현재 N명이 룸에 있습니다" 토스트는 더 이상 뜨지 않는다', async () => {
    userLeftCb?.(6)
    await flush()
    expect(shown().some((m) => m.includes('룸에 있습니다'))).toBe(false)
  })
})
