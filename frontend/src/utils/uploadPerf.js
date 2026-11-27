/**
 * 업로드 성능 측정 (GA4 upload_perf / upload_perf_fail)
 *
 * 실제 업로드 경로(useFileManager.uploadFiles)와 r2Service.uploadFile이 같은 함수를 쓴다.
 * 측정 이벤트는 어떤 경우에도 업로드 결과에 영향을 주지 않는다.
 */
import { trackEvent } from './analytics.js'
import { mbpsBucket } from './mbpsBucket.js'

/** 이 크기 이상 파일만 측정한다 (작은 파일은 속도 값이 의미 없음) */
export const UPLOAD_PERF_MIN_BYTES = 8 * 1024 * 1024

export const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
export const perfMobile = () => {
  try { return /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent || '') } catch { return false }
}
export const perfConn = () => {
  try { return navigator.connection?.effectiveType || undefined } catch { return undefined }
}
const perfClean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))
export function safeTrack(name, params) {
  try { trackEvent(name, perfClean(params)) } catch { /* noop */ }
}
export function failReason(err) {
  try {
    if (err?.code === 'UPLOAD_CANCELED' || err?.name === 'AbortError') return 'canceled'
    if (typeof err?.status === 'number' || /\b[1-5]\d\d\b/.test(String(err?.message || ''))) return 'http'
    if (err instanceof TypeError || /network|네트워크|timeout|시간/i.test(String(err?.message || ''))) return 'network'
  } catch { /* noop */ }
  return 'other'
}

/** 측정 대상인가 (8MB 이상) */
export const shouldMeasureUpload = (bytes) => bytes >= UPLOAD_PERF_MIN_BYTES

/**
 * 업로드 성공 측정.
 * @param {{bytes:number, startedAt:number, path:'single'|'multipart'|'locked', retries?:number, resumed?:boolean, locked?:boolean}} p
 *   startedAt은 perfNow() 값 (해당 파일 업로드 시작 시각)
 */
export function trackUploadPerf({ bytes, startedAt, path, retries = 0, resumed = false, locked = false }) {
  try {
    if (!shouldMeasureUpload(bytes)) return
    const ms = Math.max(perfNow() - startedAt, 1)
    const mbps = Math.round(((bytes * 8) / 1e6 / (ms / 1000)) * 10) / 10
    safeTrack('upload_perf', {
      upload_mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
      upload_ms: Math.round(ms),
      upload_mbps: mbps,
      mbps_bucket: mbpsBucket(mbps),
      upload_path: path,
      retries: Number(retries) || 0,
      resumed: !!resumed,
      locked: !!locked,
      is_mobile: perfMobile(),
      effective_type: perfConn(),
    })
  } catch { /* noop */ }
}

/** 업로드 실패 측정. 사용자 취소는 호출하지 않는다. */
export function trackUploadPerfFail({ bytes, path, error }) {
  try {
    if (!shouldMeasureUpload(bytes)) return
    safeTrack('upload_perf_fail', {
      upload_mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
      upload_path: path,
      reason: failReason(error),
      is_mobile: perfMobile(),
    })
  } catch { /* noop */ }
}
