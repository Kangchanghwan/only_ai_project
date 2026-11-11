import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const joinPrivate = vi.fn()
const createPrivate = vi.fn()
const invitePrivate = vi.fn()
const loadFiles = vi.fn()
const track = vi.fn()
const privateDevices = ref({})
let messageHandler = null
let reconnectCb = null

vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(true), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: privateDevices,
    myIdentity: ref({ adj: 1, animal: 1 }), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn((cb) => { reconnectCb = cb }), onMessage: vi.fn((cb) => { messageHandler = cb; return () => {} }), onUserLeft: vi.fn(() => () => {}),
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
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }))
vi.mock('./utils/analytics', async (orig) => ({ ...(await orig()), trackEvent: (...a) => track(...a) }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { usePrivateRooms } from './composables/usePrivateRooms.js'
import { notificationService } from './services/notificationService.js'
import { createMemoryPrivateRoomStore } from './utils/privateRoomDb.js'
import { newRoomSecret } from './utils/pairCrypto.js'
import { buildInviteUrl } from './utils/groupInvite.js'

const G = 'prv-g-' + 'ab12'.repeat(6)
const G2 = 'prv-g-' + 'cd34'.repeat(6)
const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope', 'privateRooms'], emits: ['group-create', 'group-invite', 'leave-private'] }
const flush = async () => { for (let i = 0; i < 6; i++) await flushPromises() }
const room = (w) => w.findComponent({ name: 'RoomScreen' })
const hashOf = (url) => url.slice(url.indexOf('#'))
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const peerDev = { socketId: 'other', identity: { adj: 2, animal: 2 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
const inviteHash = (over = {}) => hashOf(buildInviteUrl('https://app.test', { roomId: G2, ticket: 'pv1.' + G2 + '.invite', secret: newRoomSecret(), name: '친구 방', ...over }))

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

describe('App 그룹 방', () => {
  const pr = usePrivateRooms()
  let store, w, toastSpy
  beforeEach(async () => {
    joinPrivate.mockReset(); createPrivate.mockReset(); invitePrivate.mockReset(); loadFiles.mockReset(); track.mockReset()
    joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: [] })
    privateDevices.value = {}
    store = createMemoryPrivateRoomStore()
    pr.setStore(store)
    pr.resetPrivateRooms()
    window.__csGroupInvite = undefined
    notificationService.hideNotification()
    toastSpy = vi.spyOn(notificationService, 'showNotification')
  })
  const toasts = (text) => toastSpy.mock.calls.filter(([m]) => String(m).includes(text)).length
  afterEach(() => { toastSpy?.mockRestore(); w?.unmount(); localStorage.clear(); pr.resetPrivateRooms(); window.__csGroupInvite = undefined })

  describe('초대 링크(window.__csGroupInvite)', () => {
    it('열기만 하면 확인 시트만 뜨고 join은 보내지 않는다. 비밀은 window에서 지워진다', async () => {
      window.__csGroupInvite = inviteHash()
      w = await mountApp()
      expect(window.__csGroupInvite).toBeUndefined()
      expect(q('group-join-sheet')).not.toBeNull()
      expect(q('group-join-title').textContent).toBe("'친구 방'에 들어갈까요?")
      expect(joinPrivate).not.toHaveBeenCalled()
      expect(pr.has(G2)).toBe(false)
      expect(JSON.stringify(track.mock.calls)).not.toContain('pv1')
    })

    it('"들어가기"를 눌러야 join을 보내고, 성공하면 방이 추가되고 그 방 탭으로 이동한다', async () => {
      window.__csGroupInvite = inviteHash()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G2, ticket: 'pv1.long', devices: [{ socketId: 'me' }] }], invalid: [] })
      w = await mountApp()
      expect(joinPrivate).not.toHaveBeenCalled()
      q('group-join-confirm').click()
      await vi.waitFor(() => expect(pr.has(G2)).toBe(true))
      await flush()
      expect(joinPrivate).toHaveBeenCalledWith(['pv1.' + G2 + '.invite'])
      expect(pr.rooms.find((r) => r.roomId === G2)).toMatchObject({ name: '친구 방', ticket: 'pv1.long', peer: null })
      expect(room(w).props('scope')).toBe('prv:' + G2)
      expect(q('group-join-sheet')).toBeNull()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'joined' })
    })

    it('취소하면 join 없이 닫힌다', async () => {
      window.__csGroupInvite = inviteHash()
      w = await mountApp()
      q('group-join-cancel').click()
      await flush()
      expect(joinPrivate).not.toHaveBeenCalled()
      expect(q('group-join-sheet')).toBeNull()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'cancel' })
    })

    it('그룹 시트(입장 확인·초대)가 열려 있는 동안 창 드롭 오버레이는 막힌다', async () => {
      window.__csGroupInvite = inviteHash()
      w = await mountApp()
      const overlay = () => w.findComponent({ name: 'WindowDropOverlay' })
      expect(q('group-join-sheet')).not.toBeNull()
      expect(overlay().props('blocked')).toBe(true)
      q('group-join-cancel').click()
      await flush()
      expect(overlay().props('blocked')).toBe(false)
      invitePrivate.mockResolvedValue({ ok: true, ticket: 'pv1.inv', expiresAt: Date.now() + 600000 })
      createPrivate.mockResolvedValue({ ok: true, roomId: G, ticket: 'pv1.own', devices: [{ socketId: 'me' }] })
      room(w).vm.$emit('group-create')
      await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
      expect(overlay().props('blocked')).toBe(true)
      expect(overlay().props('scopeKind')).toBe('group')
      q('group-invite-close').click()
      await flush()
      expect(overlay().props('blocked')).toBe(false)
    })

    it('형식이 틀린 링크는 시트 없이 안내만 한다', async () => {
      window.__csGroupInvite = '#/pv?r=nope&t=pv1.x&k=short'
      w = await mountApp()
      expect(q('group-join-sheet')).toBeNull()
      expect(joinPrivate).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'invalid' })
      expect(toasts('초대 링크가 올바르지 않아요')).toBe(1)
    })

    it('이미 들어가 있는 방의 링크는 시트 없이 그 방으로 전환한다', async () => {
      await pr.addRoom({ roomId: G2, roomSecret: newRoomSecret(), ticket: 'T', name: '친구 방' })
      pr.rooms.splice(0, pr.rooms.length)
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G2, ticket: 'T2', devices: [{ socketId: 'me' }] }], invalid: [] })
      window.__csGroupInvite = inviteHash()
      w = await mountApp()
      expect(q('group-join-sheet')).toBeNull()
      expect(room(w).props('scope')).toBe('prv:' + G2)
      expect(track).toHaveBeenCalledWith('group_join', { result: 'already' })
      expect(joinPrivate).toHaveBeenCalledTimes(1) // 시작할 때의 재입장 1회뿐 (초대 입장권은 보내지 않는다)
      expect(joinPrivate.mock.calls[0][0]).toEqual(['T'])
    })

    it('이미 열린 탭에서 cs-group-invite 이벤트로 들어온 링크도 확인 시트를 거친다', async () => {
      w = await mountApp()
      expect(q('group-join-sheet')).toBeNull()
      window.__csGroupInvite = inviteHash()
      window.dispatchEvent(new Event('cs-group-invite'))
      await flush()
      expect(q('group-join-sheet')).not.toBeNull()
      expect(window.__csGroupInvite).toBeUndefined()
      expect(joinPrivate).not.toHaveBeenCalled()
    })
  })

  describe('방 만들기·초대', () => {
    it('"＋ 방" → 서버에 방 만들기 → 그 방 탭 + 초대 시트(QR)', async () => {
      createPrivate.mockResolvedValue({ ok: true, roomId: G, ticket: 'pv1.own', devices: [{ socketId: 'me' }] })
      invitePrivate.mockResolvedValue({ ok: true, ticket: 'pv1.' + G + '.inv', expiresAt: Date.now() + 600000 })
      w = await mountApp()
      room(w).vm.$emit('group-create')
      await vi.waitFor(() => expect(q('group-invite-qr')).not.toBeNull())
      await flush()
      expect(createPrivate).toHaveBeenCalledTimes(1)
      expect(pr.has(G)).toBe(true)
      expect(room(w).props('scope')).toBe('prv:' + G)
      expect(q('group-invite-sheet')).not.toBeNull()
      expect(q('group-invite-qr').getAttribute('src')).toBe('data:image/png;base64,QR')
      expect(track).toHaveBeenCalledWith('group_create')
    })

    it('Strip의 초대 버튼(group-invite)이 새 초대 입장권으로 시트를 연다', async () => {
      await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), ticket: 'T', name: '내 방' })
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G, ticket: 'T2', devices: [{ socketId: 'me' }] }], invalid: [] })
      pr.rooms.splice(0, pr.rooms.length)
      invitePrivate.mockResolvedValue({ ok: true, ticket: 'pv1.' + G + '.inv2', expiresAt: 1 })
      w = await mountApp()
      room(w).vm.$emit('group-invite', G)
      await flush()
      expect(invitePrivate).toHaveBeenCalledWith(G)
      expect(q('group-invite-sheet')).not.toBeNull()
    })
  })

  describe('그룹 방 상태', () => {
    const seedGroup = async () => {
      await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), ticket: 'T', name: '내 방' })
      pr.rooms.splice(0, pr.rooms.length)
    }

    it('private-left를 받아도 그룹 방은 left가 되지 않고 저장소에서도 지워지지 않는다', async () => {
      await seedGroup()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G, ticket: 'T2', devices: [{ socketId: 'me' }, peerDev] }], invalid: [] })
      w = await mountApp()
      expect(pr.rooms[0].status).toBe('online')
      messageHandler({ type: 'private-left', roomId: G })
      await flush()
      expect(pr.rooms[0].status).toBe('online')
      expect(pr.has(G)).toBe(true)
      expect((await store.load()).map((r) => r.roomId)).toContain(G)
    })

    it('다른 기기가 하나라도 있으면 online, 모두 나가면 offline (여러 명)', async () => {
      await seedGroup()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G, ticket: 'T2', devices: [{ socketId: 'me' }] }], invalid: [] })
      w = await mountApp()
      const status = () => room(w).props('privateRooms').find((r) => r.roomId === G).status
      expect(status()).toBe('offline')
      privateDevices.value = { [G]: [{ socketId: 'me' }, peerDev, { socketId: 'third' }] }
      await flush()
      expect(status()).toBe('online')
      privateDevices.value = { [G]: [{ socketId: 'me' }, { socketId: 'third' }] }
      await flush()
      expect(status()).toBe('online')
      privateDevices.value = { [G]: [{ socketId: 'me' }] }
      await flush()
      expect(status()).toBe('offline')
    })

    it('재접속 rejoin: peer를 건드리지 않고(null 유지), 정원이 찬 방(full)은 지우지 않고 offline + 안내 한 번', async () => {
      await seedGroup()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: [], full: [G] })
      w = await mountApp()
      expect(pr.has(G)).toBe(true)
      expect(pr.rooms[0]).toMatchObject({ status: 'offline', peer: null, ticket: 'T' })
      expect((await store.load()).map((r) => r.roomId)).toContain(G)
      expect(toasts('방이 가득 찼어요')).toBe(1)
      // 재연결 때 또 full이어도 같은 안내를 다시 띄우지 않는다
      reconnectCb()
      await flush()
      expect(joinPrivate).toHaveBeenCalledTimes(2)
      expect(pr.has(G)).toBe(true)
      expect(toasts('방이 가득 찼어요')).toBe(1)
    })

    it('rejoin에서 입장권이 만료(invalid)된 그룹 방은 목록에서 지운다', async () => {
      await seedGroup()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: ['T'] })
      w = await mountApp()
      expect(pr.has(G)).toBe(false)
      expect(toasts('방 입장권이 만료됐어요')).toBe(1)
      expect(toasts('1:1')).toBe(0)
    })

    it('"방 나가기"는 group_leave 이벤트를 남기고 방을 지운다', async () => {
      await seedGroup()
      joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G, ticket: 'T2', devices: [{ socketId: 'me' }] }], invalid: [] })
      w = await mountApp()
      room(w).vm.$emit('leave-private', G)
      await flush()
      expect(pr.has(G)).toBe(false)
      expect(track).toHaveBeenCalledWith('group_leave')
      expect(track).not.toHaveBeenCalledWith('pair_leave')
    })
  })
})
