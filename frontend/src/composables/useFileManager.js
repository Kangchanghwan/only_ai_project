import { ref, readonly } from 'vue'
import { r2Service } from '../services/r2Service.js'

/**
 * @composable useFileManager
 * @description 파일 업로드 및 관리 기능을 제공하는 컴포저블.
 *              Cloudflare R2 Storage와 상호작용하여 파일을 업로드하고 조회합니다.
 *
 * Vue 3 Best Practice:
 * - ref()를 사용한 반응형 상태 관리
 * - readonly()로 외부 수정 방지
 * - 명확한 에러 처리
 * - 서비스 레이어와의 책임 분리
 */
export function useFileManager() {
  // 반응형 상태
  const files = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const totalSize = ref(0) // 룸의 총 파일 용량 (바이트)

  gtag('event', 'file_shared', {
    'event_category': 'engagement',
    'event_label': 'File Upload',
    'file_count': files.length
  });
  /**
   * 특정 룸의 파일 목록을 불러옵니다.
   *
   * @param {string} roomId - 룸 ID
   * @param {Object} options - 로드 옵션 (limit, offset, sortBy, order)
   * @returns {Promise<void>}
   */
  async function loadFiles(roomId, options = {}) {
    if (!roomId) {
      console.warn('[useFileManager] roomId가 없습니다')
      return
    }

    isLoading.value = true
    error.value = null

    try {
      console.log('[useFileManager] 파일 로딩 시작:', roomId)

      // 서비스 레이어를 통해 파일 목록 가져오기
      const loadedFiles = await r2Service.loadFiles(roomId, options)

      files.value = loadedFiles

      // 총 용량 계산
      totalSize.value = loadedFiles.reduce((sum, file) => sum + (file.size || 0), 0)

      console.log(`[useFileManager] 파일 로드 완료: ${loadedFiles.length}개, 총 용량: ${totalSize.value} bytes`)
    } catch (err) {
      console.error('[useFileManager] 파일 로드 오류:', err)
      error.value = err
      files.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 파일을 업로드합니다.
   *
   * @param {string} roomId - 룸 ID
   * @param {File} file - 업로드할 파일
   * @param {Object} options - 업로드 옵션 (fileName, upsert)
   * @returns {Promise<Object>} 업로드 결과 (success, fileName, url)
   */
  async function uploadFile(roomId, file, options = {}) {
    if (!roomId || !file) {
      throw new Error('roomId와 file이 필요합니다')
    }

    // 파일 크기 검증
    // 환경 변수에서 최대 파일 크기를 가져오거나 기본값 10MB 사용
    const maxFileSizeMB = import.meta.env.VITE_MAX_FILE_SIZE_MB || 10
    const MAX_FILE_SIZE = maxFileSizeMB * 1024 * 1024

    if (file.size === 0) {
      throw new Error('파일이 비어있습니다')
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`파일 크기는 ${maxFileSizeMB}MB를 초과할 수 없습니다`)
    }

    // 룸 총 용량 제한 검증
    // 환경 변수에서 룸 최대 용량을 가져오거나 기본값 500MB 사용
    const maxRoomSizeMB = import.meta.env.VITE_MAX_ROOM_SIZE_MB || 500
    const MAX_ROOM_SIZE = maxRoomSizeMB * 1024 * 1024

    // 현재 totalSize 상태를 사용 (API 호출 없음)
    const totalSizeAfterUpload = totalSize.value + file.size

    console.log(`[useFileManager] 현재 룸 용량: ${totalSize.value} bytes, 업로드 후: ${totalSizeAfterUpload} bytes`)

    // 룸 용량 제한 체크
    if (totalSizeAfterUpload > MAX_ROOM_SIZE) {
      const currentSizeMB = (totalSize.value / 1024 / 1024).toFixed(2)
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
      throw new Error(
        `룸 용량 제한(${maxRoomSizeMB}MB)을 초과합니다. 현재 사용량: ${currentSizeMB}MB, 업로드 파일: ${fileSizeMB}MB`
      )
    }

    try {
      console.log('[useFileManager] 파일 업로드 시작:', file.name)

      // 서비스 레이어를 통해 파일 업로드
      const result = await r2Service.uploadFile(roomId, file, options)

      // 업로드 성공 시 totalSize 업데이트
      totalSize.value += file.size

      console.log('[useFileManager] 업로드 성공:', result)
      console.log(`[useFileManager] 업데이트된 총 용량: ${totalSize.value} bytes`)

      return result
    } catch (err) {
      console.error('[useFileManager] 업로드 오류:', err)
      throw err
    }
  }

  /**
   * 파일을 삭제합니다.
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 삭제할 파일명
   * @returns {Promise<Object>} 삭제 결과
   */
  async function deleteFile(roomId, fileName) {
    if (!roomId || !fileName) {
      throw new Error('roomId와 fileName이 필요합니다')
    }

    try {
      console.log('[useFileManager] 파일 삭제 시작:', fileName)

      // 삭제할 파일 찾기
      const fileToDelete = files.value.find(f => f.name === fileName)

      // 서비스 레이어를 통해 파일 삭제
      const result = await r2Service.deleteFile(roomId, fileName)

      // 로컬 상태에서도 제거
      files.value = files.value.filter(f => f.name !== fileName)

      // totalSize 업데이트
      if (fileToDelete && fileToDelete.size) {
        totalSize.value -= fileToDelete.size
        console.log(`[useFileManager] 삭제 후 총 용량: ${totalSize.value} bytes`)
      }

      console.log('[useFileManager] 삭제 성공:', result)
      return result
    } catch (err) {
      console.error('[useFileManager] 삭제 오류:', err)
      throw err
    }
  }

  /**
   * 파일 목록을 초기화합니다.
   */
  function clearFiles() {
    files.value = []
    totalSize.value = 0
    error.value = null
    console.log('[useFileManager] 파일 목록 초기화')
  }

  /**
   * 파일 목록에 새 파일을 추가합니다. (UX 개선용)
   * @param {Object} file - 추가할 파일 객체
   */
  function addFile(file) {
    files.value.unshift(file)
  }

  return {
    /**
     * @property {import('vue').Readonly<Array>} files
     * 파일 목록 (읽기 전용).
     */
    files: readonly(files),
    /**
     * @property {import('vue').Readonly<boolean>} isLoading
     * 로딩 상태 (읽기 전용).
     */
    isLoading: readonly(isLoading),
    /**
     * @property {import('vue').Readonly<Error|null>} error
     * 에러 정보 (읽기 전용).
     */
    error: readonly(error),
    /**
     * @property {import('vue').Readonly<number>} totalSize
     * 룸의 총 파일 용량 (바이트, 읽기 전용).
     */
    totalSize: readonly(totalSize),

    /**
     * 파일 목록을 불러오는 함수.
     * @param {string} roomId - 룸 ID
     * @param {Object} options - 로드 옵션
     * @returns {Promise<void>}
     */
    loadFiles,
    /**
     * 파일을 업로드하는 함수.
     * @param {string} roomId - 룸 ID
     * @param {File} file - 업로드할 파일
     * @param {Object} options - 업로드 옵션
     * @returns {Promise<Object>} 업로드 결과
     */
    uploadFile,
    /**
     * 파일을 삭제하는 함수.
     * @param {string} roomId - 룸 ID
     * @param {string} fileName - 삭제할 파일명
     * @returns {Promise<Object>} 삭제 결과
     */
    deleteFile,
    /**
     * 파일 목록을 초기화하는 함수.
     */
    clearFiles,
    /**
     * 파일 목록에 새 파일을 추가하는 함수.
     */
    addFile
  }
}
