import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePairFlow } from './usePairFlow.js'
import { usePrivateRooms } from './usePrivateRooms.js'

// 서버 이벤트를 흉내 내는 가짜 어댑터
function fakeAdapter() {
  const handlers = new Map()
  const emitted = []
  return {
    emitted,
    emit: vi.fn(async (event, payload) => {
      emitted.push([event, payload])
      if (event === 'pair:invite') return { ok: true, sessionId: 'S1', expiresAt: Date.now() + 60000 }
      return { ok: true }
    }),
    on: (ev, fn) => { handlers.set(ev, fn) },
    off: (ev) => { handlers.delete(ev) },
    fire: (ev, payload) => handlers.get(ev)?.(payload)
  }
}
const t = (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k)
const peer = { socketId: 'B', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }

describe('usePairFlow', () => {
  let adapter, notify, track, flow
  beforeEach(() => {
    usePrivateRooms().resetPrivateRooms()
    adapter = fakeAdapter()
    notify = { showInfo: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }
    track = vi.fn()
    flow = usePairFlow({ adapter, privateRooms: usePrivateRooms(), notify, track, t })
  })
  afterEach(() => { flow.destroy(); document.title = '' })

  it('초대하면 해당 기기 행이 pending이 되고 GA pair_invite, 취소하면 사라진다', async () => {
    await flow.invite({ socketId: 'B' })
    expect(track).toHaveBeenCalledWith('pair_invite')
    expect(flow.pairStates.value.B).toMatchObject({ state: 'pending', sessionId: 'S1' })
    await flow.cancel('S1')
    expect(adapter.emitted.some(([e]) => e === 'pair:cancel')).toBe(true)
    expect(flow.pairStates.value.B).toBeUndefined()
    expect(notify.showInfo).not.toHaveBeenCalled() // 내가 취소한 것은 알리지 않음
  })

  it('초대 실패 코드는 토스트로 안내한다', async () => {
    adapter.emit.mockImplementationOnce(async () => ({ ok: false, code: 'COOLDOWN' }))
    await flow.invite({ socketId: 'B' })
    expect(notify.showError).toHaveBeenCalledWith('pair.errors.COOLDOWN')
    expect(flow.pairStates.value.B).toBeUndefined()
  })

  it('받은 요청: 첫 요청이 incoming, pair_incoming 이벤트, 숨겨진 탭이면 제목에 "(1) ", 응답하면 복원', async () => {
    document.title = 'Clipboard'
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    adapter.fire('pair:incoming', { sessionId: 'R1', from: peer, sameNetwork: true, expiresAt: 1 })
    adapter.fire('pair:incoming', { sessionId: 'R2', from: peer, sameNetwork: false, expiresAt: 1 })
    expect(flow.incoming.value.sessionId).toBe('R1')
    expect(track).toHaveBeenCalledWith('pair_incoming', { same_network: true })
    expect(document.title).toBe('(1) Clipboard')
    await flow.respond(false, { block: true })
    expect(track).toHaveBeenCalledWith('pair_decline', { blocked: true })
    expect(adapter.emitted.find(([e]) => e === 'pair:respond')[1]).toMatchObject({ sessionId: 'R1', accept: false, block: true })
    expect(flow.incoming.value.sessionId).toBe('R2') // 대기열의 다음 요청
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.title).toBe('Clipboard')
  })

  it('상대가 거절/불일치로 끝나면 사유 토스트와 pair_mismatch 이벤트', async () => {
    await flow.invite({ socketId: 'B' })
    adapter.fire('pair:ended', { sessionId: 'S1', reason: 'declined' })
    expect(notify.showInfo).toHaveBeenCalledWith('pair.ended.declined')
    adapter.fire('pair:incoming', { sessionId: 'R9', from: peer, sameNetwork: true })
    adapter.fire('pair:ended', { sessionId: 'R9', reason: 'mismatch' })
    expect(track).toHaveBeenCalledWith('pair_mismatch')
    expect(notify.showError).toHaveBeenCalledWith('pair.ended.mismatch')
  })
})
