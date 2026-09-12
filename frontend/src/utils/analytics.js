/**
 * GA4 이벤트 전송 래퍼.
 * index.html이 gtag 스텁을 항상 정의하므로 어느 환경에서든 안전하게 호출할 수 있다.
 * 다만 실제 GA4 스크립트는 프로덕션 호스트(www.clipboardapp.org)에서만 로드되므로,
 * 그 외 환경(개발·프리뷰·프리렌더)에서는 dataLayer에 쌓이기만 하고 GA로 전송되지 않는다.
 * 어떤 경우에도 예외로 앱 흐름을 막지 않는다.
 * @returns {boolean} gtag 호출 성공 여부
 */
export function trackEvent(name, params = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false
    window.gtag('event', name, params)
    return true
  } catch {
    return false
  }
}
