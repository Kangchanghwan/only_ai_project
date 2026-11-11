import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../i18n/translate', () => ({ currentLocale: () => 'ko' }))
const pushBind = vi.fn()
vi.mock('../services/socketService', () => ({ socketService: { pushBind: (...a) => pushBind(...a) } }))
const roomsRef = { rooms: [] }
vi.mock('./usePrivateRooms', () => ({ usePrivateRooms: () => roomsRef }))

import { trackEvent } from '../utils/analytics'
import { usePush, getPushId, _resetPushForTests, PUSH_ID_KEY, PUSH_STATE_KEY } from './usePush'

const SERVER_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

function makeSub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dhvalue', auth: 'authvalue' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

let reg
let fetchMock
let notif

function setup({ key = SERVER_KEY, permission = 'default', requestResult = 'granted', existingSub = null } = {}) {
  reg = {
    pushManager: {
      getSubscription: vi.fn(async () => existingSub),
      subscribe: vi.fn(async () => makeSub()),
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } })
  window.PushManager = function PushManager() {}
  notif = { permission, requestPermission: vi.fn(async () => { notif.permission = requestResult; return requestResult }) }
  globalThis.Notification = notif
  fetchMock = vi.fn(async (url, init) => {
    if (String(url).endsWith('/api/push/key')) {
      return key ? { ok: true, status: 200, json: async () => ({ key }) } : { ok: false, status: 404, json: async () => ({ error: 'PUSH_DISABLED' }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  })
  vi.stubGlobal('fetch', fetchMock)
}

const postBodies = (path) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(path)).map(([, init]) => JSON.parse(init.body))

describe('usePush', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetPushForTests()
    pushBind.mockClear()
    vi.mocked(trackEvent).mockClear()
    roomsRef.rooms = []
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete globalThis.Notification
    delete window.PushManager
    delete navigator.serviceWorker
  })

  it('pid는 소문자 hex 32자이고 localStorage에 한 번만 만든다', () => {
    const a = getPushId()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(getPushId()).toBe(a)
    expect(localStorage.getItem(PUSH_ID_KEY)).toBe(a)
  })

  it('서버 키가 404면 지원하지 않음(UI 숨김)', async () => {
    setup({ key: null })
    const push = usePush()
    expect(await push.init()).toBe(false)
    expect(push.supported.value).toBe(false)
  })

  it('브라우저가 PushManager를 지원하지 않으면 키를 묻지도 않는다', async () => {
    setup()
    delete window.PushManager
    const push = usePush()
    expect(await push.init()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(push.supported.value).toBe(false)
  })

  it('키가 있고 기능이 있으면 지원', async () => {
    setup()
    const push = usePush()
    expect(await push.init()).toBe(true)
    expect(push.supported.value).toBe(true)
    expect(push.enabled.value).toBe(false)
  })

  it('enable 성공: 권한 → 구독 → 서버 등록(방 ID 없이 입장권만) → on → 소켓 묶기', async () => {
    setup()
    roomsRef.rooms = [{ roomId: 'prv-aaaaaaaaaaaaaaaaaaaaaaaa', ticket: 'pv1.T1', status: 'online' }, { roomId: 'prv-b', ticket: 'pv1.T2', status: 'left' }, { roomId: 'prv-c', ticket: null, status: 'online' }]
    const push = usePush()
    const res = await push.enable()
    expect(res).toEqual({ ok: true })
    expect(notif.requestPermission).toHaveBeenCalled()
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }))
    const [body] = postBodies('/api/push/subscribe')
    expect(body).toEqual({
      pid: getPushId(),
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p256dhvalue', auth: 'authvalue' } },
      lang: 'ko',
      tickets: ['pv1.T1'],
    })
    expect(Object.keys(body)).not.toContain('roomId')
    expect(localStorage.getItem(PUSH_STATE_KEY)).toBe('on')
    expect(push.enabled.value).toBe(true)
    expect(pushBind).toHaveBeenCalledWith(getPushId())
    expect(trackEvent).toHaveBeenCalledWith('push_subscribe', { result: 'ok' })
  })

  it('enable 권한 거부: 구독하지 않고 denied', async () => {
    setup({ requestResult: 'denied' })
    const push = usePush()
    const res = await push.enable()
    expect(res).toEqual({ ok: false, reason: 'denied' })
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled()
    expect(localStorage.getItem(PUSH_STATE_KEY)).toBeNull()
    expect(push.permission.value).toBe('denied')
    expect(trackEvent).toHaveBeenCalledWith('push_subscribe', { result: 'denied' })
  })

  it('enable 중 서버 오류면 error, 상태는 켜지지 않는다', async () => {
    setup()
    fetchMock.mockImplementation(async (url) => (String(url).endsWith('/api/push/key')
      ? { ok: true, json: async () => ({ key: SERVER_KEY }) }
      : { ok: false, status: 503, json: async () => ({}) }))
    const push = usePush()
    const res = await push.enable()
    expect(res).toEqual({ ok: false, reason: 'error' })
    expect(push.enabled.value).toBe(false)
    expect(trackEvent).toHaveBeenCalledWith('push_subscribe', { result: 'error' })
  })

  it('분석 이벤트에 방 ID·입장권·키·endpoint가 없다', async () => {
    setup()
    roomsRef.rooms = [{ roomId: 'prv-secretroom', ticket: 'pv1.SECRETTICKET', status: 'online' }]
    await usePush().enable()
    const logged = JSON.stringify(vi.mocked(trackEvent).mock.calls)
    for (const s of ['prv-secretroom', 'SECRETTICKET', 'p256dhvalue', 'authvalue', 'fcm.googleapis.com']) expect(logged).not.toContain(s)
  })

  it('sync: 꺼져 있으면 아무것도 하지 않는다', async () => {
    setup({ permission: 'granted' })
    await usePush().sync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sync: 켜져 있고 권한이 있으면 구독을 확인해 서버에 다시 등록하고 소켓에 묶는다', async () => {
    const sub = makeSub()
    setup({ permission: 'granted', existingSub: sub })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    await usePush().sync()
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled()
    expect(postBodies('/api/push/subscribe')).toHaveLength(1)
    expect(pushBind).toHaveBeenCalledWith(getPushId())
  })

  it('sync: 구독이 사라졌으면 다시 구독한다', async () => {
    setup({ permission: 'granted', existingSub: null })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    await usePush().sync()
    expect(reg.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(postBodies('/api/push/subscribe')).toHaveLength(1)
  })

  it('sync: 권한이 회수됐으면 아무것도 하지 않는다', async () => {
    setup({ permission: 'denied' })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    await usePush().sync()
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled()
    expect(postBodies('/api/push/subscribe')).toHaveLength(0)
  })

  it('sync 실패는 조용히 넘어간다', async () => {
    setup({ permission: 'granted' })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    reg.pushManager.getSubscription.mockRejectedValue(new Error('boom'))
    await expect(usePush().sync()).resolves.toBeUndefined()
  })

  it('sync를 동시에 여러 번 불러도 겹쳐 돌지 않는다', async () => {
    setup({ permission: 'granted', existingSub: makeSub() })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    const push = usePush()
    const a = push.sync(); push.sync(); push.sync()
    await a
    await new Promise((r) => setTimeout(r, 20))
    expect(postBodies('/api/push/subscribe').length).toBeLessThanOrEqual(2)
  })

  it('disable: 구독 해제 + 서버 unsubscribe(pid, endpoint) + off', async () => {
    const sub = makeSub()
    setup({ permission: 'granted', existingSub: sub })
    localStorage.setItem(PUSH_STATE_KEY, 'on')
    const push = usePush()
    await push.init()
    expect(push.enabled.value).toBe(true)
    await push.disable()
    expect(sub.unsubscribe).toHaveBeenCalled()
    expect(postBodies('/api/push/unsubscribe')).toEqual([{ pid: getPushId(), endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }])
    expect(localStorage.getItem(PUSH_STATE_KEY)).toBe('off')
    expect(push.enabled.value).toBe(false)
    expect(trackEvent).toHaveBeenCalledWith('push_unsubscribe')
  })
})
