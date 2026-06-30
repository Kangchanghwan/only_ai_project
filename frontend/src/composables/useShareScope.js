import { ref } from 'vue'

const STORAGE_KEY = 'share-scope'
const VALID = ['ip', 'global']
const DEFAULT_SCOPE = 'ip'

/**
 * @composable useShareScope
 * @description 업로드 공유 대상('ip' | 'global') 상태를 관리하고
 *              마지막 선택을 localStorage에 기억한다.
 */
export function useShareScope() {
  const stored = localStorage.getItem(STORAGE_KEY)
  const initial = VALID.includes(stored) ? stored : DEFAULT_SCOPE
  const scope = ref(initial)

  function setScope(next) {
    if (!VALID.includes(next)) return
    scope.value = next
    localStorage.setItem(STORAGE_KEY, next)
  }

  /** localStorage에서 현재 스코프를 즉시 읽는다(업로드 시점의 최신값 보장). */
  function getScope() {
    const v = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : DEFAULT_SCOPE
  }

  return { scope, setScope, getScope }
}
