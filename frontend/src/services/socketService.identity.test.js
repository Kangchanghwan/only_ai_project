import { describe, it, expect, beforeEach, vi } from 'vitest'
import { socketService, REROLL_COOLDOWN_MS } from './socketService'
import { io } from 'socket.io-client'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), once: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }))
}))

describe('SocketService - 정체성', () => {
  beforeEach(() => {
    socketService.disconnect()
    socketService.myIdentity.value = null
    socketService.rerollAvailableAt.value = 0
    localStorage.clear()
  })

  it('서버가 준 정체성을 상태에 반영하고 localStorage에 저장한다', () => {
    socketService._applyIdentity({ adj: 3, animal: 5 })
    expect(socketService.myIdentity.value).toEqual({ adj: 3, animal: 5 })
    expect(JSON.parse(localStorage.getItem('clipboard-identity'))).toMatchObject({ adj: 3, animal: 5 })
  })

  it('identity가 없거나 잘못되면(구버전 백엔드) 무시한다', () => {
    socketService._applyIdentity(undefined)
    socketService._applyIdentity({ adj: 99, animal: 0 })
    expect(socketService.myIdentity.value).toBeNull()
    expect(localStorage.getItem('clipboard-identity')).toBeNull()
  })

  it('접속 시 auth에 저장된 정체성과 힌트를 담는 함수를 넘긴다', async () => {
    localStorage.setItem('clipboard-identity', JSON.stringify({ adj: 2, animal: 4, savedAt: Date.now() }))
    socketService.connect().catch(() => {})
    const opts = io.mock.calls.at(-1)[1]
    expect(typeof opts.auth).toBe('function')
    const auth = await new Promise((resolve) => opts.auth(resolve))
    expect(auth.identity).toEqual({ adj: 2, animal: 4 })
    expect(auth.hints).toBeTypeOf('object')
  })

  it('다시 뽑기: 서버 응답을 반영하고, 쿨다운 중에는 요청을 보내지 않는다', async () => {
    const emit = vi.fn((event, cb) => cb({ ok: true, identity: { adj: 7, animal: 8 } }))
    socketService.socket = { connected: true, emit }
    const first = await socketService.rerollIdentity()
    expect(first.ok).toBe(true)
    expect(socketService.myIdentity.value).toEqual({ adj: 7, animal: 8 })
    expect(socketService.rerollAvailableAt.value).toBeGreaterThan(Date.now() + REROLL_COOLDOWN_MS - 500)

    const second = await socketService.rerollIdentity()
    expect(second).toEqual({ ok: false, error: 'cooldown' })
    expect(emit).toHaveBeenCalledTimes(1)
    socketService.socket = null
  })

  it('getSelfSender: 내 소켓의 기기 정보를 서버 sender와 같은 모양으로 돌려준다', () => {
    socketService.mySocketId.value = 'me'
    socketService.ipRoomDevices.value = [
      { socketId: 'x', identity: { adj: 0, animal: 0 }, deviceLabel: 'mac', browser: 'Chrome', os: 'macOS', joinedAt: 1 },
      { socketId: 'me', identity: { adj: 1, animal: 1 }, deviceLabel: 'android_phone', browser: 'Chrome', model: 'Pixel 8', os: 'Android', joinedAt: 2 }
    ]
    expect(socketService.getSelfSender()).toEqual({
      socketId: 'me', identity: { adj: 1, animal: 1 }, deviceLabel: 'android_phone', browser: 'Chrome', model: 'Pixel 8'
    })
    socketService.ipRoomDevices.value = []
    expect(socketService.getSelfSender()).toBeUndefined()
    socketService.mySocketId.value = null
  })
})
