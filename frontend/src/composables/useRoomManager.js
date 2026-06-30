import { ref, computed, readonly } from 'vue'

/**
 * @composable useRoomManager
 * @description 이중 룸(전체 공유 + IP 격리) ID를 보관한다.
 */
export function useRoomManager() {
  const globalRoomId = ref(null)
  const ipRoomId = ref(null)

  /** 조회/병합에 사용할 룸 ID 목록 (값이 있는 것만) */
  const roomIds = computed(() =>
    [globalRoomId.value, ipRoomId.value].filter(Boolean)
  )

  /**
   * 서버가 내려준 두 룸 ID를 설정한다.
   * @param {{globalRoomId: string, ipRoomId: string}} payload
   */
  function setRooms(payload) {
    globalRoomId.value = payload.globalRoomId
    ipRoomId.value = payload.ipRoomId
    console.log('[useRoomManager] 룸 설정:', payload)
  }

  /** 스코프('global'|'ip')에 해당하는 룸 ID 반환 */
  function roomIdForScope(scope) {
    return scope === 'global' ? globalRoomId.value : ipRoomId.value
  }

  function leaveRoom() {
    globalRoomId.value = null
    ipRoomId.value = null
  }

  return {
    globalRoomId: readonly(globalRoomId),
    ipRoomId: readonly(ipRoomId),
    roomIds,
    setRooms,
    roomIdForScope,
    leaveRoom
  }
}
