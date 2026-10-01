import { r2Service } from '../services/r2Service.js'
import { trackEvent } from './analytics.js'

/** store(공개 커스텀 도메인) 원본으로 폴백할 때 GA4 store_fallback 이벤트를 보낸다. */
export function trackStoreFallback(path, sizeBytes, reason) {
  trackEvent('store_fallback', {
    path,
    size_mb: Math.round((Number(sizeBytes) || 0) / 1048576),
    reason
  })
}

/**
 * 원본을 fetch한다. presigned(ICN, R2 직접)를 우선하고, 발급/요청이 실패하면 store URL로 폴백한다.
 * 폴백 시에만 store_fallback 이벤트를 보낸다.
 *
 * @param {{name: string, url: string, roomId?: string, size?: number}} file
 * @param {string} path - 이벤트 path 값 ('copy_files' | 'copy_image' ...)
 * @returns {Promise<Response>}
 */
export async function fetchOriginal(file, path) {
  let reason = 'no_room'
  if (file.roomId) {
    let presigned = null
    try {
      presigned = await r2Service.getDownloadUrl(file.roomId, file.name)
    } catch (err) {
      console.warn('[storeFallback] presigned URL 발급 실패:', err)
    }
    if (presigned) {
      try {
        const res = await fetch(presigned)
        if (res.ok !== false) return res
        reason = 'presign_http_' + res.status
      } catch (err) {
        // 교차 출처 fetch가 막히면 TypeError로 던져진다 (CORS 미허용 등)
        reason = 'cors'
        console.warn('[storeFallback] presigned fetch 실패, store로 폴백:', err)
      }
    } else {
      reason = 'presign_failed'
    }
  }
  trackStoreFallback(path, file.size, reason)
  return fetch(file.url)
}

/** store 공개 URL(`<publicUrl>/<roomId>/<fileName>`)에서 roomId/name을 복원한다. 실패하면 url만 돌려준다. */
export function fileFromStoreUrl(url) {
  const base = r2Service.publicUrl + '/'
  if (typeof url === 'string' && url.startsWith(base)) {
    const [roomId, ...rest] = url.slice(base.length).split('/')
    if (roomId && rest.length) {
      try {
        return { url, roomId, name: decodeURIComponent(rest.join('/')) }
      } catch { /* fallthrough */ }
    }
  }
  return { url }
}
