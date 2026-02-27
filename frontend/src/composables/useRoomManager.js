import { ref, readonly } from 'vue'

const SHARED_ROOM_ID = 'room-shared'

/**
 * @composable useRoomManager
 * @description 단일 공유 룸 관리 기능을 제공하는 컴포저블.
 */
export function useRoomManager() {
  const currentRoomId = ref(null)

  /**
   * 공유 룸에 입장합니다.
   * currentRoomId를 'room-shared'로 설정합니다.
   */
  function enterSharedRoom() {
    currentRoomId.value = SHARED_ROOM_ID
    console.log('[useRoomManager] 공유 룸 입장:', SHARED_ROOM_ID)
  }

  /**
   * 현재 룸에서 나갑니다.
   */
  function leaveRoom() {
    console.log('[useRoomManager] 룸 퇴장:', currentRoomId.value)
    currentRoomId.value = null
  }

  return {
    currentRoomId: readonly(currentRoomId),
    enterSharedRoom,
    leaveRoom
  }
}
