import { ref } from 'vue'
import QRCode from 'qrcode'

/**
 * @composable useQRCode
 * @description QR 코드 생성 기능을 제공하는 컴포저블.
 *              룸 코드를 포함한 URL을 QR 코드로 변환합니다.
 *
 * Vue 3 Best Practice:
 * - ref()를 사용한 반응형 상태 관리
 * - async/await를 사용한 비동기 처리
 * - 명확한 에러 핸들링
 */
export function useQRCode() {
  const qrCodeDataUrl = ref(null)
  const isGenerating = ref(false)
  const error = ref(null)

  /**
   * 룸 코드를 포함한 URL로 QR 코드를 생성합니다.
   *
   * @param {string} roomCode - 룸 코드
   * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
   */
  async function generateQRCode(roomCode) {
    if (!roomCode || roomCode.trim().length === 0) {
      error.value = '유효하지 않은 룸 코드입니다.'
      return { success: false, error: error.value }
    }

    isGenerating.value = true
    error.value = null

    try {
      // 현재 도메인을 기준으로 룸 접속 URL 생성
      const baseUrl = window.location.origin + window.location.pathname
      const roomUrl = `${baseUrl}#/${roomCode}`

      // QR 코드 생성 옵션
      const options = {
        errorCorrectionLevel: 'H', // 높은 오류 수정 레벨
        type: 'image/png',
        quality: 0.95,
        margin: 2,
        width: 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }

      // QR 코드를 Data URL로 생성
      const dataUrl = await QRCode.toDataURL(roomUrl, options)
      qrCodeDataUrl.value = dataUrl

      console.log('[useQRCode] QR 코드 생성 완료:', roomUrl)
      return { success: true, dataUrl }
    } catch (err) {
      error.value = 'QR 코드 생성에 실패했습니다.'
      console.error('[useQRCode] QR 코드 생성 오류:', err)
      return { success: false, error: error.value }
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * QR 코드를 캔버스로 생성합니다 (고급 사용).
   *
   * @param {string} roomCode - 룸 코드
   * @param {HTMLCanvasElement} canvas - 캔버스 엘리먼트
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function generateQRCodeToCanvas(roomCode, canvas) {
    if (!roomCode || roomCode.trim().length === 0) {
      error.value = '유효하지 않은 룸 코드입니다.'
      return { success: false, error: error.value }
    }

    if (!canvas) {
      error.value = '캔버스 엘리먼트가 필요합니다.'
      return { success: false, error: error.value }
    }

    isGenerating.value = true
    error.value = null

    try {
      const baseUrl = window.location.origin + window.location.pathname
      const roomUrl = `${baseUrl}#/${roomCode}`

      const options = {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }

      await QRCode.toCanvas(canvas, roomUrl, options)
      console.log('[useQRCode] QR 코드 캔버스 생성 완료:', roomUrl)
      return { success: true }
    } catch (err) {
      error.value = 'QR 코드 생성에 실패했습니다.'
      console.error('[useQRCode] QR 코드 캔버스 생성 오류:', err)
      return { success: false, error: error.value }
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * 생성된 QR 코드를 다운로드합니다.
   *
   * @param {string} roomCode - 룸 코드 (파일명에 사용)
   */
  function downloadQRCode(roomCode) {
    if (!qrCodeDataUrl.value) {
      console.warn('[useQRCode] 다운로드할 QR 코드가 없습니다.')
      return
    }

    const link = document.createElement('a')
    link.href = qrCodeDataUrl.value
    link.download = `room-${roomCode}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    console.log('[useQRCode] QR 코드 다운로드 완료')
  }

  /**
   * QR 코드 상태를 초기화합니다.
   */
  function reset() {
    qrCodeDataUrl.value = null
    error.value = null
    isGenerating.value = false
  }

  return {
    /**
     * @property {import('vue').Ref<string|null>} qrCodeDataUrl
     * 생성된 QR 코드의 Data URL
     */
    qrCodeDataUrl,

    /**
     * @property {import('vue').Ref<boolean>} isGenerating
     * QR 코드 생성 중 여부
     */
    isGenerating,

    /**
     * @property {import('vue').Ref<string|null>} error
     * 에러 메시지
     */
    error,

    /**
     * 룸 코드로 QR 코드를 생성하는 함수
     * @param {string} roomCode - 룸 코드
     * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
     */
    generateQRCode,

    /**
     * 캔버스에 QR 코드를 생성하는 함수
     * @param {string} roomCode - 룸 코드
     * @param {HTMLCanvasElement} canvas - 캔버스 엘리먼트
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    generateQRCodeToCanvas,

    /**
     * QR 코드를 다운로드하는 함수
     * @param {string} roomCode - 룸 코드
     */
    downloadQRCode,

    /**
     * QR 코드 상태를 초기화하는 함수
     */
    reset
  }
}
