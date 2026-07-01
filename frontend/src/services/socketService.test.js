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
})
