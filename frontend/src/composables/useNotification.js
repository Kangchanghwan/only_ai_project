import { readonly } from 'vue'
import { notificationService } from '../services/notificationService.js'

/**
 * @composable useNotification
 * @description `notificationService`와 상호작용하여 알림을 관리하는 컴포저블.
 *              Vue 컴포넌트에서 알림 기능을 쉽게 사용할 수 있도록 반응형 상태와 메서드를 제공합니다.
 *
 * Vue 3 Best Practice:
 * - readonly()를 사용하여 외부에서 상태를 직접 수정하지 못하도록 보호
 * - 서비스 레이어와의 명확한 책임 분리
 */
export function useNotification() {
  return {
    /**
     * @property {import('vue').Readonly<string|null>} notification
     * 현재 알림 메시지 (읽기 전용).
     */
    notification: readonly(notificationService.notification),

    /**
     * @property {import('vue').Readonly<Map>} uploads
     * 현재 업로드 진행 상태 (읽기 전용).
     */
    uploads: readonly(notificationService.uploads),

    /**
     * 알림을 표시하는 함수.
     * @param {string} message - 표시할 메시지.
     * @param {number} [duration=3000] - 알림이 표시될 시간(밀리초).
     */
    showNotification: notificationService.showNotification.bind(notificationService),

    /**
     * 알림을 즉시 숨기는 함수.
     */
    hideNotification: notificationService.hideNotification.bind(notificationService),

    /**
     * 성공 알림을 표시하는 함수.
     * @param {string} message - 표시할 메시지.
     * @param {number} [duration] - 알림이 표시될 시간(밀리초).
     */
    showSuccess: notificationService.showSuccess.bind(notificationService),

    /**
     * 에러 알림을 표시하는 함수.
     * @param {string} message - 표시할 메시지.
     * @param {number} [duration=5000] - 알림이 표시될 시간(밀리초).
     */
    showError: notificationService.showError.bind(notificationService),

    /**
     * 정보 알림을 표시하는 함수.
     * @param {string} message - 표시할 메시지.
     * @param {number} [duration] - 알림이 표시될 시간(밀리초).
     */
    showInfo: notificationService.showInfo.bind(notificationService),

    /**
     * 업로드를 추가하는 함수.
     * @param {string} uploadId - 업로드 고유 ID.
     * @param {string} fileName - 파일명.
     */
    addUpload: notificationService.addUpload.bind(notificationService),

    /**
     * 업로드 진행률을 업데이트하는 함수.
     * @param {string} uploadId - 업로드 고유 ID.
     * @param {number} percent - 진행률 (0-100).
     */
    updateUpload: notificationService.updateUpload.bind(notificationService),

    /**
     * 업로드를 완료 상태로 변경하는 함수.
     * @param {string} uploadId - 업로드 고유 ID.
     */
    completeUpload: notificationService.completeUpload.bind(notificationService),

    /**
     * 업로드를 실패 상태로 변경하는 함수.
     * @param {string} uploadId - 업로드 고유 ID.
     * @param {string} error - 에러 메시지.
     */
    failUpload: notificationService.failUpload.bind(notificationService),

    /**
     * 업로드를 목록에서 제거하는 함수.
     * @param {string} uploadId - 업로드 고유 ID.
     */
    removeUpload: notificationService.removeUpload.bind(notificationService),

    /**
     * 모든 업로드를 제거하는 함수.
     */
    clearAllUploads: notificationService.clearAllUploads.bind(notificationService),
  }
}
