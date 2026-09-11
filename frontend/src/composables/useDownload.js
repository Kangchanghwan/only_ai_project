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

/** 여러 파일을 연속 트리거할 때 브라우저가 놓치지 않도록 두는 간격 */
const DOWNLOAD_GAP_MS = 250

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
  async function downloadViaBlob(file) {
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
      console.warn('[useDownload] presigned URL 발급 실패, Blob 방식으로 폴백:', err)
      return null
    }
  }

  /** URL이 있으면 네이티브, 없으면 Blob 폴백으로 한 파일을 내려받는다 */
  async function downloadWithUrl(file, presignedUrl) {
    try {
      if (presignedUrl) {
        triggerDownload(presignedUrl, file.name)
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

  /** 룸별로 presigned URL을 한 번에 받아 파일명 → URL 맵을 만든다 (실패한 룸은 빈 맵) */
  async function resolveDownloadUrls(files) {
    const byRoom = new Map()
    for (const file of files) {
      if (!file?.roomId) continue
      if (!byRoom.has(file.roomId)) byRoom.set(file.roomId, [])
      byRoom.get(file.roomId).push(file.name)
    }

    const urlsByRoom = new Map()
    await Promise.all(
      Array.from(byRoom.entries()).map(async ([roomId, names]) => {
        try {
          urlsByRoom.set(roomId, await r2Service.getDownloadUrls(roomId, names))
        } catch (err) {
          console.warn('[useDownload] 배치 URL 발급 실패, Blob 방식으로 폴백:', roomId, err)
          urlsByRoom.set(roomId, {})
        }
      })
    )
    return urlsByRoom
  }

  /**
   * 여러 파일을 순차적으로 다운로드합니다.
   *
   * presigned URL은 룸별로 한 번에 받고, 각 파일은 짧은 간격을 두고
   * 네이티브 다운로드로 트리거합니다 (ZIP 압축 없음).
   *
   * @param {Array<Object>} files - 다운로드할 파일 배열 [{ name, url, roomId? }, ...]
   * @param {Object} options - 옵션 객체
   * @param {Function} options.onProgress - 각 파일 시작/완료 시 호출되는 콜백 (file, status)
   * @returns {Promise<{success: boolean, successCount: number, failCount: number, total: number, errors?: Array, error?: Error}>} 다운로드 결과
   */
  async function downloadParallel(files, options = {}) {
    try {
      if (!files || files.length === 0) {
        throw new Error('다운로드할 파일이 없습니다')
      }

      const { onProgress } = options
      const urlsByRoom = await resolveDownloadUrls(files)
      const results = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        if (onProgress) {
          onProgress(file, 'start')
        }

        const presignedUrl = urlsByRoom.get(file.roomId)?.[file.name] || null
        const result = await downloadWithUrl(file, presignedUrl)

        if (onProgress) {
          onProgress(file, result.success ? 'complete' : 'failed', result.error)
        }

        results.push(result)

        // 마지막 파일이 아닌 경우 브라우저 다운로드 큐 처리 대기
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DOWNLOAD_GAP_MS))
        }
      }

      // 결과 집계
      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      const errors = results.filter(r => !r.success).map(r => r.error)

      return {
        success: successCount > 0,
        successCount,
        failCount,
        total: files.length,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (err) {
      console.error('순차 다운로드 실패:', err)
      return { success: false, error: err }
    }
  }

  return {
    downloadFile,
    copyFilesToClipboard,
    downloadParallel
  }
}
