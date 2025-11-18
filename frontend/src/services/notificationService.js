import { ref } from 'vue'

/**
 * 알림 서비스
 *
 * 애플리케이션 전역에서 사용할 수 있는 알림 기능을 제공하는 싱글톤 서비스입니다.
 * Best Practice: 전역 상태 관리를 위한 서비스 레이어 패턴
 */
class NotificationService {
  constructor() {
    // 반응형 상태: 현재 표시 중인 알림 메시지
    this.notification = ref(null)

    // 기본 설정
    this.defaultDuration = 3000 // 3초
    this.currentTimer = null
  }

  /**
   * 알림을 표시합니다
   *
   * Vue 3 Best Practice:
   * - ref를 사용한 반응형 상태 관리
   * - 타이머 정리로 메모리 누수 방지
   *
   * @param {string} message - 표시할 메시지
   * @param {number} duration - 표시 시간 (밀리초, 기본값: 3000)
   */
  showNotification(message, duration = this.defaultDuration) {
    // 이전 타이머가 있으면 클리어
    if (this.currentTimer) {
      clearTimeout(this.currentTimer)
      this.currentTimer = null
    }

    // 메시지 설정
    this.notification.value = message
    console.log('[NotificationService] 알림 표시:', message)

    // 자동 숨김 타이머 설정
    this.currentTimer = setTimeout(() => {
      this.hideNotification()
    }, duration)
  }

  /**
   * 알림을 즉시 숨깁니다
   */
  hideNotification() {
    this.notification.value = null

    if (this.currentTimer) {
      clearTimeout(this.currentTimer)
      this.currentTimer = null
    }

    console.log('[NotificationService] 알림 숨김')
  }

  /**
   * 성공 알림을 표시합니다
   *
   * @param {string} message - 표시할 메시지
   * @param {number} duration - 표시 시간 (밀리초)
   */
  showSuccess(message, duration) {
    this.showNotification(`✓ ${message}`, duration)
  }

  /**
   * 에러 알림을 표시합니다
   *
   * @param {string} message - 표시할 메시지
   * @param {number} duration - 표시 시간 (밀리초, 에러는 기본 5초)
   */
  showError(message, duration = 5000) {
    this.showNotification(`✗ ${message}`, duration)
  }

  /**
   * 정보 알림을 표시합니다
   *
   * @param {string} message - 표시할 메시지
   * @param {number} duration - 표시 시간 (밀리초)
   */
  showInfo(message, duration) {
    this.showNotification(`ℹ ${message}`, duration)
  }
}

// 싱글톤 인스턴스 생성 및 export
export const notificationService = new NotificationService()
