import { t } from '../i18n/translate.js'
import { FRIENDLY_ERROR_CODES } from './apiErrors.js'
import { trackEvent } from './analytics.js'

/** 실패 항목을 목록에 남겨 두는 시간(ms) */
export const FAILED_UPLOAD_REMOVE_DELAY_MS = 3000
/** 완료 항목을 목록에 남겨 두는 시간(ms) */
export const COMPLETED_UPLOAD_REMOVE_DELAY_MS = 1500
/** 취소 토스트/GA4 이벤트를 한 번에 묶는 시간(ms). "모두 취소" 시 개수를 합치기 위함 */
export const CANCEL_BATCH_DELAY_MS = 150

// 진행 중/대기 중 업로드의 취소 함수 (uploadId -> () => boolean). 업로드 호출이 여러 개여도 공유된다.
const cancelers = new Map()

/** 업로드 카드 하나를 취소한다. 취소 요청이 접수되면 true */
export function cancelUpload(uploadId) {
  const cancel = cancelers.get(uploadId)
  return cancel ? cancel() : false
}

/** 취소 가능한 모든 업로드를 취소한다. 접수된 개수를 반환 */
export function cancelAllUploads() {
  let count = 0
  for (const cancel of [...cancelers.values()]) {
    if (cancel()) count++
  }
  return count
}

/**
 * 업로드 진행 카드(알림 패널)와 업로드 콜백을 연결한다.
 *
 * - 실제 전송이 시작된(onStart) 파일만 진행 항목을 가진다.
 *   크기 초과/빈 파일처럼 검증에서 거절된 파일, presign 실패 등 전송 시작 전에 실패한 파일은
 *   항목을 만들지 않고 에러 토스트만 띄운다 (항목이 "진행 중"으로 남는 문제 방지).
 * - 전송 중 실패한 항목은 실패 상태로 표시한 뒤 자동 제거한다.
 */
export function createUploadProgress(notification) {
  const ids = new Map() // file -> uploadId
  const percents = new Map() // file -> 마지막 진행률
  let cancelBatch = []
  let cancelTimer = null

  function flushCancels() {
    cancelTimer = null
    const batch = cancelBatch
    cancelBatch = []
    if (batch.length === 0) return
    for (const c of batch) {
      trackEvent('upload_cancelled', {
        size_mb: Math.round(c.size / 1024 / 1024),
        progress_pct: c.percent,
        method: c.method,
        count: batch.length
      })
    }
    notification.showInfo(batch.length > 1
      ? t('notification.uploadsCancelled', { count: batch.length })
      : t('notification.uploadCancelled'))
  }

  function ensureCard(file, cancel) {
    let uploadId = ids.get(file)
    if (!uploadId) {
      uploadId = crypto.randomUUID()
      ids.set(file, uploadId)
      notification.addUpload(uploadId, file.name, { cancellable: !!cancel })
    }
    if (cancel) cancelers.set(uploadId, cancel)
    return uploadId
  }

  function remove(uploadId, delay) {
    setTimeout(() => notification.removeUpload(uploadId), delay)
  }

  function errorMessage(error) {
    if (error?.code === 'FILE_EMPTY' || FRIENDLY_ERROR_CODES.has(error?.code)) return error.message
    return t('notification.uploadFailed', { message: error?.message ?? '' })
  }

  return {
    /** 대기열에 들어간 파일: 카드를 만들고 취소 핸들을 연결한다 */
    queue(file, handle) {
      ensureCard(file, () => handle.cancel())
    },
    start(file) {
      ensureCard(file)
    },
    progress(file, percent) {
      percents.set(file, percent)
      const uploadId = ids.get(file)
      if (uploadId) notification.updateUpload(uploadId, percent)
    },
    /** 취소 확정: 카드를 즉시 제거하고 토스트/GA4는 묶어서 한 번만 보낸다 (실패 토스트 없음) */
    cancelled(file, info = {}) {
      const uploadId = ids.get(file)
      if (uploadId) {
        cancelers.delete(uploadId)
        notification.removeUpload(uploadId)
        ids.delete(file)
      }
      cancelBatch.push({ size: info.size ?? file.size ?? 0, method: info.method, percent: percents.get(file) ?? 0 })
      percents.delete(file)
      if (!cancelTimer) cancelTimer = setTimeout(flushCancels, CANCEL_BATCH_DELAY_MS)
    },
    complete(file) {
      const uploadId = ids.get(file)
      if (!uploadId) return
      cancelers.delete(uploadId)
      percents.delete(file)
      notification.completeUpload(uploadId)
      remove(uploadId, COMPLETED_UPLOAD_REMOVE_DELAY_MS)
      ids.delete(file)
    },
    fail(file, error) {
      const uploadId = ids.get(file)
      if (uploadId) {
        cancelers.delete(uploadId)
        percents.delete(file)
        notification.failUpload(uploadId, error?.message)
        remove(uploadId, FAILED_UPLOAD_REMOVE_DELAY_MS)
        ids.delete(file)
      }
      notification.showError(errorMessage(error))
    }
  }
}
