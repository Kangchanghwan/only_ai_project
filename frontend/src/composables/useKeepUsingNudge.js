import { ref } from 'vue'
import { usePWAInstall } from './usePWAInstall.js'
import { trackEvent } from '../utils/analytics'

export const NUDGE_LAST_SHOWN_KEY = 'cs:nudge:lastShown'
export const NUDGE_DONE_KEY = 'cs:nudge:done'
export const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const isVisible = ref(false)
const trigger = ref(null)
// 브라우저 세션(탭) 안에서는 한 번만 시도한다. 새로고침하면 다시 판단한다.
let attemptedThisSession = false

function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 시크릿 모드 등에서 저장이 막혀도 앱 흐름을 막지 않는다
  }
}

/**
 * @composable useKeepUsingNudge
 * @description 첫 공유 성공 직후 "다음에도 쓰려면" 카드를 띄울지 판단한다.
 *  - 세션당 최대 1회, 7일에 최대 1회
 *  - 사용자가 행동(설치/알리기)했거나 닫았으면 다시 띄우지 않는다
 *  - 설치된 PWA(standalone)에서는 띄우지 않는다
 *  - 프리렌더 중에는 띄우지 않는다
 */
export function useKeepUsingNudge() {
  const { isInstalled } = usePWAInstall()

  function shouldShow(now = Date.now()) {
    if (typeof window === 'undefined' || window.__PRERENDER__) return false
    if (isInstalled.value) return false
    if (readStorage(NUDGE_DONE_KEY) === '1') return false
    const last = Number(readStorage(NUDGE_LAST_SHOWN_KEY) || 0)
    if (last && now - last < NUDGE_COOLDOWN_MS) return false
    return true
  }

  /**
   * 공유 성공 직후 호출한다. 조건을 만족하면 카드를 띄우고 true를 돌려준다.
   * @param {'file_upload'|'text_share'} source
   */
  function maybeShow(source) {
    if (attemptedThisSession || isVisible.value) return false
    attemptedThisSession = true
    if (!shouldShow()) return false
    trigger.value = source
    isVisible.value = true
    writeStorage(NUDGE_LAST_SHOWN_KEY, String(Date.now()))
    trackEvent('nudge_shown', { trigger: source })
    return true
  }

  /** 사용자가 행동했거나 닫았을 때. 이후로는 다시 띄우지 않는다. */
  function markDone() {
    writeStorage(NUDGE_DONE_KEY, '1')
    isVisible.value = false
  }

  function dismiss() {
    trackEvent('nudge_dismiss', { trigger: trigger.value })
    markDone()
  }

  /** 테스트용: 세션 상태 초기화 */
  function _reset() {
    attemptedThisSession = false
    isVisible.value = false
    trigger.value = null
  }

  return { isVisible, trigger, shouldShow, maybeShow, markDone, dismiss, _reset }
}
