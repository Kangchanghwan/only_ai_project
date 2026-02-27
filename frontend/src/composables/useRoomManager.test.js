import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomManager } from './useRoomManager'

describe('useRoomManager', () => {
  let roomManager

  beforeEach(() => {
    roomManager = useRoomManager()
  })

  describe('공유 룸 입장', () => {
    it('공유 룸에 입장할 수 있어야 한다', () => {
      roomManager.enterSharedRoom()

      expect(roomManager.currentRoomId.value).toBe('room-shared')
    })

    it('초기 상태에서 currentRoomId는 null이어야 한다', () => {
      expect(roomManager.currentRoomId.value).toBeNull()
    })
  })

  describe('룸 나가기', () => {
    it('룸에서 나갈 수 있어야 한다', () => {
      roomManager.enterSharedRoom()
      roomManager.leaveRoom()

      expect(roomManager.currentRoomId.value).toBeNull()
    })
  })
})
