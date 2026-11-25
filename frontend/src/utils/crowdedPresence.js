/**
 * @file crowdedPresence.js
 * @description 기기가 많은 같은 네트워크(교실 등)에서는 기기마다 뜨는 들어옴/나감 알림을 끈다.
 */
import { trackEvent } from './analytics'

// 개인이 가진 기기는 보통 4대 이하다. 나를 뺀 다른 기기가 5대 이상이면 여러 사람이 모인 네트워크로 본다.
export const CROWDED_PRESENCE_THRESHOLD = 5
const SKIP_FLAG = 'cs_presence_skip_tracked'

export function othersBucket(n) {
  if (n >= 30) return '30_plus'
  if (n >= 10) return '10_29'
  return '5_9'
}

/** 같은 네트워크 탭에서 다른 기기가 기준 이상이면 true. 방은 항상 false */
export function shouldSkipPresenceToast(roomKey, others) {
  return roomKey === 'ip' && others >= CROWDED_PRESENCE_THRESHOLD
}

/** presence_toast_skipped를 세션당 1회만 기록한다 */
let trackedThisLoad = false // sessionStorage를 못 쓰면 이 페이지 로드 동안 1회
export function trackPresenceSkipped(others) {
  if (trackedThisLoad) return
  trackedThisLoad = true
  try {
    if (sessionStorage.getItem(SKIP_FLAG)) return
    sessionStorage.setItem(SKIP_FLAG, '1')
  } catch { /* 페이지 로드당 1회로 지킨다 */ }
  trackEvent('presence_toast_skipped', { scope: 'ip', others_bucket: othersBucket(others) })
}

/** 테스트용 */
export function _resetPresenceSkipForTest() { trackedThisLoad = false }
