import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const publish = vi.fn()
let onMessageCb = null
const service = vi.hoisted(() => ({
  list: vi.fn(async () => []),
  unlock: vi.fn(async () => []),
  remove: vi.fn(async () => ({ deleted: [], forbidden: [] }))
}))

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(2),
    ipRoomDevices: ref([{ socketId: 'me' }, { socketId: 'other' }]), globalRoomDevices: ref([{ socketId: 'me' }]),
    privateRoomDevices: ref({}),
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn((cb) => { onMessageCb = cb; return () => {} }), onUserLeft: vi.fn(() => () => {}),
    publishMessage: (...a) => publish(...a), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn()
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: vi.fn(), hasMoreForRoom: () => false, addFile: vi.fn()
  })
}))
vi.mock('./services/textQueueService', () => ({ textQueueService: service }))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { useLockState } from './composables/useLockState'
import { decryptText, encryptText } from './utils/privateText.js'

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'uploads', 'texts', 'textReceiverCount', 'textWillQueue'] }
const flush = async () => { for (let i = 0; i < 5; i++) await flushPromises() }
const lockState = useLockState()

async function mountApp() {
  localStorage.setItem('share-scope', 'ip')
  const w = mount(App, {
    global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } },
    attachTo: document.body
  })
  await new Promise((r) => setTimeout(r, 300))
  await flush()
  return w
}
const room = (w) => w.findComponent({ name: 'RoomScreen' })
const textEmit = (w, content) => new Promise((resolve) => room(w).vm.$emit('share-text', { content, done: resolve }))

describe('App 텍스트 10분 보관', () => {
  let w
  beforeEach(() => {
    publish.mockClear()
    Object.values(service).forEach((f) => f.mockClear())
    lockState.resetLockState()
  })
  afterEach(() => { w?.unmount(); localStorage.clear() })

  it('접속하면 두 방(ip/global)의 보관 텍스트를 불러온다', async () => {
    w = await mountApp()
    expect(service.list.mock.calls.map((c) => c[0]).sort()).toEqual(['G', 'I'])
  })

  it('범위 잠금이 켜져 있으면 텍스트를 잠금 키로 암호화해 보내고 평문 content는 보내지 않는다', async () => {
    w = await mountApp()
    const lock = await lockState.setLock('ip', 'pass1234', { iterations: 1000 })
    await flush()
    expect(room(w).props('textWillQueue')).toBe(true)
    expect(room(w).props('textReceiverCount')).toBe(1)

    expect(await textEmit(w, '비밀 메모')).toBe(true)
    const [msg, target] = publish.mock.calls[0]
    expect(target).toBe('ip')
    expect(msg).toMatchObject({ type: 'text-shared', locked: true, roomId: 'I', lock: { v: 1, salt: lock.salt, vh: lock.vh } })
    expect(msg).not.toHaveProperty('content')
    expect(JSON.stringify(msg)).not.toContain('비밀 메모')
    expect(await decryptText(lock.encKey, 'I', msg.enc)).toBe('비밀 메모')
    // 보낸 기기는 내용을 그대로 보고, 보관 취소용 삭제 키를 기억한다
    expect(room(w).props('texts')[0]).toMatchObject({ content: '비밀 메모', locked: true })
    expect(lockState.deleteKeyFor('I', msg.textId)).toBeTruthy()
  })

  it('잠금이 꺼져 있으면 지금처럼 평문으로 즉시 전달만 하고 보관 대상이 아니다', async () => {
    w = await mountApp()
    expect(room(w).props('textWillQueue')).toBe(false)
    await textEmit(w, 'hello')
    expect(publish.mock.calls[0][0]).toMatchObject({ content: 'hello' })
    expect(publish.mock.calls[0][0].locked).toBeUndefined()
  })

  it('잠긴 텍스트가 오면 같은 비밀번호를 확인한 기기에서는 풀어서 보여 준다', async () => {
    w = await mountApp()
    const lock = await lockState.setLock('ip', 'pass1234', { iterations: 1000 })
    const enc = await encryptText(lock.encKey, 'I', '도착')
    service.unlock.mockImplementation(async (_r, ids) => ids.map((textId) => ({ textId, enc })))
    onMessageCb({ type: 'text-shared', textId: 'in-1', roomId: 'I', locked: true, lock: { salt: lock.salt }, timestamp: 1, expiresAt: Date.now() + 600000 })
    await flush()
    await vi.waitFor(() => expect(room(w).props('texts')[0]?.content).toBe('도착'))
    expect(service.unlock).toHaveBeenCalledWith('I', ['in-1'], lock.verifier)
  })

  it('비밀번호를 모르는 기기에는 내용 없이 잠긴 텍스트로만 들어온다', async () => {
    w = await mountApp()
    onMessageCb({ type: 'text-shared', textId: 'in-2', roomId: 'I', locked: true, lock: { salt: 'A'.repeat(22) }, timestamp: 1, expiresAt: Date.now() + 600000 })
    await flush()
    expect(room(w).props('texts')[0]).toMatchObject({ id: 'in-2', content: null, locked: true })
    expect(service.unlock).not.toHaveBeenCalled()
  })

  it('전체 삭제는 서버 대기열도 함께 지운 뒤 알린다', async () => {
    w = await mountApp()
    room(w).vm.$emit('clear-all-texts')
    await flush()
    expect(service.remove).toHaveBeenCalledWith('I', expect.objectContaining({ all: true }))
    expect(publish).toHaveBeenCalledWith({ type: 'texts-cleared', roomId: 'I' }, 'ip')
  })
})
