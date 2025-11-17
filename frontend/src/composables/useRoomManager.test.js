import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomManager } from './useRoomManager'

describe('useRoomManager', () => {
  let roomManager

  beforeEach(() => {
    roomManager = useRoomManager()
  })

  describe('룸 코드 생성', () => {
    it('6자리 영숫자 룸 코드를 생성해야 한다', () => {
      const roomCode = roomManager.generateRoomCode()

      expect(roomCode).toBeDefined()
      expect(roomCode.length).toBe(6)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
    })

    it('생성된 룸 코드는 매번 달라야 한다', () => {
      const code1 = roomManager.generateRoomCode()
      const code2 = roomManager.generateRoomCode()

      expect(code1).not.toBe(code2)
    })
  })

  describe('룸 입장', () => {
    it('새 룸을 만들 수 있어야 한다', () => {
      roomManager.createNewRoom()

      expect(roomManager.currentRoomId.value).toBeDefined()
      expect(roomManager.currentRoomId.value.length).toBe(6)
    })

    it('기존 룸 코드로 입장할 수 있어야 한다', () => {
      const testRoomCode = 'ABC123'

      roomManager.joinRoomByCode(testRoomCode)

      expect(roomManager.currentRoomId.value).toBe(testRoomCode)
    })

    it('빈 룸 코드로 입장을 시도하면 실패해야 한다', () => {
      const result = roomManager.joinRoomByCode('')

      expect(result).toBe(false)
      expect(roomManager.currentRoomId.value).toBeNull()
    })

    it('공백이 포함된 룸 코드는 자동으로 제거되어야 한다', () => {
      roomManager.joinRoomByCode('  ABC123  ')

      expect(roomManager.currentRoomId.value).toBe('ABC123')
    })

    it('소문자 룸 코드는 대문자로 변환되어야 한다', () => {
      roomManager.joinRoomByCode('abc123')

      expect(roomManager.currentRoomId.value).toBe('ABC123')
    })
  })

  describe('룸 나가기', () => {
    it('룸에서 나갈 수 있어야 한다', () => {
      roomManager.joinRoomByCode('TEST01')
      roomManager.leaveRoom()

      expect(roomManager.currentRoomId.value).toBeNull()
    })
  })
})
