import { ref, watch, getCurrentScope, onScopeDispose } from 'vue'
import { usePrivateRooms } from './usePrivateRooms.js'

const STORAGE_KEY = 'share-scope'
const VALID = ['ip', 'global']
const DEFAULT_SCOPE = 'ip'
const PRV_PREFIX = 'prv:'

/** 'prv:<roomId>' 형식인가 */
export const isPrivateScope = (s) => typeof s === 'string' && s.startsWith(PRV_PREFIX) && s.length > PRV_PREFIX.length
/** 스코프 → 비공개 roomId (아니면 null) */
export const privateRoomIdOfScope = (s) => (isPrivateScope(s) ? s.slice(PRV_PREFIX.length) : null)
/** 비공개 roomId → 스코프 */
export const scopeForPrivateRoom = (roomId) => PRV_PREFIX + roomId

/**
 * @composable useShareScope
 * @description 업로드 공유 대상 상태. 스코프는 'ip' | 'global' | 'prv:<roomId>'.
 *              'ip'/'global'만 localStorage에 기억하고, 비공개 방 스코프는 그 방이 있는 동안만 유효하다.
 * @param {{isValid?: (roomId: string) => boolean}} [opts] 비공개 방 존재 확인(기본: usePrivateRooms().has)
 */
export function useShareScope(opts = {}) {
  const isRoomAlive = opts.isValid || usePrivateRooms().has
  const valid = (s) => VALID.includes(s) || (isPrivateScope(s) && isRoomAlive(privateRoomIdOfScope(s)))
  const stored = () => {
    const v = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : DEFAULT_SCOPE
  }

  const scope = ref(stored())

  function setScope(next) {
    if (!valid(next)) return
    scope.value = next
    if (VALID.includes(next)) localStorage.setItem(STORAGE_KEY, next)
  }

  /** 현재 스코프를 즉시 읽는다(업로드 시점의 최신값 보장). 사라진 비공개 방이면 저장된 ip/global로 돌아간다. */
  function getScope() {
    if (isPrivateScope(scope.value)) return valid(scope.value) ? scope.value : stored()
    return stored()
  }

  // 선택한 비공개 방이 사라지면 저장된 스코프로 복귀
  const stop = watch(
    () => isPrivateScope(scope.value) && !isRoomAlive(privateRoomIdOfScope(scope.value)),
    (gone) => { if (gone) scope.value = stored() },
    { flush: 'sync' }
  )
  if (getCurrentScope()) onScopeDispose(stop)

  return { scope, setScope, getScope }
}
