/**
 * @composable useClipboard
 * @description 클립보드 관련 기능을 제공하는 컴포저블.
 *              텍스트 및 이미지를 클립보드에 복사하고, 붙여넣기 이벤트에서 이미지를 추출합니다.
 *
 * Vue 3 Best Practice:
 * - 상태가 없는 유틸리티 함수 모음
 * - 명확한 에러 처리
 * - 브라우저 API와의 안전한 상호작용
 */
export function useClipboard() {
  /**
   * 텍스트를 클립보드에 복사합니다.
   *
   * @param {string} text - 복사할 텍스트
   * @returns {Promise<{success: boolean, error?: Error}>} 복사 결과
   */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return { success: true }
    } catch (err) {
      console.error('텍스트 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 이미지를 클립보드에 복사합니다.
   *
   * 이미지 URL을 fetch하여 Blob으로 변환한 후 클립보드에 씁니다.
   * CORS 정책에 따라 일부 이미지는 복사되지 않을 수 있습니다.
   *
   * @param {string} imageUrl - 복사할 이미지 URL
   * @returns {Promise<{success: boolean, error?: Error}>} 복사 결과
   */
  async function copyImage(imageUrl) {
    try {
      console.log('이미지 복사 시작:', imageUrl)

      const response = await fetch(imageUrl)
      const blob = await response.blob()

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])

      console.log('이미지 복사 성공')
      return { success: true }
    } catch (err) {
      console.error('이미지 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 붙여넣기 이벤트에서 파일을 추출합니다.
   *
   * ClipboardEvent의 clipboardData를 순회하며 모든 파일을 추출합니다.
   * 텍스트 항목은 무시하고 파일만 추출합니다.
   *
   * @param {ClipboardEvent} event - 붙여넣기 이벤트 객체
   * @returns {Array<File>} 추출된 파일 배열
   */
  function extractFilesFromPaste(event) {
    const items = event.clipboardData?.items
    if (!items) return []

    const files = []

    for (let item of items) {
      // getAsFile()은 파일이 있을 때만 File 객체를 반환하고, 텍스트 등은 null 반환
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }

    return files
  }

  return {
    copyText,
    copyImage,
    extractFilesFromPaste
  }
}
