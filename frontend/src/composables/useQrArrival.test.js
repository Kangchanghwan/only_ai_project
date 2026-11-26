import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useQrArrival, QR_FALLBACK_FLAG, QR_ROSTER_TIMEOUT_MS, resultOfReason } from './useQrArrival'
import { roomTag } from '../utils/qrLink.js'

const link = { s: 'pc1', k: '1-2-0', g: 'AbCd12', x: new Uint8Array(16), f: 'f'.repeat(22) }
const ME = { socketId: 'me' }
const PC = { socketId: 'pc1', identity: { adj: 1, animal: 2, suffix: 0 } }

function setup(over = {}) {
  const state = { ip: [], global: [], me: 'me', states: {}, sessions: [] }
  const track = vi.fn()
  const invite = vi.fn(async () => ({ ok: true, sessionId: 'S1' }))
  const openRoom = vi.fn()
  const notify = { showError: vi.fn(), showSuccess: vi.fn() }
  let timerFn = null
  const q = useQrArrival({
    getIpDevices: () => state.ip, getGlobalDevices: () => state.global, getMySocketId: () => state.me,
    getPairStates: () => state.states, getSessions: () => state.sessions,
    invite, openRoom, notify, t: (k) => k, track,
    setTimer: (fn) => { timerFn = fn; return 1 }, clearTimer: () => { timerFn = null },
    ...over,
  })
  return { q, state, track, invite, openRoom, notify, fireTimeout: () => timerFn?.() }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => sessionStorage.clear())

const ROOM = 'prv-0123456789abcdef01234567'

describe('useQrArrival 방 꼬리표', () => {
  it('꼬리표가 맞는 방이 있으면 같은 네트워크여도 그 방을 열고 room_tag', async () => {
    const r = await roomTag(link.x, ROOM)
    const s = setup({ getRoomIds: async () => ['prv-ffffffffffffffffffffffff', ROOM] })
    s.q.start({ ...link, r })
    s.state.ip = [ME, PC]
    s.q.update()
    await vi.waitFor(() => expect(s.openRoom).toHaveBeenCalledWith(ROOM))
    expect(s.invite).not.toHaveBeenCalled()
    expect(s.notify.showSuccess).toHaveBeenCalledWith('roomQr.opened')
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'room_tag' })
  })

  it('맞는 방이 없으면 지금까지처럼 (다른 네트워크면 연결 요청)', async () => {
    const r = await roomTag(link.x, ROOM)
    const s = setup({ getRoomIds: async () => ['prv-ffffffffffffffffffffffff'] })
    s.q.start({ ...link, r })
    s.state.ip = [ME]; s.state.global = [ME, PC]
    s.q.update()
    await vi.waitFor(() => expect(s.invite).toHaveBeenCalledTimes(1))
    expect(s.openRoom).not.toHaveBeenCalled()
  })
})

describe('useQrArrival', () => {
  it('같은 네트워크 목록에 PC가 있으면 요청하지 않고 same_network', async () => {
    const s = setup()
    s.q.start(link)
    s.state.ip = [ME, { socketId: 'other-socket', identity: { adj: 1, animal: 2, suffix: 0 } }] // 소켓이 바뀌어도 이름표로 안다
    s.q.update(); await flush()
    expect(s.invite).not.toHaveBeenCalled()
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'same_network' })
  })

  it('내 소켓이 든 목록이 오기 전에는 판정하지 않는다', async () => {
    const s = setup()
    s.q.start(link)
    s.state.ip = [PC]
    s.q.update(); await flush()
    expect(s.track).not.toHaveBeenCalled()
  })

  it('다른 네트워크면 그 PC에 QR 연결 요청을 1번 보내고 맨 위에 둔다. 끝나면 room_ok', async () => {
    const s = setup()
    s.q.start(link)
    s.state.ip = [ME]; s.state.global = [ME, PC]
    s.q.update(); await flush()
    expect(s.invite).toHaveBeenCalledTimes(1)
    expect(s.invite.mock.calls[0][0]).toBe(PC)
    expect(s.invite.mock.calls[0][1]).toEqual({ qr: { g: link.g, x: link.x, f: link.f }, silent: true })
    expect(s.q.pinned.value).toEqual(PC)
    s.q.update(); await flush()
    expect(s.invite).toHaveBeenCalledTimes(1)
    s.state.sessions = [{ sessionId: 'S1', state: 'done' }]
    s.q.update()
    expect(s.q.pinned.value).toBeNull()
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'room_ok' })
  })

  it('전체 공유 목록에 없어도 QR 정보로 줄을 만들어 요청한다', async () => {
    const s = setup()
    s.q.start(link)
    s.state.ip = [ME]
    s.q.update(); await flush()
    expect(s.invite.mock.calls[0][0]).toEqual({ socketId: 'pc1', identity: { adj: 1, animal: 2, suffix: 0 } })
  })

  it('이미 같은 방이면 요청 없이 그 방으로 이동한다', async () => {
    const s = setup()
    s.q.start(link)
    s.state.ip = [ME]; s.state.global = [ME, PC]; s.state.states = { pc1: { state: 'paired', roomId: 'prv-g-1' } }
    s.q.update(); await flush()
    expect(s.invite).not.toHaveBeenCalled()
    expect(s.openRoom).toHaveBeenCalledWith('prv-g-1')
  })

  it('PC를 못 찾으면 안내하고 not_found', async () => {
    const s = setup({ invite: vi.fn(async () => ({ ok: false, code: 'TARGET_NOT_FOUND' })) })
    s.q.start(link)
    s.state.ip = [ME]
    s.q.update(); await flush()
    expect(s.notify.showError).toHaveBeenCalledWith('qrLink.notFound')
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'not_found' })
    expect(s.q.pinned.value).toBeNull()
  })

  it('거절 이유를 측정 값으로 바꾼다', async () => {
    expect(['qr-expired', 'qr-invalid', 'qr-busy', 'declined', 'expired', 'cancelled'].map(resultOfReason))
      .toEqual(['expired', 'expired', 'busy', 'declined', 'timeout', 'error'])
    const s = setup()
    s.q.start(link)
    s.state.ip = [ME]
    s.q.update(); await flush()
    s.state.sessions = [{ sessionId: 'S1', state: 'ended', reason: 'qr-busy' }]
    s.q.update()
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'busy' })
  })

  it('내 QR을 내가 찍으면 아무것도 하지 않는다', async () => {
    const s = setup()
    s.state.me = 'pc1'
    s.q.start(link)
    s.state.ip = [{ socketId: 'pc1' }]
    s.q.update(); await flush()
    expect(s.invite).not.toHaveBeenCalled()
    expect(s.track).not.toHaveBeenCalled()
  })

  it('목록이 5초 안에 오지 않으면 error', () => {
    const s = setup()
    s.q.start(link)
    s.fireTimeout()
    expect(QR_ROSTER_TIMEOUT_MS).toBe(5000)
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'error' })
  })

  it('# 뒤가 없으면 no_hash. 측정은 세션당 1회', () => {
    const s = setup()
    s.q.markNoHash()
    expect(s.track).toHaveBeenCalledWith('qr_code_fallback', { result: 'no_hash' })
    expect(sessionStorage.getItem(QR_FALLBACK_FLAG)).toBe('1')
    const s2 = setup()
    s2.q.markNoHash()
    expect(s2.track).not.toHaveBeenCalled()
  })
})
