import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { io } from 'socket.io-client'
import { socketService } from './socketService'

// Socket.IO 클라이언트 모킹
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false
  }))
}))

describe('SocketService', () => {
  beforeEach(() => {
    // 각 테스트 전에 소켓 연결 해제
    socketService.disconnect()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('초기화', () => {
    it('초기 상태는 연결되지 않은 상태여야 한다', () => {
      expect(socketService.isConnected.value).toBe(false)
      expect(socketService.globalRoomId.value).toBeNull()
      expect(socketService.ipRoomId.value).toBeNull()
      expect(socketService.usersInRoom.value).toBe(0)
      expect(socketService.ipRoomDevices.value).toEqual([])
      expect(socketService.globalRoomDevices.value).toEqual([])
    })

    it('서버 URL이 올바르게 설정되어야 한다', () => {
      expect(socketService.serverUrl).toBeDefined()
    })
  })

  describe('연결 관리', () => {
    it('disconnect 메서드를 호출할 수 있어야 한다', () => {
      // disconnect는 에러 없이 호출될 수 있어야 함
      expect(() => socketService.disconnect()).not.toThrow()

      // 초기 상태 검증
      expect(socketService.isConnected.value).toBe(false)
      expect(socketService.globalRoomId.value).toBeNull()
      expect(socketService.ipRoomId.value).toBeNull()
      expect(socketService.usersInRoom.value).toBe(0)
      expect(socketService.ipRoomDevices.value).toEqual([])
      expect(socketService.globalRoomDevices.value).toEqual([])
    })

    it('connect 호출 시 1초의 재연결 딜레이 옵션을 포함해야 한다', () => {
      socketService.connect().catch(() => {}) // 에러는 무시

      expect(io).toHaveBeenCalledWith(
        socketService.serverUrl,
        expect.objectContaining({
          reconnectionDelay: 1000
        })
      )
    })
  })

  describe('재연결 설정', () => {
    it('재연결 설정이 올바르게 정의되어야 한다', () => {
      expect(socketService.reconnectionConfig).toBeDefined()
      expect(socketService.reconnectionConfig.reconnection).toBe(true)
      expect(socketService.reconnectionConfig.reconnectionAttempts).toBe(5)
      expect(socketService.reconnectionConfig.reconnectionDelay).toBe(1000)
    })
  })

  describe('room-users 이벤트 처리', () => {
    it('roomId에 따라 ipRoomDevices/globalRoomDevices를 분기 저장한다', () => {
      const handlers = {}
      io.mockReturnValueOnce({
        on: vi.fn((event, cb) => { handlers[event] = cb }),
        off: vi.fn(),
        once: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        connected: false
      })

      socketService.connect().catch(() => {})
      handlers.registered({ globalRoomId: 'room-shared', ipRoomId: 'room-ip-abc' })

      handlers['room-users']({ roomId: 'room-ip-abc', devices: [{ socketId: 'x' }] })
      expect(socketService.ipRoomDevices.value).toEqual([{ socketId: 'x' }])
      expect(socketService.globalRoomDevices.value).toEqual([])

      handlers['room-users']({ roomId: 'room-shared', devices: [{ socketId: 'y' }] })
      expect(socketService.globalRoomDevices.value).toEqual([{ socketId: 'y' }])
      expect(socketService.ipRoomDevices.value).toEqual([{ socketId: 'x' }])
    })
  })

  describe('joinPrivate (입장권으로 1:1 방 다시 입장)', () => {
    it('티켓이 없으면 보내지 않고, 있으면 private:join을 보내 토큰·접속 기기를 반영한다', async () => {
      expect(await socketService.joinPrivate([])).toEqual({ ok: true, rooms: [], invalid: [] })
      const emit = vi.fn((event, payload, ack) => ack({
        ok: true,
        rooms: [{ roomId: 'prv-aa', ticket: 'pv1.new', roomToken: 'tok', roomTokenTtlSec: 3600, devices: [{ socketId: 'x' }] }],
        invalid: ['pv1.bad']
      }))
      socketService.socket = { connected: true, emit, on: vi.fn(), off: vi.fn(), disconnect: vi.fn() }
      const res = await socketService.joinPrivate(['pv1.a', 'pv1.bad'])
      expect(emit).toHaveBeenCalledWith('private:join', { tickets: ['pv1.a', 'pv1.bad'] }, expect.any(Function))
      expect(res.ok).toBe(true)
      expect(res.rooms[0].ticket).toBe('pv1.new')
      expect(res.invalid).toEqual(['pv1.bad'])
      expect(socketService.privateRoomDevices.value['prv-aa']).toEqual([{ socketId: 'x' }])
    })

    it('연결이 없으면 실패 코드를 돌려준다', async () => {
      socketService.socket = null
      expect(await socketService.joinPrivate(['pv1.a'])).toEqual({ ok: false, code: 'TIMEOUT' })
    })

    it('10개씩 나눠 보낸다', async () => {
      const emit = vi.fn((event, payload, ack) => ack({ ok: true, rooms: [], invalid: [] }))
      socketService.socket = { connected: true, emit, on: vi.fn(), off: vi.fn(), disconnect: vi.fn() }
      await socketService.joinPrivate(Array.from({ length: 12 }, (_, i) => 'pv1.' + i))
      expect(emit).toHaveBeenCalledTimes(2)
      expect(emit.mock.calls[1][1].tickets).toHaveLength(2)
    })
  })
})
