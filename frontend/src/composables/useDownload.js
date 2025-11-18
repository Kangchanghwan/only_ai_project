/**
 * @composable useDownload
 * @description 파일 다운로드 관련 기능을 제공하는 컴포저블.
 *              개별 파일 다운로드, ZIP 압축 다운로드, 클립보드 복사 기능을 제공합니다.
 *
 * Vue 3 Best Practice:
 * - 상태가 없는 유틸리티 함수 모음
 * - 명확한 에러 처리
 * - 브라우저 API와의 안전한 상호작용
 */
import JSZip from 'jszip'

export function useDownload() {
  /**
   * 개별 파일을 다운로드합니다.
   *
   * Blob URL을 사용하여 CORS 및 리다이렉트 문제를 해결합니다.
   * 외부 URL을 직접 사용하면 브라우저가 페이지를 리다이렉트할 수 있습니다.
   *
   * @param {Object} file - 다운로드할 파일 객체 { name, url }
   * @returns {Promise<{success: boolean, error?: Error}>} 다운로드 결과
   */
  async function downloadFile(file) {
    try {
      // 파일을 fetch로 가져와서 Blob으로 변환
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const blob = await response.blob()

      // Blob URL 생성
      const blobUrl = URL.createObjectURL(blob)

      // 다운로드 트리거
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = file.name
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // 메모리 해제 (약간의 지연 후)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100)

      return { success: true }
    } catch (err) {
      console.error('파일 다운로드 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 여러 파일을 ZIP으로 압축하여 다운로드합니다.
   *
   * @param {Array<Object>} files - 다운로드할 파일 배열 [{ name, url }, ...]
   * @param {string} zipName - ZIP 파일 이름 (기본값: 'files.zip')
   * @returns {Promise<{success: boolean, error?: Error}>} 다운로드 결과
   */
  async function downloadAsZip(files, zipName = 'files.zip') {
    try {
      if (!files || files.length === 0) {
        throw new Error('다운로드할 파일이 없습니다')
      }

      const zip = new JSZip()

      // 모든 파일을 fetch하여 ZIP에 추가
      for (const file of files) {
        const response = await fetch(file.url)
        const blob = await response.blob()
        zip.file(file.name, blob)
      }

      // ZIP 파일 생성
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      // ZIP 파일 다운로드
      const link = document.createElement('a')
      link.href = URL.createObjectURL(zipBlob)
      link.download = zipName
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // 메모리 해제
      URL.revokeObjectURL(link.href)

      return { success: true }
    } catch (err) {
      console.error('ZIP 다운로드 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 선택한 파일들을 클립보드에 저장합니다.
   *
   * 브라우저 제약사항:
   * - 대부분의 브라우저는 단일 파일만 클립보드에 복사할 수 있습니다.
   * - 여러 파일을 선택한 경우 첫 번째 파일만 복사되며, 나머지는 무시됩니다.
   *
   * @param {Array<Object>} files - 클립보드에 저장할 파일 배열 [{ name, url }, ...]
   * @returns {Promise<{success: boolean, error?: Error, copiedCount?: number}>} 복사 결과
   */
  async function copyFilesToClipboard(files) {
    try {
      if (!files || files.length === 0) {
        throw new Error('클립보드에 저장할 파일이 없습니다')
      }

      // 브라우저는 대부분 단일 ClipboardItem만 지원
      // 여러 파일이 선택된 경우 첫 번째 파일만 복사
      const fileToClipboard = files[0]
      console.log(`파일을 클립보드에 복사 중: ${fileToClipboard.name}`)

      const response = await fetch(fileToClipboard.url)
      const blob = await response.blob()

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])

      console.log('클립보드 복사 성공')
      return {
        success: true,
        copiedCount: 1,
        totalCount: files.length
      }
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 여러 파일을 병렬로 다운로드합니다.
   *
   * ZIP으로 압축하지 않고 각 파일을 개별적으로 동시에 다운로드합니다.
   * Promise.all을 사용하여 모든 다운로드를 병렬로 처리합니다.
   *
   * @param {Array<Object>} files - 다운로드할 파일 배열 [{ name, url }, ...]
   * @returns {Promise<{success: boolean, successCount: number, failCount: number, total: number, errors?: Array, error?: Error}>} 다운로드 결과
   */
  async function downloadParallel(files) {
    try {
      if (!files || files.length === 0) {
        throw new Error('다운로드할 파일이 없습니다')
      }

      // 각 파일을 병렬로 다운로드
      const downloadPromises = files.map(file => downloadFile(file))
      const results = await Promise.all(downloadPromises)

      // 결과 집계
      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      const errors = results.filter(r => !r.success).map(r => r.error)

      return {
        success: successCount > 0, // 하나라도 성공하면 true
        successCount,
        failCount,
        total: files.length,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (err) {
      console.error('병렬 다운로드 실패:', err)
      return { success: false, error: err }
    }
  }

  return {
    downloadFile,
    downloadAsZip,
    copyFilesToClipboard,
    downloadParallel
  }
}
