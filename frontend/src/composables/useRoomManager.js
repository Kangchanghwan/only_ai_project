import { ref, readonly } from 'vue'

/**
 * @composable useRoomManager
 * @description 룸 생성 및 입장 관리 기능을 제공하는 컴포저블.
 *              룸 코드를 생성하고, 현재 룸 상태를 추적합니다.
 *
 * Vue 3 Best Practice:
 * - ref()를 사용한 반응형 상태 관리
 * - readonly()로 외부 수정 방지
 * - 명확한 상태 관리
 */
export function useRoomManager() {
  // 반응형 상태: 현재 입장한 룸 ID
  const currentRoomId = ref(null)

  gtag('event', 'room_created', {
    'event_category': 'engagement',
    'event_label': 'Room Creation',
    'room_id': roomCode
  });

  /**
   * 6자리 영숫자 랜덤 룸 코드를 생성합니다.
   *
   * @returns {string} 생성된 룸 코드 (예: 'A3B7X9')
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
   * 새 룸을 생성하고 현재 룸으로 설정합니다.
   *
   * @returns {string} 생성된 룸 코드
   */
  function createNewRoom() {
    const roomCode = generateRoomCode()
    currentRoomId.value = roomCode
    return roomCode
  }

  /**
   * 기존 룸 코드로 입장합니다.
   *
   * 코드를 정규화(trim, 대문자 변환)하여 현재 룸으로 설정합니다.
   *
   * @param {string} code - 입장할 룸 코드
   * @returns {boolean} 입장 성공 여부
   */
  function joinRoomByCode(code) {
    const trimmedCode = code.trim().toUpperCase()

    if (trimmedCode.length === 0) {
      console.warn('[useRoomManager] 빈 룸 코드는 허용되지 않습니다')
      return false
    }

    currentRoomId.value = trimmedCode
    console.log('[useRoomManager] 룸 입장:', trimmedCode)
    return true
  }

  /**
   * 현재 룸에서 나갑니다.
   *
   * 현재 룸 ID를 초기화합니다.
   */
  function leaveRoom() {
    console.log('[useRoomManager] 룸 퇴장:', currentRoomId.value)
    currentRoomId.value = null
  }

  return {
    /**
     * @property {import('vue').Readonly<string|null>} currentRoomId
     * 현재 입장한 룸 ID (읽기 전용).
     */
    currentRoomId: readonly(currentRoomId),

    /**
     * 6자리 영숫자 랜덤 룸 코드를 생성하는 함수.
     * @returns {string} 생성된 룸 코드
     */
    generateRoomCode,
    /**
     * 새 룸을 생성하고 현재 룸으로 설정하는 함수.
     * @returns {string} 생성된 룸 코드
     */
    createNewRoom,
    /**
     * 기존 룸 코드로 입장하는 함수.
     * @param {string} code - 입장할 룸 코드
     * @returns {boolean} 입장 성공 여부
     */
    joinRoomByCode,
    /**
     * 현재 룸에서 나가는 함수.
     */
    leaveRoom
  }
}
