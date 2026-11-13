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

describe('App 그림 코드 (PC)', () => {
  it('"＋ 방"은 선택 시트를 열고, "새 방 만들기"는 기존 방 만들기와 같다', async () => {
    w = await mountApp()
    expect(q('room-add-sheet')).toBeNull()
    room(w).vm.$emit('group-add')
    await flush()
    expect(q('room-add-sheet')).not.toBeNull()
    expect(q('room-add-create').textContent).toContain('새 방 만들기')
    expect(q('room-add-enter').textContent).toContain('그림으로 들어가기')
    expect(createPrivate).not.toHaveBeenCalled()
    q('room-add-create').click()
    await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
    expect(createPrivate).toHaveBeenCalledTimes(1)
    expect(q('room-add-sheet')).toBeNull()
  })

  it('초대 시트 기본 탭은 PC에서 QR이고, 그림 탭을 눌러야 코드가 열린다. QR로 돌아가거나 시트를 닫으면 코드가 닫힌다', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-create')
    await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
    expect(q('group-invite-tab-qr').getAttribute('aria-selected')).toBe('true')
    expect(q('group-invite-tab-picture').textContent).toBe('그림')
    expect(mock().hosts).toHaveLength(0)

    q('group-invite-tab-picture').click()
    await vi.waitFor(() => expect(mock().hosts).toHaveLength(1))
    await flush()
    const h = mock().hosts[0]
    expect(h.opts.roomId).toBe(G)
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(q('picture-code-show')).not.toBeNull()
    expect(q('group-invite-qr')).toBeNull()
    expect(q('picture-code-names').textContent).toBe('바나나 · 로켓 · 우산 · 열쇠')

    q('group-invite-tab-qr').click()
    await flush()
    expect(h.close).toHaveBeenCalledTimes(1)
    expect(q('picture-code-show')).toBeNull()

    q('group-invite-tab-picture').click()
    await vi.waitFor(() => expect(mock().hosts).toHaveLength(2))
    await flush()
    q('group-invite-close').click()
    await flush()
    expect(mock().hosts[1].close).toHaveBeenCalledTimes(1)
    expect(q('group-invite-sheet')).toBeNull()
  })

  it('링크 탭은 링크 문구와 복사 버튼을 보여 주고 코드는 열지 않는다', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-create')
    await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
    q('group-invite-tab-link').click()
    await flush()
    expect(q('group-invite-link').textContent).toContain('#')
    expect(q('group-invite-copy')).not.toBeNull()
    expect(mock().hosts).toHaveLength(0)
  })

  it('그림 탭에서 승인 요청이 시트 안에 뜨고, 들이기를 누르면 host.decide(true)', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-create')
    await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
    q('group-invite-tab-picture').click()
    await vi.waitFor(() => expect(mock().hosts).toHaveLength(1))
    await flush()
    const h = mock().hosts[0]
    h.pendingRequest.value = { sessionId: 's1', from: { deviceType: 'mobile', deviceLabel: 'iphone', browser: 'Safari', identity: { adj: 1, animal: 1 } } }
    h.requestCount.value = 1
    await flush()
    expect(q('picture-code-request')).not.toBeNull()
    expect(q('group-invite-sheet').contains(q('picture-code-request'))).toBe(true)
    q('picture-code-approve').click()
    expect(h.decide).toHaveBeenCalledWith(true)
    q('picture-code-renew').click()
    expect(h.renew).toHaveBeenCalledTimes(1)
  })

  it('호스트가 승인해도 따로 토스트를 띄우지 않는다 (방 이름이 붙은 입장 토스트가 대신 알린다)', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-create')
    await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
    q('group-invite-tab-picture').click()
    await vi.waitFor(() => expect(mock().hosts).toHaveLength(1))
    mock().hosts[0].opts.onApproved({ from: { identity: { adj: 1, animal: 1 } } })
    expect(toasts('들어왔어요')).toBe(0)
  })

  it('빈 방 안내/＋방에서 "그림으로 들어가기"를 열면 시트가 뜨고 창 드롭 오버레이가 막힌다', async () => {
    w = await mountApp()
    const overlay = () => w.findComponent({ name: 'WindowDropOverlay' })
    expect(overlay().props('blocked')).toBe(false)
    room(w).vm.$emit('code-enter')
    await vi.waitFor(() => expect(q('picture-code-enter-sheet')).not.toBeNull())
    expect(q('picture-code-enter')).not.toBeNull()
    expect(overlay().props('blocked')).toBe(true)
    expect(track).toHaveBeenCalledWith('code_enter_open')
    q('picture-enter-sheet-close').click()
    await flush()
    expect(q('picture-code-enter-sheet')).toBeNull()
    expect(overlay().props('blocked')).toBe(false)
    expect(mock().joiners[0].cancel).toHaveBeenCalled()
  })

  it('선택 시트의 "그림으로 들어가기"도 입력 시트를 연다', async () => {
    w = await mountApp()
    room(w).vm.$emit('group-add')
    await flush()
    q('room-add-enter').click()
    await vi.waitFor(() => expect(q('picture-code-enter-sheet')).not.toBeNull())
    expect(q('room-add-sheet')).toBeNull()
  })

  const enterCode = async (indices) => {
    for (const i of indices) q(`picture-tile-${i}`).click()
    await flush()
    q('picture-enter-confirm').click()
    await flush()
  }

  it('그림 4개가 승인되면 확인 시트 없이 방에 들어가고 그 방 탭으로 이동하며 입장 토스트를 띄운다', async () => {
    mock().joinResult = { status: 'joined', payload: { secret: b64u(new Uint8Array(32).fill(7)), ticket: 'pv1.' + G2 + '.inv', name: '교실' } }
    joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G2, ticket: 'pv1.long', devices: [{ socketId: 'me' }] }], invalid: [] })
    w = await mountApp()
    room(w).vm.$emit('code-enter')
    await vi.waitFor(() => expect(q('picture-code-enter')).not.toBeNull())
    await flush()
    await enterCode([0, 2, 3, 4])
    await vi.waitFor(() => expect(pr.has(G2)).toBe(true))
    await flush()
    expect(mock().joiners[0].join).toHaveBeenCalledWith([0, 2, 3, 4])
    expect(joinPrivate).toHaveBeenCalledWith(['pv1.' + G2 + '.inv'])
    expect(pr.rooms.find((r) => r.roomId === G2)).toMatchObject({ name: '교실', ticket: 'pv1.long', peer: null })
    expect(q('group-join-sheet')).toBeNull()
    expect(q('picture-code-enter-sheet')).toBeNull()
    expect(room(w).props('scope')).toBe('prv:' + G2)
    expect(toasts('들어왔어요')).toBe(1)
  })

  it('정원이 찼으면(full) 오류 토스트만 띄우고 방은 추가하지 않는다', async () => {
    mock().joinResult = { status: 'joined', payload: { secret: b64u(new Uint8Array(32).fill(7)), ticket: 'pv1.' + G2 + '.inv', name: '교실' } }
    joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: [], full: [G2] })
    w = await mountApp()
    room(w).vm.$emit('code-enter')
    await vi.waitFor(() => expect(q('picture-code-enter')).not.toBeNull())
    await flush()
    await enterCode([1, 1, 1, 1])
    await flush()
    expect(toasts('가득 찼어요')).toBe(1)
    expect(pr.has(G2)).toBe(false)
  })

  it('방이 10개면(tooMany) join을 보내지 않고 오류 토스트', async () => {
    mock().joinResult = { status: 'joined', payload: { secret: b64u(new Uint8Array(32).fill(7)), ticket: 'pv1.' + G2 + '.inv', name: '교실' } }
    for (let i = 0; i < 10; i++) {
      const id = 'prv-g-' + i.toString(16).padStart(2, '0').repeat(12)
      await pr.addRoom({ roomId: id, peer: null, roomSecret: new Uint8Array(32), ticket: 'pv1.x', name: 'r' + i })
    }
    w = await mountApp()
    room(w).vm.$emit('code-enter')
    await vi.waitFor(() => expect(q('picture-code-enter')).not.toBeNull())
    await flush()
    await enterCode([1, 2, 3, 4])
    await flush()
    expect(joinPrivate).not.toHaveBeenCalledWith(['pv1.' + G2 + '.inv']) // (앱 시작 때의 방 다시 들어가기 호출은 따로 있다)
    expect(toasts('들어갈 수 있는 방 수')).toBe(1)
  })

  it('틀린 코드(wrong)면 시트는 열린 채 안내 문구만 나오고 방은 안 생긴다', async () => {
    mock().joinResult = { status: 'wrong' }
    w = await mountApp()
    room(w).vm.$emit('code-enter')
    await vi.waitFor(() => expect(q('picture-code-enter')).not.toBeNull())
    await flush()
    await enterCode([1, 2, 3, 4])
    expect(q('picture-code-enter-sheet')).not.toBeNull()
    expect(joinPrivate).not.toHaveBeenCalled()
  })
})
