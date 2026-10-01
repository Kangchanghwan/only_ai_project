import { ref } from 'vue'

/**
 * 전체 공유(global)로 처음 보내기 전에 한 번 확인받는 가드.
 * - 세션(페이지 로드) 동안 한 번만 동의를 받는다. private(ip) scope는 묻지 않는다.
 * - 동의는 "공개 범위"에 대한 것이며 개별 기기 수신 선택이 아니다.
 * - 확인창이 떠 있는 동안 들어온 요청은 같은 확인 결과를 공유한다.
 * - 호출자는 scope를 미리 고정(snapshot)해 넘기므로, 대기 중 탭이 바뀌어도 잘못된 룸으로 가지 않는다.
 */
export function usePublicShareGuard() {
  const isOpen = ref(false)
  let confirmed = false
  let pending = null
  let resolvePending = null

  function ensure(scope) {
    if (scope !== 'global') return Promise.resolve(true)
    if (confirmed) return Promise.resolve(true)
    if (pending) return pending
    isOpen.value = true
    pending = new Promise((resolve) => { resolvePending = resolve })
    return pending
  }

  function settle(ok) {
    if (ok) confirmed = true
    isOpen.value = false
    const resolve = resolvePending
    pending = null
    resolvePending = null
    resolve?.(ok)
  }

  return {
    isOpen,
    ensure,
    accept: () => settle(true),
    cancel: () => settle(false),
    /** 다른 경로(예: 공유 시트)에서 이미 공개 범위에 동의한 경우 */
    markConfirmed: () => { confirmed = true },
    isConfirmed: () => confirmed
  }
}
