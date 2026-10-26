import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const publish = vi.fn()
// 서버 ack 흉내: 기본은 보관됨(만료 시각). 테스트마다 바꾼다
const ack = vi.fn(async () => ({ success: true, expiresAt: Date.now() + 600000 }))
const uploadFilesMock = vi.fn(async () => ({ successCount: 1 }))
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
    publishMessage: (...a) => publish(...a),
    publishWithAck: async (...a) => { publish(...a); return ack(...a) },
    getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn()
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: (...a) => uploadFilesMock(...a), hasMoreForRoom: () => false, addFile: vi.fn()
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
import { notificationService } from './services/notificationService'

/** 지금까지 띄운 알림 문구들 */
const shown = vi.spyOn(notificationService, 'showNotification')
const notifications = () => shown.mock.calls.map((c) => c[0])

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'uploads', 'texts', 'textReceiverCount', 'textStorageMode'] }
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
    ack.mockReset()
    ack.mockImplementation(async () => ({ success: true, expiresAt: Date.now() + 600000 }))
    uploadFilesMock.mockClear()
    shown.mockClear()
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
    expect(room(w).props('textStorageMode')).toBe('locked')
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

  it('잠금이 꺼져 있으면(기본) 평문으로 보내고 평문 보관 모드로 표시, 서버 만료 시각을 카드에 반영한다', async () => {
    w = await mountApp()
    expect(room(w).props('textStorageMode')).toBe('plain')
    const expiresAt = Date.now() + 600000
    ack.mockResolvedValueOnce({ success: true, expiresAt })
    expect(await textEmit(w, 'hello')).toBe(true)
    expect(publish.mock.calls[0][0]).toMatchObject({ content: 'hello' })
    expect(publish.mock.calls[0][0].locked).toBeUndefined()
    expect(room(w).props('texts')[0]).toMatchObject({ content: 'hello', expiresAt, canCancel: true })
  })

  it('구버전 서버(목록 404)면 보관 안 함 모드', async () => {
    service.list.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    w = await mountApp()
    expect(room(w).props('textStorageMode')).toBe('none')
  })

  it('속도 제한에 걸리면 목록에서 빼고 입력을 남기며(false) 알린다', async () => {
    w = await mountApp()
    ack.mockResolvedValueOnce({ success: false, code: 'RATE_LIMITED' })
    expect(await textEmit(w, 'too fast')).toBe(false)
    expect(room(w).props('texts')).toHaveLength(0)
    expect(JSON.stringify(notifications())).toContain('너무 빨리 보내고 있어요')
  })

  it('96KB를 넘으면 보관되지 않았다고 카드·알림으로 알리고 .txt 파일로 보낼 수 있다', async () => {
    w = await mountApp()
    ack.mockResolvedValueOnce({ success: true, notStored: 'TOO_LARGE' })
    const big = 'x'.repeat(96 * 1024 + 1)
    expect(await textEmit(w, big)).toBe(true)
    const card = room(w).props('texts')[0]
    expect(card).toMatchObject({ notStored: 'TOO_LARGE' })
    expect(card.expiresAt).toBeUndefined()
    expect(JSON.stringify(notifications())).toContain('96KB가 넘는 텍스트는 보관되지 않아')

    room(w).vm.$emit('send-text-as-file', card.id)
    await flush()
    const [roomId, files] = uploadFilesMock.mock.calls[0]
    expect(roomId).toBe('I')
    expect(files[0].name).toMatch(/^text-\d{8}-\d{6}\.txt$/)
    expect(await files[0].text()).toBe(big)
  })

  it('구버전 서버라 이유가 없어도 크기로 판단해 보관 안 됨을 알린다', async () => {
    w = await mountApp()
    ack.mockResolvedValueOnce({ success: true })
    await textEmit(w, '가'.repeat(40000))
    expect(room(w).props('texts')[0].notStored).toBe('TOO_LARGE')
  })

  it('보낸 쪽 몫을 넘어 밀려난 내 보관분은 보관 표시만 지우고 알린다', async () => {
    w = await mountApp()
    await textEmit(w, 'first')
    const firstId = room(w).props('texts')[0].id
    ack.mockResolvedValueOnce({ success: true, expiresAt: Date.now() + 600000, evicted: [firstId] })
    await textEmit(w, 'second')
    const texts = room(w).props('texts')
    expect(texts.find((x) => x.id === firstId).expiresAt).toBeUndefined()
    expect(texts.find((x) => x.content === 'second').expiresAt).toBeTruthy()
    expect(JSON.stringify(notifications())).toContain('최근 5개까지')
  })

  it('분석 이벤트에는 텍스트 내용이 실리지 않는다', async () => {
    const gtag = vi.fn()
    window.gtag = gtag
    try {
      w = await mountApp()
      await textEmit(w, '분석에-남으면-안-되는-평문')
      await lockState.setLock('ip', 'pass1234', { iterations: 1000 })
      await textEmit(w, '잠긴-평문도-마찬가지')
      expect(gtag.mock.calls.some((c) => c[1] === 'text_share')).toBe(true)
      expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/분석에-남으면|잠긴-평문도/)
    } finally {
      delete window.gtag
    }
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
