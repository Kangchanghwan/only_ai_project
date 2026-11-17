import { trackEvent } from './analytics.js'

/**
 * 화면에 띄우는 오류는 "사용자가 무엇을 하면 되는지"만 말하고,
 * 원인(상태 코드·내부 메시지)은 개발자 도구와 측정 이벤트에만 남긴다.
 *
 * kind: 'connect' | 'upload' | 'download' | 'delete'
 */
export function reportError(kind, error) {
  const status = Number(error?.status) || 0
  const code = String(error?.code || '').slice(0, 40)
  try { console.warn(`[error:${kind}]`, status || '', code || '', error?.message || error) } catch { /* 무시 */ }
  trackEvent('error_shown', { kind, status, code })
}
