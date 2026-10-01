import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const publish = vi.fn()
const uploadFilesMock = vi.fn(async () => ({ successCount: 0 }))

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(false), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]),
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn(() => () => {}), onUserLeft: vi.fn(() => () => {}),
    publishMessage: (...a) => publish(...a), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn()
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: (...a) => uploadFilesMock(...a), hasMoreForRoom: () => false, addFile: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))

import App from './App.vue'
import i18n from './i18n/index.js'

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'uploads'] }
const flush = async () => { for (let i = 0; i < 5; i++) await flushPromises() }

async function mountApp() {
  localStorage.setItem('share-scope', 'ip')
  const wrapper = mount(App, {
    global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } },
    attachTo: document.body
  })
  await vi.waitFor(() => expect(document.querySelector('[data-testid="public-share-confirm"]')).toBeNull())
  await new Promise((r) => setTimeout(r, 300))
  await flush()
  return wrapper
}

const room = (w) => w.findComponent({ name: 'RoomScreen' })
const textEmit = (w, content) => new Promise((resolve) => room(w).vm.$emit('share-text', { content, done: resolve }))
const pasteEvent = (target, text) => {
  const ev = new Event('paste', { bubbles: true })
  ev.clipboardData = { getData: () => text, files: [], items: [] }
  target.dispatchEvent(ev)
}

describe('App 공개 전송 확인 / 붙여넣기 가드', () => {
  let w
  beforeEach(() => { publish.mockClear(); uploadFilesMock.mockClear() })
  afterEach(() => { w?.unmount(); localStorage.clear() })

  it('private scope는 확인 없이 바로 텍스트를 전송한다', async () => {
    w = await mountApp()
    const ok = await textEmit(w, 'hello')
    expect(ok).toBe(true)
    expect(document.querySelector('[data-testid="public-share-confirm"]')).toBeNull()
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toMatchObject({ type: 'text-shared', content: 'hello', roomId: 'I' })
    expect(publish.mock.calls[0][1]).toBe('ip')
  })

  it('global 첫 전송은 확인을 받고, 취소하면 publish 0 / 입력 유지(done=false)', async () => {
    w = await mountApp()
    w.vm.$nextTick()
    localStorage.setItem('share-scope', 'global')
    room(w).vm.$emit('select-scope', 'global')
    await flush()
    const result = textEmit(w, 'secret')
    await flush()
    const dlg = document.querySelector('[data-testid="public-share-confirm"]')
    expect(dlg).not.toBeNull()
    document.querySelector('[data-testid="public-confirm-cancel"]').click()
    expect(await result).toBe(false)
    expect(publish).not.toHaveBeenCalled()
  })

  it('확인 대기 중 scope가 바뀌어도 처음 요청한 scope(global 룸)로만 전송된다', async () => {
    w = await mountApp()
    room(w).vm.$emit('select-scope', 'global')
    await flush()
    const result = textEmit(w, 'to-global')
    await flush()
    room(w).vm.$emit('select-scope', 'ip') // 대기 중 탭 전환
    await flush()
    document.querySelector('[data-testid="public-confirm-accept"]').click()
    expect(await result).toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0].roomId).toBe('G')
    expect(publish.mock.calls[0][1]).toBe('global')
    // 같은 세션에서는 다시 묻지 않는다
    room(w).vm.$emit('select-scope', 'global')
    await flush()
    expect(await textEmit(w, 'again')).toBe(true)
    expect(document.querySelector('[data-testid="public-share-confirm"]')).toBeNull()
  })

  it('파일 업로드도 global 첫 전송 전에 확인하고 취소하면 업로드 0', async () => {
    w = await mountApp()
    room(w).vm.$emit('select-scope', 'global')
    await flush()
    const file = new File(['x'], 'a.txt')
    room(w).vm.$emit('upload-files', [file])
    await flush()
    expect(document.querySelector('[data-testid="public-share-confirm"]')).not.toBeNull()
    document.querySelector('[data-testid="public-confirm-cancel"]').click()
    await flush()
    expect(uploadFilesMock).not.toHaveBeenCalled()
  })

  it('textarea에 붙여넣으면 전역 핸들러가 자동 전송하지 않는다 (일반 입력)', async () => {
    w = await mountApp()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    pasteEvent(ta, 'typed text')
    await flush()
    expect(publish).not.toHaveBeenCalled()
    ta.remove()
  })

  it('입력 요소가 아닌 곳에 붙여넣으면 기존처럼 자동 공유된다', async () => {
    w = await mountApp()
    pasteEvent(document.body, 'auto text')
    await flush()
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toMatchObject({ type: 'text-shared', content: 'auto text' })
  })
})
