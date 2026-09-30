import { t } from '../i18n/translate.js'

/** 실패 항목을 목록에 남겨 두는 시간(ms) */
export const FAILED_UPLOAD_REMOVE_DELAY_MS = 3000
/** 완료 항목을 목록에 남겨 두는 시간(ms) */
export const COMPLETED_UPLOAD_REMOVE_DELAY_MS = 1500

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

  function remove(uploadId, delay) {
    setTimeout(() => notification.removeUpload(uploadId), delay)
  }

  function errorMessage(error) {
    if (error?.code === 'FILE_TOO_LARGE' || error?.code === 'FILE_EMPTY') return error.message
    return t('notification.uploadFailed', { message: error?.message ?? '' })
  }

  return {
    start(file) {
      const uploadId = crypto.randomUUID()
      ids.set(file, uploadId)
      notification.addUpload(uploadId, file.name)
    },
    progress(file, percent) {
      const uploadId = ids.get(file)
      if (uploadId) notification.updateUpload(uploadId, percent)
    },
    complete(file) {
      const uploadId = ids.get(file)
      if (!uploadId) return
      notification.completeUpload(uploadId)
      remove(uploadId, COMPLETED_UPLOAD_REMOVE_DELAY_MS)
      ids.delete(file)
    },
    fail(file, error) {
      const uploadId = ids.get(file)
      if (uploadId) {
        notification.failUpload(uploadId, error?.message)
        remove(uploadId, FAILED_UPLOAD_REMOVE_DELAY_MS)
        ids.delete(file)
      }
      notification.showError(errorMessage(error))
    }
  }
}
