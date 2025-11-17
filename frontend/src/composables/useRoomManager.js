import { ref } from 'vue'

export function useRoomManager() {
  const currentRoomId = ref(null)

  /**
   * 6자리 영숫자 랜덤 룸 코드 생성
   */
  function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  /**
   * 새 룸 생성
   */
  function createNewRoom() {
    const roomCode = generateRoomCode()
    currentRoomId.value = roomCode
    return roomCode
  }

  /**
   * 기존 룸 코드로 입장
   */
  function joinRoomByCode(code) {
    const trimmedCode = code.trim().toUpperCase()

    if (trimmedCode.length === 0) {
      return false
    }

    currentRoomId.value = trimmedCode
    return true
  }

  /**
   * 룸 나가기
   */
  function leaveRoom() {
    currentRoomId.value = null
  }

  return {
    currentRoomId,
    generateRoomCode,
    createNewRoom,
    joinRoomByCode,
    leaveRoom
  }
}
