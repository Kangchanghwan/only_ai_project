import { ref, readonly } from 'vue'
import { supabaseService } from '../services/supabaseService.js'

/**
 * @composable useFileManager
 * @description 파일 업로드 및 관리 기능을 제공하는 컴포저블.
 *              Supabase Storage와 상호작용하여 파일을 업로드하고 조회합니다.
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
      const loadedFiles = await supabaseService.loadFiles(roomId, options)

      files.value = loadedFiles
      console.log(`[useFileManager] 파일 로드 완료: ${loadedFiles.length}개`)
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

    try {
      console.log('[useFileManager] 파일 업로드 시작:', file.name)

      // 서비스 레이어를 통해 파일 업로드
      const result = await supabaseService.uploadFile(roomId, file, options)

      console.log('[useFileManager] 업로드 성공:', result)
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

      // 서비스 레이어를 통해 파일 삭제
      const result = await supabaseService.deleteFile(roomId, fileName)

      // 로컬 상태에서도 제거
      files.value = files.value.filter(f => f.name !== fileName)

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
