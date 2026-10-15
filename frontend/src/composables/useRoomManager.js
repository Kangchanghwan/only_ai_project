import { ref, computed, readonly } from 'vue'
import { privateRoomIdOfScope, scopeForPrivateRoom } from './useShareScope.js'

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

  /** 스코프('global'|'ip')에 해당하는 룸 ID 반환. 유효하지 않은 스코프는 null. */
  function roomIdForScope(scope) {
    if (scope === 'global') return globalRoomId.value
    if (scope === 'ip') return ipRoomId.value
    const prv = privateRoomIdOfScope(scope)
    if (prv) return prv
    console.warn('[useRoomManager] 유효하지 않은 스코프:', scope)
    return null
  }

  /** roomId → 스코프. ip/global 룸이 아니고 prv- 로 시작하면 'prv:<roomId>', 모르면 null */
  function scopeForRoom(roomId) {
    if (!roomId) return null
    if (roomId === globalRoomId.value) return 'global'
    if (roomId === ipRoomId.value) return 'ip'
    if (String(roomId).startsWith('prv-')) return scopeForPrivateRoom(roomId)
    return null
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
    scopeForRoom,
    leaveRoom
  }
}
