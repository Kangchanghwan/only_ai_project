import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const joinPrivate = vi.fn()
const loadFiles = vi.fn()
const track = vi.fn()
const privateDevices = ref({})
let messageHandler = null
let reconnectCb = null

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: privateDevices,
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn((cb) => { reconnectCb = cb }), onMessage: vi.fn((cb) => { messageHandler = cb; return () => {} }), onUserLeft: vi.fn(() => () => {}),
    publishMessage: vi.fn(), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true })),
    joinPrivate: (...a) => joinPrivate(...a)
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: (...a) => loadFiles(...a), roomSize: () => 0,
    uploadFiles: vi.fn(), hasMoreForRoom: () => false, addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn()
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
const peerDev = { socketId: 'peerNew', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }

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

describe('App 1:1 방 다시 입장 (30일 유지)', () => {
  const pr = usePrivateRooms()
  let store, w
  beforeEach(async () => {
    joinPrivate.mockReset(); loadFiles.mockReset(); track.mockReset()
    privateDevices.value = {}
    store = createMemoryPrivateRoomStore()
    pr.setStore(store)
    pr.resetPrivateRooms()
    // 이전 접속에서 저장된 방 2개 → 새로 접속한 것처럼 메모리만 비운다
    await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'oldPeer', identity: peerDev.identity }, roomSecret: newRoomSecret(), ticket: 'T1' })
    await pr.addRoom({ roomId: 'prv-2', peer: { socketId: 'old2' }, roomSecret: newRoomSecret(), ticket: 'T2' })
    pr.rooms.splice(0, pr.rooms.length)
  })
  afterEach(() => { w?.unmount(); localStorage.clear(); pr.resetPrivateRooms() })

  it('시작하면 저장된 방이 "연결 중"으로 바로 보이고, registered 뒤 저장된 입장권으로 private:join을 보낸다', async () => {
    let finish
    joinPrivate.mockImplementation(() => new Promise((r) => { finish = r }))
    w = await mountApp()
    expect(joinPrivate).toHaveBeenCalledTimes(1)
    expect(joinPrivate.mock.calls[0][0].sort()).toEqual(['T1', 'T2'])
    expect(room(w).props('privateRooms').map((r) => [r.roomId, r.status])).toEqual([['prv-1', 'connecting'], ['prv-2', 'connecting']])
    finish({ ok: true, rooms: [], invalid: [] })
    await flush()
  })

  it('성공한 방은 입장권 갱신·상대 정보·상태 반영 후 파일을 불러오고, invalid 입장권의 방은 삭제한다', async () => {
    joinPrivate.mockResolvedValue({
      ok: true,
      rooms: [{ roomId: 'prv-1', ticket: 'T1-new', roomToken: 'tok', roomTokenTtlSec: 3600, devices: [{ socketId: 'me' }, peerDev] }],
      invalid: ['T2']
    })
    w = await mountApp()
    const rooms = room(w).props('privateRooms')
    expect(rooms.map((r) => r.roomId)).toEqual(['prv-1'])
    expect(rooms[0]).toMatchObject({ status: 'online', ticket: 'T1-new' })
    expect(rooms[0].peer.socketId).toBe('peerNew')
    expect((await store.load()).map((r) => [r.roomId, r.ticket])).toEqual([['prv-1', 'T1-new']])
    const ids = loadFiles.mock.calls.at(-1)[0]
    expect(ids).toContain('prv-1'); expect(ids).not.toContain('prv-2')
    expect(track).toHaveBeenCalledWith('pair_rejoin', { count: 1 })
  })

  it('방에 상대가 없으면 offline이고(나갔다가 아님), 이후 상대가 들어오면 online이 된다', async () => {
    joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: 'prv-1', ticket: 'T1b', devices: [{ socketId: 'me' }] }], invalid: [] })
    w = await mountApp()
    const status = () => room(w).props('privateRooms').find((r) => r.roomId === 'prv-1').status
    expect(status()).toBe('offline')
    privateDevices.value = { 'prv-1': [{ socketId: 'me' }, peerDev] }
    await flush()
    expect(status()).toBe('online')
    privateDevices.value = { 'prv-1': [{ socketId: 'me' }] }
    await flush()
    expect(status()).toBe('offline')
  })

  it('private-left를 받으면 left가 되고 내 저장소에서도 지운다', async () => {
    joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: 'prv-1', ticket: 'T1b', devices: [{ socketId: 'me' }, peerDev] }], invalid: [] })
    w = await mountApp()
    messageHandler({ type: 'private-left', roomId: 'prv-1' })
    await flush()
    expect(room(w).props('privateRooms').find((r) => r.roomId === 'prv-1').status).toBe('left')
    expect((await store.load()).map((r) => r.roomId)).not.toContain('prv-1')
    // 방 인원 갱신이 와도 left는 되살아나지 않는다
    privateDevices.value = { 'prv-1': [{ socketId: 'me' }, peerDev] }
    await flush()
    expect(room(w).props('privateRooms').find((r) => r.roomId === 'prv-1').status).toBe('left')
  })

  it('재연결(또는 연결 복구) 뒤에도 다시 private:join을 보낸다', async () => {
    joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: 'prv-1', ticket: 'T1b', devices: [{ socketId: 'me' }, peerDev] }], invalid: ['T2'] })
    w = await mountApp()
    expect(joinPrivate).toHaveBeenCalledTimes(1)
    joinPrivate.mockClear()
    joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: 'prv-1', ticket: 'T1c', devices: [{ socketId: 'me' }] }], invalid: [] })
    reconnectCb()
    await flush()
    expect(joinPrivate).toHaveBeenCalledWith(['T1b'])
    expect(room(w).props('privateRooms')[0]).toMatchObject({ status: 'offline', ticket: 'T1c' })
  })
})
