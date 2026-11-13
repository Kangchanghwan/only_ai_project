import { t } from '../i18n/translate.js'
/**
 * @composable useDownload
 * @description 파일 다운로드 관련 기능을 제공하는 컴포저블.
 *
 * 다운로드는 API가 발급한 presigned URL(Content-Disposition: attachment 서명)로
 * 브라우저 네이티브 다운로드를 트리거한다 — 파일을 메모리에 버퍼링하지 않고,
 * 브라우저가 진행률·재개를 처리한다. URL 발급에 실패하면(구버전 백엔드 등)
 * 기존 fetch → Blob 방식으로 폴백한다.
 */
import { r2Service } from '../services/r2Service'
import { fetchOriginal, trackStoreFallback } from '../utils/storeFallback.js'

// 여러 파일 받기는 useMultiDownload.js (ZIP 묶음 + 하나씩 받기). 연달아 트리거하면 브라우저가 막는다.

export function useDownload() {
  /** 숨은 <a>로 다운로드를 트리거한다 (attachment 응답이라 페이지는 이동하지 않는다) */
  function triggerDownload(href, fileName) {
    const link = document.createElement('a')
    link.href = href
    link.download = fileName
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  /**
   * 폴백: 파일을 fetch로 받아 Blob URL로 다운로드한다 (교차 출처라 download 속성이
   * 무시되는 경우를 위한 기존 방식. 파일 전체가 메모리에 올라간다).
   */
  async function downloadViaBlob(file, reason = 'presign_failed') {
    trackStoreFallback('download_blob', file.size, reason)
    const response = await fetch(file.url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    triggerDownload(blobUrl, file.name)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  }

  /** presigned 다운로드 URL을 받는다. 실패하면 null (폴백 유도). */
  async function resolveDownloadUrl(file) {
    if (!file?.roomId) return null
    try {
      return await r2Service.getDownloadUrl(file.roomId, file.name)
    } catch (err) {
      console.warn('[useDownload] presigned URL 발급 실패:', err)
      return null
    }
  }

  /** presigned URL이 있으면 네이티브, 없으면 재발급 1회 후 최후 수단으로 Blob(store)으로 내려받는다 */
  async function downloadWithUrl(file, presignedUrl) {
    try {
      // 공개 store 도메인은 presigned보다 느리므로, presigned 발급에 실패했으면 한 번 더 시도하고
      // 그래도 안 될 때만 store(Blob) 방식을 최후 폴백으로 쓴다.
      const url = presignedUrl || await resolveDownloadUrl(file)
      if (url) {
        triggerDownload(url, file.name)
      } else {
        await downloadViaBlob(file)
      }
      return { success: true }
    } catch (err) {
      console.error('파일 다운로드 실패:', err)
      return { success: false, error: err }
    }
  }

  /**
   * 개별 파일을 다운로드합니다.
   *
   * @param {Object} file - 다운로드할 파일 객체 { name, url, roomId? }
   * @returns {Promise<{success: boolean, error?: Error}>} 다운로드 결과
   */
  async function downloadFile(file) {
    const presignedUrl = await resolveDownloadUrl(file)
    return downloadWithUrl(file, presignedUrl)
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
        throw new Error(t('errors.noFilesToCopy'))
      }

      // 브라우저는 대부분 단일 ClipboardItem만 지원
      // 여러 파일이 선택된 경우 첫 번째 파일만 복사
      const fileToClipboard = files[0]
      console.log(`파일을 클립보드에 복사 중: ${fileToClipboard.name}`)

      const response = await fetchOriginal(fileToClipboard, 'copy_files')
      if (response.ok === false) throw new Error(`HTTP error! status: ${response.status}`)
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

  return {
    downloadFile,
    copyFilesToClipboard
  }
}
