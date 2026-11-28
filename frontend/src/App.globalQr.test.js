import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const track = vi.hoisted(() => vi.fn())
const confirmed = vi.hoisted(() => vi.fn())
vi.mock('./composables/usePublicShareGuard.js', async (orig) => {
  const m = await orig()
  return { ...m, usePublicShareGuard: () => { const g = m.usePublicShareGuard(); const mc = g.markConfirmed; return { ...g, markConfirmed: (...a) => { confirmed(); return mc(...a) } } } }
})
vi.mock('./utils/analytics', () => ({ trackEvent: track, trackPageView: vi.fn(), setUserProperty: vi.fn() }))
vi.mock('./composables/useSocket', () => ({
  useSocket: () => ({
    isConnected: ref(false), usersInRoom: ref(1), ipRoomDevices: ref([]), globalRoomDevices: ref([]), privateRoomDevices: ref({}),
    myIdentity: ref(null), mySocketId: ref('me'), rerollAvailableAt: ref(0),
    globalRoomId: ref('G'), ipRoomId: ref('I'),
    connect: vi.fn(async () => ({ globalRoomId: 'G', ipRoomId: 'I' })), disconnect: vi.fn(), destroy: vi.fn(),
    onReconnected: vi.fn(), onMessage: vi.fn(() => () => {}), onUserLeft: vi.fn(() => () => {}),
    publishMessage: vi.fn(), getSelfSender: () => ({ socketId: 'me' }), rerollIdentity: vi.fn(), leavePrivate: vi.fn(async () => ({ ok: true }))
  })
}))
vi.mock('./composables/useFileManager', () => ({
  useFileManager: () => ({
    files: ref([]), isLoading: ref(false), clearFiles: vi.fn(), loadFilesFromRooms: vi.fn(), roomSize: () => 0,
    uploadFiles: vi.fn(async () => ({ successCount: 0 })), hasMoreForRoom: () => false, addFile: vi.fn(), removeFile: vi.fn(), clearRoomFiles: vi.fn()
  })
}))
vi.mock('./services/p2pProbe', () => ({ startP2pProbe: vi.fn() }))
vi.mock('./services/socketService', () => ({ socketService: {} }))
vi.mock('./composables/useSeoMeta', () => ({ useSeoMeta: vi.fn() }))

import App from './App.vue'
import i18n from './i18n/index.js'
import { notificationService } from './services/notificationService.js'

const RoomScreenStub = { name: 'RoomScreen', template: '<div />', props: ['scope'] }
const flush = async () => { for (let i = 0; i < 5; i++) await flushPromises() }

async function mountAt(url, stored) {
  window.history.replaceState(null, '', url)
  localStorage.clear()
  if (stored) localStorage.setItem('share-scope', stored)
  window.history.replaceState.mockClear?.()
  const w = mount(App, {
    global: { plugins: [i18n], stubs: { RoomScreen: RoomScreenStub, DownloadPage: true, NotificationToast: true, ShareConfirmSheet: true } },
    attachTo: document.body
  })
  await new Promise((r) => setTimeout(r, 300))
  await flush()
  return w
}

describe('App ?open=global (전체 공유 QR 도착)', () => {
  let w, toastSpy, replaceSpy
  beforeEach(() => {
    i18n.global.locale.value = 'ko'
    track.mockClear()
    toastSpy = vi.spyOn(notificationService, 'showNotification')
    replaceSpy = vi.spyOn(window.history, 'replaceState')
  })
  afterEach(() => { toastSpy.mockRestore(); replaceSpy.mockRestore(); w?.unmount(); localStorage.clear(); window.history.replaceState(null, '', '/') })

  it('전체 공유 탭으로 열고, 저장하지 않으며, 토스트·이벤트를 한 번 보낸다', async () => {
    w = await mountAt('/?utm_source=qr&open=global', 'ip')
    expect(w.findComponent({ name: 'RoomScreen' }).props('scope')).toBe('global')
    expect(localStorage.getItem('share-scope')).toBe('ip')
    expect(toastSpy.mock.calls.filter(([m]) => String(m).includes('전체 공유 탭으로 열었어요'))).toHaveLength(1)
    expect(track.mock.calls.filter(([n]) => n === 'global_qr_arrive')).toHaveLength(1)
  })

  it('주소에서 open만 지우고 다른 파라미터와 해시는 남긴다', async () => {
    w = await mountAt('/?utm_source=qr&open=global&x=1#frag', 'ip')
    const urls = replaceSpy.mock.calls.map((c) => String(c[2]))
    expect(urls).toContain('/?utm_source=qr&x=1#frag')
    expect(urls.every((u) => !u.includes('open=global'))).toBe(true)
  })

  it('markConfirmed를 부르지 않아 첫 전체 공유 전송 확인이 그대로 남는다', async () => {
    confirmed.mockClear()
    w = await mountAt('/?open=global', 'ip')
    expect(confirmed).not.toHaveBeenCalled()
  })

  it('새로고침(저장값만 있는 새 마운트)하면 기억된 스코프로 돌아간다', async () => {
    w = await mountAt('/?open=global', 'ip')
    w.unmount()
    w = await mountAt('/', 'ip')
    expect(w.findComponent({ name: 'RoomScreen' }).props('scope')).toBe('ip')
  })

  it('open 파라미터가 없으면 아무 일도 없다', async () => {
    w = await mountAt('/?utm_source=qr', 'ip')
    expect(w.findComponent({ name: 'RoomScreen' }).props('scope')).toBe('ip')
    expect(track.mock.calls.some(([n]) => n === 'global_qr_arrive')).toBe(false)
  })
})
