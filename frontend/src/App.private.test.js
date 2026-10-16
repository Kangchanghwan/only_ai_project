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

describe('App 1:1 비공개 방', () => {
  const pr = usePrivateRooms()
  let w
  beforeEach(async () => {
    publish.mockClear(); addFile.mockClear(); uploadFilesMock.mockClear()
    pr.resetPrivateRooms()
    await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'peer' }, roomSecret: newRoomSecret() })
  })
  afterEach(() => { w?.unmount(); localStorage.clear(); pr.resetPrivateRooms() })

  it('비공개 방 텍스트는 enc만 발행하고 평문 content와 roomId 대상(prv-)을 쓴다', async () => {
    w = await mountApp()
    room(w).vm.$emit('select-scope', 'prv:prv-1')
    await flush()
    expect(room(w).props('scope')).toBe('prv:prv-1')

    const ok = await textEmit(w, '비밀 메모')
    expect(ok).toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
    const [message, target] = publish.mock.calls[0]
    expect(target).toBe('prv-1')
    expect(message.type).toBe('text-shared')
    expect(message.roomId).toBe('prv-1')
    expect(message.enc).toMatchObject({ v: 1 })
    expect('content' in message).toBe(false)
    expect(JSON.stringify(message)).not.toContain('비밀 메모')
    expect(await pr.decryptFor('prv-1', message.enc)).toBe('비밀 메모')
  })

  it('받은 비공개 텍스트는 복호화해서 보이고, 복호화 실패는 "읽을 수 없는 텍스트"', async () => {
    w = await mountApp()
    const enc = await pr.encryptFor('prv-1', '안녕')
    messageHandler({ type: 'text-shared', textId: 't1', enc, timestamp: 1, roomId: 'prv-1' })
    messageHandler({ type: 'text-shared', textId: 't2', enc: { v: 1, iv: 'AAAA', ct: 'AAAA' }, timestamp: 2, roomId: 'prv-1' })
    await flush()
    const texts = room(w).props('texts')
    // 활성 scope가 ip라 화면 목록에는 안 보이므로 비공개 scope로 전환해 확인
    expect(texts).toEqual([])
    room(w).vm.$emit('select-scope', 'prv:prv-1')
    await flush()
    const shown = room(w).props('texts')
    expect(shown.find((x) => x.id === 't1').content).toBe('안녕')
    expect(shown.find((x) => x.id === 't2').content).toBe('읽을 수 없는 텍스트')
  })

  it('비공개 방이 평문 content를 보내도 쓰지 않는다', async () => {
    w = await mountApp()
    messageHandler({ type: 'text-shared', textId: 'p1', content: '평문', timestamp: 1, roomId: 'prv-1' })
    room(w).vm.$emit('select-scope', 'prv:prv-1')
    await flush()
    const t = room(w).props('texts').find((x) => x.id === 'p1')
    expect(t?.content).not.toBe('평문')
  })

  it('내 방이 아닌 roomId의 메시지는 무시한다', async () => {
    w = await mountApp()
    messageHandler({ type: 'file-uploaded', fileName: 'x', url: 'http://x', size: 1, created: 'now', roomId: 'prv-other' })
    messageHandler({ type: 'file-uploaded', locked: true, fileName: 'y', size: 1, created: 'now', roomId: 'prv-other' })
    messageHandler({ type: 'text-shared', textId: 'z', content: 'hi', timestamp: 1, roomId: 'someone-elses' })
    messageHandler({ type: 'text-shared', textId: 'z2', content: 'hi', timestamp: 1 })
    await flush()
    expect(addFile).not.toHaveBeenCalled()
    expect(room(w).props('texts')).toEqual([])
    // 내 방(ip)의 메시지는 그대로 처리
    messageHandler({ type: 'file-uploaded', fileName: 'ok', url: 'http://ok', size: 1, created: 'now', roomId: 'I' })
    expect(addFile).toHaveBeenCalledTimes(1)
  })

  it('다른 방 텍스트를 지우는 메시지는 무시한다', async () => {
    w = await mountApp()
    messageHandler({ type: 'text-shared', textId: 'k', content: 'keep', timestamp: 1, roomId: 'I' })
    await flush()
    messageHandler({ type: 'text-removed', textId: 'k', roomId: 'prv-1' })
    await flush()
    expect(room(w).props('texts').some((x) => x.id === 'k')).toBe(true)
  })

  it('private-left 메시지는 상대 상태를 "나갔어요"로 바꾼다 (모르는 방은 무시)', async () => {
    w = await mountApp()
    messageHandler({ type: 'private-left', roomId: 'prv-unknown' })
    expect(pr.rooms[0].status).toBe('online')
    messageHandler({ type: 'private-left', roomId: 'prv-1' })
    expect(pr.rooms[0].status).toBe('left')
  })

  it('비공개 방 파일 업로드는 항상 잠금(lock) 경로로 가고 공개 경로는 쓰지 않는다', async () => {
    w = await mountApp()
    room(w).vm.$emit('select-scope', 'prv:prv-1')
    await flush()
    room(w).vm.$emit('upload-files', [new File(['a'], 'a.txt')])
    await flush()
    expect(uploadFilesMock).toHaveBeenCalledTimes(1)
    const [roomId, , opts] = uploadFilesMock.mock.calls[0]
    expect(roomId).toBe('prv-1')
    expect(opts.lock).toBeTruthy()
    expect(opts.lock.salt).toBe(pr.lockFor('prv-1').salt)
  })
})
