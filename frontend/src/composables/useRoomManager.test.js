import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomManager } from './useRoomManager'

describe('useRoomManager', () => {
  let roomManager

  beforeEach(() => {
    roomManager = useRoomManager()
  })

  describe('초기 상태', () => {
    it('초기 상태에서 globalRoomId와 ipRoomId는 null이어야 한다', () => {
      expect(roomManager.globalRoomId.value).toBeNull()
      expect(roomManager.ipRoomId.value).toBeNull()
    })

    it('초기 상태에서 roomIds는 빈 배열이어야 한다', () => {
      expect(roomManager.roomIds.value).toEqual([])
    })
  })

  describe('setRooms', () => {
    it('서버가 내려준 두 룸 ID를 설정한다', () => {
      roomManager.setRooms({ globalRoomId: 'room-shared', ipRoomId: 'room-abc123' })

      expect(roomManager.globalRoomId.value).toBe('room-shared')
      expect(roomManager.ipRoomId.value).toBe('room-abc123')
    })

    it('roomIds는 설정된 두 ID를 포함한다', () => {
      roomManager.setRooms({ globalRoomId: 'room-shared', ipRoomId: 'room-abc123' })

      expect(roomManager.roomIds.value).toEqual(['room-shared', 'room-abc123'])
    })
  })

  describe('roomIdForScope', () => {
    beforeEach(() => {
      roomManager.setRooms({ globalRoomId: 'room-shared', ipRoomId: 'room-abc123' })
    })

    it("scope가 'global'이면 globalRoomId를 반환한다", () => {
      expect(roomManager.roomIdForScope('global')).toBe('room-shared')
    })

    it("scope가 'ip'면 ipRoomId를 반환한다", () => {
      expect(roomManager.roomIdForScope('ip')).toBe('room-abc123')
    })

    it('유효하지 않은 scope는 null을 반환한다', () => {
      expect(roomManager.roomIdForScope('bogus')).toBeNull()
    })
  })

  describe('룸 나가기', () => {
    it('룸에서 나가면 두 ID 모두 null이 되고 roomIds도 빈 배열이 된다', () => {
      roomManager.setRooms({ globalRoomId: 'room-shared', ipRoomId: 'room-abc123' })
      roomManager.leaveRoom()

      expect(roomManager.globalRoomId.value).toBeNull()
      expect(roomManager.ipRoomId.value).toBeNull()
      expect(roomManager.roomIds.value).toEqual([])
    })
  })
})

describe('useRoomManager 비공개 스코프', () => {
  it('prv:<id> → <id>, scopeForRoom 역변환', () => {
    const m = useRoomManager()
    m.setRooms({ globalRoomId: 'g1', ipRoomId: 'i1' })
    expect(m.roomIdForScope('prv:prv-abc')).toBe('prv-abc')
    expect(m.roomIdForScope('ip')).toBe('i1')
    expect(m.scopeForRoom('prv-abc')).toBe('prv:prv-abc')
    expect(m.scopeForRoom('g1')).toBe('global')
    expect(m.scopeForRoom('i1')).toBe('ip')
    expect(m.scopeForRoom('zzz')).toBe(null)
  })
})
