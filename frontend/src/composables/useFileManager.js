import { ref, readonly, computed } from 'vue'
import { r2Service } from '../services/r2Service.js'

/**
 * @composable useFileManager
 * @description 파일 업로드 및 관리 기능을 제공하는 컴포저블.
 *              Cloudflare R2 Storage와 상호작용하여 파일을 업로드하고 조회합니다.
 *              여러 룸(전체 공유 + IP 격리)의 파일을 출처 구분 없이 하나로 병합해
 *              보여주되, 각 파일은 내부적으로 자신의 roomId를 보유한다.
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
  const totalSize = ref(0) // 현재 로드된 전체 파일의 합산 용량 (바이트, 표시용)
  const roomTokens = ref(new Map()) // roomId -> nextToken (Vue 3는 ref(Map)도 반응형 추적)

  let activeRoomIds = [] // 마지막으로 로드한 룸 ID 목록 (loadMore 대상 추적용, 비반응형 내부 상태)
  let loadGeneration = 0 // 동시 호출 시 stale 결과 커밋 방지용 세대 카운터

  // 더 불러올 파일이 있는지 여부 (하나라도 nextToken을 가진 룸이 있으면 true)
  const hasMore = computed(() => {
    for (const token of roomTokens.value.values()) {
      if (token) return true
    }
    return false
  })

  /** 특정 룸에 한해 더 불러올 페이지가 있는지 여부 (활성 탭 기준 "더 보기" 버튼 노출용) */
  function hasMoreForRoom(roomId) {
    return !!roomTokens.value.get(roomId)
  }

  /** roomId+name 기준 중복 제거 후 created 내림차순 정렬 */
  function mergeAndSort(fileList) {
    const seen = new Set()
    const deduped = []
    for (const file of fileList) {
      const key = `${file.roomId}::${file.name}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(file)
    }
    return deduped.sort((a, b) => new Date(b.created) - new Date(a.created))
  }

  /** 특정 룸에 속한 (현재 로드된) 파일들의 합산 용량 — 룸별 용량 제한 검증용 */
  function roomSize(roomId) {
    return files.value
      .filter(f => f.roomId === roomId)
      .reduce((sum, f) => sum + (f.size || 0), 0)
  }

  /**
   * 여러 룸의 파일 목록을 불러와 출처 구분 없이 하나로 병합한다.
   * 각 파일 객체는 내부적으로 자신의 roomId를 보유한다(삭제/용량 검증용).
   *
   * 룸별로 성공/실패를 분리 처리한다(Promise.allSettled): 일부 룸이 실패해도
   * 성공한 다른 룸의 데이터는 보존되며, 전부 실패한 경우에만 에러가 노출된다.
   *
   * @param {string[]} roomIds - 조회할 룸 ID 목록
   * @param {Object} options - 로드 옵션 (limit)
   * @returns {Promise<void>}
   */
  async function loadFilesFromRooms(roomIds, options = {}) {
    const ids = (roomIds || []).filter(Boolean)
    if (ids.length === 0) {
      console.warn('[useFileManager] roomIds가 없습니다')
      return
    }

    isLoading.value = true
    error.value = null
    activeRoomIds = ids
    roomTokens.value = new Map()
    const myGeneration = ++loadGeneration

    console.log('[useFileManager] 병합 파일 로딩 시작:', ids)

    const settled = await Promise.allSettled(
      ids.map(async (roomId) => {
        const result = await r2Service.loadFiles(roomId, options)
        return { roomId, result }
      })
    )

    if (myGeneration !== loadGeneration) {
      // 그 사이 새로운 loadFilesFromRooms가 호출됨 — 이 결과는 폐기
      isLoading.value = false
      return
    }

    const succeeded = []
    let lastError = null
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        try {
          const { roomId, result } = outcome.value
          roomTokens.value.set(roomId, result.nextToken || null)
          succeeded.push(...result.files.map(file => ({ ...file, roomId })))
        } catch (parseErr) {
          lastError = parseErr
          console.error('[useFileManager] 룸 응답 처리 실패(부분):', parseErr)
        }
      } else {
        lastError = outcome.reason
        console.error('[useFileManager] 룸 로드 실패(부분):', outcome.reason)
      }
    }

    files.value = mergeAndSort(succeeded)
    totalSize.value = files.value.reduce((sum, file) => sum + (file.size || 0), 0)
    error.value = succeeded.length === 0 ? lastError : null

    isLoading.value = false

    console.log(`[useFileManager] 병합 파일 로드 완료: ${files.value.length}개, hasMore: ${hasMore.value}`)
  }

  /**
   * 단일 룸의 파일 목록을 불러옵니다 (loadFilesFromRooms의 단일 룸 편의 래퍼).
   *
   * @param {string} roomId - 룸 ID
   * @param {Object} options - 로드 옵션 (limit, continuationToken)
   * @returns {Promise<void>}
   */
  async function loadFiles(roomId, options = {}) {
    if (!roomId) {
      console.warn('[useFileManager] roomId가 없습니다')
      return
    }
    return loadFilesFromRooms([roomId], options)
  }

  /**
   * 파일을 업로드합니다.
   * 룸 용량 제한 검증은 병합된 totalSize가 아니라 "업로드 대상 룸"의
   * 용량만으로 수행한다 (다른 룸의 용량이 섞여 들어가면 안 됨).
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

    // 병합된 totalSize가 아니라, 업로드 대상 룸만의 현재 용량을 사용한다
    // (다른 룸의 용량이 이 룸의 한도 검증에 섞이면 안 됨)
    const currentRoomSize = roomSize(roomId)
    const totalSizeAfterUpload = currentRoomSize + file.size

    console.log(`[useFileManager] 대상 룸(${roomId}) 현재 용량: ${currentRoomSize} bytes, 업로드 후: ${totalSizeAfterUpload} bytes`)

    // 룸 용량 제한 체크
    if (totalSizeAfterUpload > MAX_ROOM_SIZE) {
      const currentSizeMB = (currentRoomSize / 1024 / 1024).toFixed(2)
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
      return result
    } catch (err) {
      console.error('[useFileManager] 업로드 오류:', err)
      throw err
    }
  }

  /**
   * 파일을 삭제합니다. roomId + fileName 조합으로 정확히 식별한다
   * (같은 파일명이 다른 룸에 동시에 존재할 수 있으므로).
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
      const fileToDelete = files.value.find(f => f.name === fileName && f.roomId === roomId)

      // 서비스 레이어를 통해 파일 삭제
      const result = await r2Service.deleteFile(roomId, fileName)

      // 로컬 상태에서도 제거
      files.value = files.value.filter(f => !(f.name === fileName && f.roomId === roomId))

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
   * 추가 파일 목록을 불러옵니다 (페이지네이션).
   * 아직 nextToken이 남아있는 룸들만 대상으로 이어서 불러온 뒤 병합한다.
   *
   * 룸별로 성공/실패를 분리 처리한다(Promise.allSettled): 토큰은 성공한
   * 룸만 전진시키고, 실패한 룸은 같은 토큰을 유지해 다음 호출에서 같은
   * 페이지를 재시도한다(영구 스킵 방지).
   *
   * @param {Object} options - 로드 옵션 (limit)
   * @returns {Promise<void>}
   */
  async function loadMore(options = {}) {
    if (activeRoomIds.length === 0) {
      console.warn('[useFileManager] 활성 룸이 없습니다')
      return
    }

    if (!hasMore.value) {
      console.warn('[useFileManager] 더 이상 불러올 파일이 없습니다')
      return
    }

    isLoading.value = true
    error.value = null
    const myGeneration = loadGeneration

    const targets = activeRoomIds.filter(roomId => roomTokens.value.get(roomId))
    console.log('[useFileManager] 추가 파일 로딩 시작:', targets)

    const settled = await Promise.allSettled(
      targets.map(async (roomId) => {
        const result = await r2Service.loadFiles(roomId, {
          ...options,
          continuationToken: roomTokens.value.get(roomId)
        })
        return { roomId, result }
      })
    )

    if (myGeneration !== loadGeneration) {
      // 그 사이 새로운 loadFilesFromRooms가 호출됨 — 이 결과는 폐기
      isLoading.value = false
      return
    }

    const newFiles = []
    let lastError = null
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        try {
          const { roomId, result } = outcome.value
          // 성공한 룸만 토큰을 전진시킨다 — 실패한 룸은 같은 토큰으로 다음에 재시도됨
          roomTokens.value.set(roomId, result.nextToken || null)
          newFiles.push(...result.files.map(file => ({ ...file, roomId })))
        } catch (parseErr) {
          lastError = parseErr
          console.error('[useFileManager] 추가 룸 응답 처리 실패(부분):', parseErr)
        }
      } else {
        lastError = outcome.reason
        console.error('[useFileManager] 추가 룸 로드 실패(부분):', outcome.reason)
      }
    }

    files.value = mergeAndSort([...files.value, ...newFiles])
    totalSize.value = files.value.reduce((sum, file) => sum + (file.size || 0), 0)
    if (newFiles.length === 0 && lastError) error.value = lastError

    isLoading.value = false

    console.log(`[useFileManager] 추가 파일 로드 완료: 총 ${files.value.length}개, hasMore: ${hasMore.value}`)
  }

  /**
   * 룸의 모든 파일을 삭제합니다. 병합된 목록에서 해당 룸의 파일만 제거하고
   * 다른 룸의 파일은 그대로 유지한다.
   *
   * @param {string} roomId - 룸 ID
   * @returns {Promise<Object>} 삭제 결과
   */
  async function deleteAllFiles(roomId) {
    if (!roomId) {
      throw new Error('roomId가 필요합니다')
    }

    try {
      console.log('[useFileManager] 전체 파일 삭제 시작:', roomId)
      const result = await r2Service.deleteAllFiles(roomId)

      const removedSize = files.value
        .filter(f => f.roomId === roomId)
        .reduce((sum, f) => sum + (f.size || 0), 0)

      files.value = files.value.filter(f => f.roomId !== roomId)
      totalSize.value -= removedSize
      roomTokens.value.delete(roomId)

      console.log('[useFileManager] 전체 파일 삭제 완료:', roomId)
      return result
    } catch (err) {
      console.error('[useFileManager] 전체 파일 삭제 오류:', err)
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
    roomTokens.value = new Map()
    activeRoomIds = []
    console.log('[useFileManager] 파일 목록 초기화')
  }

  /**
   * 파일 목록에 새 파일을 추가합니다 (UX 개선용, 업로드 직후 즉시 반영).
   * @param {Object} file - 추가할 파일 객체. roomId를 포함해야 정확한 삭제/용량 검증이 가능하다.
   */
  function addFile(file) {
    files.value.unshift(file)
  }

  return {
    /**
     * @property {import('vue').Readonly<Array>} files
     * 병합된 파일 목록 (읽기 전용). 각 파일은 roomId를 보유한다.
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
     * 현재 로드된 전체 파일의 합산 용량 (바이트, 읽기 전용, 표시용).
     */
    totalSize: readonly(totalSize),
    /**
     * @property {import('vue').ComputedRef<boolean>} hasMore
     * 더 불러올 파일이 있는지 여부 (룸 중 하나라도 다음 페이지가 있으면 true).
     */
    hasMore,
    hasMoreForRoom,

    /**
     * 단일 룸의 파일 목록을 불러오는 함수 (loadFilesFromRooms 래퍼).
     * @param {string} roomId - 룸 ID
     * @param {Object} options - 로드 옵션
     * @returns {Promise<void>}
     */
    loadFiles,
    /**
     * 여러 룸의 파일 목록을 출처 구분 없이 병합해서 불러오는 함수.
     * @param {string[]} roomIds - 룸 ID 목록
     * @param {Object} options - 로드 옵션
     * @returns {Promise<void>}
     */
    loadFilesFromRooms,
    /**
     * 추가 파일 목록을 불러오는 함수 (페이지네이션, 다중 룸 대응).
     * @param {Object} options - 로드 옵션
     * @returns {Promise<void>}
     */
    loadMore,
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
    deleteAllFiles,
    /**
     * 파일 목록을 초기화하는 함수.
     */
    clearFiles,
    /**
     * 파일 목록에 새 파일을 추가하는 함수.
     */
    addFile,
    /**
     * 특정 룸에 속한 (현재 로드된) 파일들의 합산 용량을 반환하는 함수.
     * @param {string} roomId - 룸 ID
     * @returns {number} 바이트
     */
    roomSize
  }
}
