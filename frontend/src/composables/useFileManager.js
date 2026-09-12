import { ref, readonly, computed } from 'vue'
import { r2Service } from '../services/r2Service.js'
import { runWithConcurrency } from '../utils/concurrency.js'
import { createImageThumbnail, THUMBNAIL_CONTENT_TYPE } from '../utils/thumbnail.js'

/** 동시에 진행하는 업로드 수 (모바일 망·메모리 보호) */
const DEFAULT_UPLOAD_CONCURRENCY = 3

/**
 * 단일 파일 검증. 실패 사유를 Error로 반환하고 통과하면 null을 반환한다.
 * 환경 변수는 호출 시점에 읽는다 (테스트에서 값을 바꿀 수 있도록).
 */
function validateFile(file) {
  const maxFileSizeMB = import.meta.env.VITE_MAX_FILE_SIZE_MB || 10
  const MAX_FILE_SIZE = maxFileSizeMB * 1024 * 1024

  if (file.size === 0) {
    return new Error('파일이 비어있습니다')
  }
  if (file.size > MAX_FILE_SIZE) {
    return new Error(`파일 크기는 ${maxFileSizeMB}MB를 초과할 수 없습니다`)
  }
  return null
}

function fileKey(roomId, name) {
  return `${roomId}::${name}`
}

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

  // === 조회 중 변경 기록 ===
  // 목록 조회(loadFilesFromRooms/loadMore)가 진행되는 동안 소켓 메시지나 로컬 조작으로
  // 일어난 변경(addFile/removeFile/clearRoomFiles)은 조회 응답에 들어 있지 않다
  // (응답은 요청 시점의 스냅샷). 응답을 그대로 커밋하면 그 사이에 추가된 파일이
  // 사라지거나 삭제된 파일이 되살아난다. 그래서 조회 중의 변경을 순서대로 기록해 두고
  // 커밋 시 조회 결과 위에 다시 적용한다. 조회가 하나도 진행 중이 아닐 때는 기록하지 않는다.
  let inFlightLoads = 0
  let pendingMutations = [] // { type: 'add'|'remove'|'clear', roomId, name?, file? }

  function recordMutation(mutation) {
    if (inFlightLoads > 0) pendingMutations.push(mutation)
  }

  function beginLoad() {
    inFlightLoads++
  }

  function endLoad() {
    inFlightLoads--
    if (inFlightLoads === 0) pendingMutations = []
  }

  /** 조회 중 기록된 변경을 fileList 위에 순서대로 적용한 새 배열을 반환 (fileList는 변경하지 않음) */
  function applyPendingMutations(fileList) {
    let result = [...fileList]
    for (const mutation of pendingMutations) {
      if (mutation.type === 'clear') {
        result = result.filter(f => f.roomId !== mutation.roomId)
      } else if (mutation.type === 'remove') {
        const key = fileKey(mutation.roomId, mutation.name)
        result = result.filter(f => fileKey(f.roomId, f.name) !== key)
      } else if (mutation.type === 'add') {
        const key = fileKey(mutation.file.roomId, mutation.file.name)
        const index = result.findIndex(f => fileKey(f.roomId, f.name) === key)
        if (index === -1) {
          result.push(mutation.file)
        } else {
          result[index] = { ...result[index], ...mutation.file }
        }
      }
    }
    return result
  }

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
    beginLoad()

    console.log('[useFileManager] 병합 파일 로딩 시작:', ids)

    let settled
    try {
      settled = await Promise.allSettled(
        ids.map(async (roomId) => {
          const result = await r2Service.loadFiles(roomId, options)
          return { roomId, result }
        })
      )
    } catch (err) {
      endLoad()
      isLoading.value = false
      throw err
    }

    if (myGeneration !== loadGeneration) {
      // 그 사이 새로운 loadFilesFromRooms가 호출됨 — 이 결과는 폐기
      // (조회 중 기록된 변경은 최신 조회가 커밋할 때 함께 적용된다)
      endLoad()
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

    // 조회 중(소켓 수신 등) 일어난 변경을 스냅샷 위에 덧씌운 뒤 커밋한다
    files.value = mergeAndSort(applyPendingMutations(succeeded))
    endLoad()
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

    // 파일 크기 검증 (환경 변수 VITE_MAX_FILE_SIZE_MB, 기본 10MB)
    const validationError = validateFile(file)
    if (validationError) {
      throw validationError
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
   * 여러 파일을 업로드합니다.
   * - 검증(빈 파일/최대 크기)을 통과한 파일만 배치 presign 1회로 URL을 받는다.
   * - 최대 concurrency개까지 동시에 PUT 한다.
   * - 이미지는 브라우저에서 만든 JPEG 썸네일을 원본과 병렬로 올리고, 둘 다 끝난 뒤 완료 처리한다
   *   (수신 측이 썸네일 404를 먼저 보지 않도록). 썸네일 실패는 무시한다.
   * - 성공한 파일은 즉시 로컬 목록(files)에 추가한다.
   *
   * @param {string} roomId - 업로드 대상 룸 ID
   * @param {File[]} files - 업로드할 파일들
   * @param {Object} options
   * @param {number} [options.concurrency=3]
   * @param {(file: File) => void} [options.onStart]
   * @param {(file: File, percent: number) => void} [options.onProgress]
   * @param {(file: File, result: Object) => void} [options.onComplete]
   * @param {(file: File, error: Error) => void} [options.onError]
   * @returns {Promise<{successCount: number, failCount: number, results: Array<{file: File, result?: Object, error?: Error}>}>}
   */
  async function uploadFiles(roomId, files, options = {}) {
    if (!roomId || !files || files.length === 0) {
      throw new Error('roomId와 files가 필요합니다')
    }

    const {
      concurrency = DEFAULT_UPLOAD_CONCURRENCY,
      onStart,
      onProgress,
      onComplete,
      onError
    } = options

    const outcomes = new Map() // file -> { result } | { error }
    const fail = (file, error) => {
      outcomes.set(file, { error })
      onError?.(file, error)
    }

    // 1. 검증 — 실패한 파일은 presign 대상에서 제외
    const pending = []
    for (const file of files) {
      const validationError = validateFile(file)
      if (validationError) {
        fail(file, validationError)
      } else {
        pending.push(file)
      }
    }

    // 2. 배치 presign (N파일 = 1왕복)
    let targets = []
    if (pending.length > 0) {
      try {
        targets = await r2Service.getUploadUrls(
          roomId,
          pending.map(file => ({ fileName: file.name, contentType: file.type || 'application/octet-stream' }))
        )
      } catch (err) {
        console.error('[useFileManager] 배치 presign 실패:', err)
        for (const file of pending) fail(file, err)
        return summarize(files, outcomes)
      }
    }

    // 3. 제한 병렬 PUT
    await runWithConcurrency(pending, concurrency, async (file, index) => {
      const target = targets[index]
      if (!target) {
        throw new Error('Presigned URL이 없습니다')
      }

      onStart?.(file)
      const contentType = file.type || 'application/octet-stream'

      // 썸네일은 원본 PUT과 병렬로 진행하되 어떤 실패도 원본 업로드를 막지 않는다
      const thumbUpload = target.thumbUploadUrl
        ? createImageThumbnail(file)
            .then(blob => (blob ? r2Service.putToPresignedUrl(target.thumbUploadUrl, blob, THUMBNAIL_CONTENT_TYPE) : null))
            .catch(err => { console.warn('[useFileManager] 썸네일 업로드 실패(무시):', err); return null })
        : Promise.resolve(null)

      await r2Service.putToPresignedUrl(target.uploadUrl, file, contentType, {
        onProgress: percent => onProgress?.(file, percent)
      })
      await thumbUpload

      const result = {
        success: true,
        path: `${roomId}/${target.fileName}`,
        fileName: target.fileName,
        url: target.fileUrl,
        size: file.size,
        created: new Date().toISOString()
      }

      addFile({ name: result.fileName, url: result.url, size: result.size, created: result.created, roomId })
      outcomes.set(file, { result })
      onComplete?.(file, result)
      return result
    }).then(settled => {
      settled.forEach((outcome, index) => {
        if (outcome.status === 'rejected') {
          console.error('[useFileManager] 업로드 실패:', pending[index].name, outcome.reason)
          fail(pending[index], outcome.reason)
        }
      })
    })

    return summarize(files, outcomes)
  }

  /** uploadFiles 결과 집계 (입력 순서 유지) */
  function summarize(files, outcomes) {
    const results = files.map(file => ({ file, ...(outcomes.get(file) || {}) }))
    const successCount = results.filter(r => r.result).length
    return { successCount, failCount: results.length - successCount, results }
  }

  /**
   * 로컬 목록에서 파일 하나를 제거합니다 (API 호출 없음, 소켓 동기화·삭제 후 정리용).
   * @returns {boolean} 실제로 제거됐는지
   */
  function removeFile(roomId, fileName) {
    // 아직 목록에 없더라도(조회 중) 삭제 사실은 기록해야 조회 결과에서 되살아나지 않는다
    recordMutation({ type: 'remove', roomId, name: fileName })

    const key = fileKey(roomId, fileName)
    const index = files.value.findIndex(f => fileKey(f.roomId, f.name) === key)
    if (index === -1) return false

    const [removed] = files.value.splice(index, 1)
    totalSize.value -= removed.size || 0
    return true
  }

  /**
   * 로컬 목록에서 특정 룸의 파일을 모두 비웁니다 (API 호출 없음).
   */
  function clearRoomFiles(roomId) {
    recordMutation({ type: 'clear', roomId })

    const removedSize = files.value
      .filter(f => f.roomId === roomId)
      .reduce((sum, f) => sum + (f.size || 0), 0)

    files.value = files.value.filter(f => f.roomId !== roomId)
    totalSize.value -= removedSize
    roomTokens.value.delete(roomId)
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

      // 서비스 레이어를 통해 파일 삭제
      const result = await r2Service.deleteFile(roomId, fileName)

      // 로컬 상태에서도 제거 (totalSize 포함)
      removeFile(roomId, fileName)

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
    beginLoad()

    const targets = activeRoomIds.filter(roomId => roomTokens.value.get(roomId))
    console.log('[useFileManager] 추가 파일 로딩 시작:', targets)

    let settled
    try {
      settled = await Promise.allSettled(
        targets.map(async (roomId) => {
          const result = await r2Service.loadFiles(roomId, {
            ...options,
            continuationToken: roomTokens.value.get(roomId)
          })
          return { roomId, result }
        })
      )
    } catch (err) {
      endLoad()
      isLoading.value = false
      throw err
    }

    if (myGeneration !== loadGeneration) {
      // 그 사이 새로운 loadFilesFromRooms가 호출됨 — 이 결과는 폐기
      endLoad()
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

    // 다음 페이지(요청 시점 스냅샷)에 조회 중 삭제된 파일이 섞여 있을 수 있으므로 변경 기록을 덧씌운다
    files.value = mergeAndSort(applyPendingMutations([...files.value, ...newFiles]))
    endLoad()
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

      clearRoomFiles(roomId)

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
    pendingMutations = [] // 전체 초기화이므로 조회 중 기록된 변경도 버린다
    console.log('[useFileManager] 파일 목록 초기화')
  }

  /**
   * 파일 목록에 파일을 추가합니다 (업로드 직후·소켓 수신 시 즉시 반영).
   * roomId+name이 같은 파일이 이미 있으면 새 정보로 교체한다 — 내가 올린 파일의
   * 브로드캐스트를 다시 받아도 중복되지 않는다. totalSize도 함께 유지한다.
   *
   * @param {Object} file - 추가할 파일 객체 (name, url, size, created, roomId)
   * @returns {boolean} 새로 추가됐으면 true, 기존 항목을 교체했으면 false
   */
  function addFile(file) {
    recordMutation({ type: 'add', file })

    const key = fileKey(file.roomId, file.name)
    const index = files.value.findIndex(f => fileKey(f.roomId, f.name) === key)

    if (index !== -1) {
      const previous = files.value[index]
      files.value.splice(index, 1, { ...previous, ...file })
      totalSize.value += (file.size || 0) - (previous.size || 0)
      return false
    }

    files.value.unshift(file)
    totalSize.value += file.size || 0
    return true
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
     * 여러 파일을 배치 presign + 제한 병렬로 업로드하고 로컬 목록에 반영하는 함수.
     * @param {string} roomId - 룸 ID
     * @param {File[]} files - 업로드할 파일들
     * @param {Object} options - concurrency, onStart, onProgress, onComplete, onError
     * @returns {Promise<{successCount: number, failCount: number, results: Array}>}
     */
    uploadFiles,
    /**
     * 파일을 삭제하는 함수.
     * @param {string} roomId - 룸 ID
     * @param {string} fileName - 삭제할 파일명
     * @returns {Promise<Object>} 삭제 결과
     */
    deleteFile,
    deleteAllFiles,
    /**
     * 로컬 목록에서만 파일을 제거하는 함수 (소켓 동기화용).
     */
    removeFile,
    /**
     * 로컬 목록에서만 특정 룸의 파일을 비우는 함수 (소켓 동기화용).
     */
    clearRoomFiles,
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
