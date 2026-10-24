import { t } from '../i18n/translate.js'
/**
 * R2 Storage 서비스
 *
 * Cloudflare R2와의 상호작용을 담당하는 서비스입니다.
 * 백엔드 API를 통해 Presigned URL을 받아 직접 R2에 업로드합니다.
 * 다운로드는 퍼블릭 URL을 통해 직접 접근합니다.
 */
import { roomAuthHeaders, invalidateRoomToken } from './roomTokenStore'
import { trackEvent } from '../utils/analytics.js'
import { SERVER_ERROR_MESSAGES } from '../utils/apiErrors.js'
import { multipartUpload, isMultipartFile } from './multipartUploader.js'
import { socketService } from './socketService.js'
import { mbpsBucket } from '../utils/mbpsBucket.js'

export const UPLOAD_PERF_MIN_BYTES = 8 * 1024 * 1024

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const perfMobile = () => {
  try { return /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent || '') } catch { return false }
}
const perfConn = () => {
  try { return navigator.connection?.effectiveType || undefined } catch { return undefined }
}
const perfClean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))
/** 측정 이벤트는 어떤 경우에도 업로드 결과에 영향을 주지 않는다 */
function safeTrack(name, params) {
  try { trackEvent(name, perfClean(params)) } catch { /* noop */ }
}
function failReason(err) {
  try {
    if (err?.code === 'UPLOAD_CANCELED' || err?.name === 'AbortError') return 'canceled'
    if (typeof err?.status === 'number' || /\b[1-5]\d\d\b/.test(String(err?.message || ''))) return 'http'
    if (err instanceof TypeError || /network|네트워크|timeout|시간/i.test(String(err?.message || ''))) return 'network'
  } catch { /* noop */ }
  return 'other'
}

/** 업로더 표시용: 연결된 소켓 ID가 있으면 요청 본문에 실어 보낸다 (서버가 룸 소속 확인 후 기록, 없으면 생략) */
const socketIdField = () => {
  const id = socketService.socket?.id
  return id ? { socketId: id } : {}
}

/**
 * 실패한 응답을 Error로 바꾼다. 알려진 서버 code는 i18n 메시지와 code/status를 붙인다.
 * @param {Response} response
 * @param {string} fallbackKey - code가 없을 때 쓸 errors.* 키 (인자: {status})
 */
export async function buildApiError(response, fallbackKey) {
  let body = {}
  try { body = (await response.json()) || {} } catch { /* 본문 없음 */ }
  const entry = SERVER_ERROR_MESSAGES[body?.code]
  if (entry) {
    if (body.code === 'DAILY_QUOTA_EXCEEDED') trackEvent('daily_quota_exceeded')
    return Object.assign(new Error(t(entry.key, entry.params)), { code: body.code, status: response.status })
  }
  return Object.assign(new Error(t(fallbackKey, { status: response.status })), {
    code: body?.code,
    status: response.status,
  })
}

class R2Service {
  constructor() {
    // 백엔드 API URL
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'

    // R2 퍼블릭 URL
    this.publicUrl = import.meta.env.VITE_R2_PUBLIC_URL || 'https://store.clipboardapp.org'

    // 직접 업로드 임계값 (1MB) - 이 크기 이하는 서버를 통해 직접 업로드
    this.directUploadThreshold = 1 * 1024 * 1024
  }

  /**
   * 룸 토큰이 필요한 API 호출 (목록·업로드·삭제).
   * 토큰이 있으면 X-Room-Token 헤더를 붙이고, 401이면 토큰을 버리고 한 번만 재시도한다.
   * 토큰이 없으면(구버전 백엔드) 헤더 없이 기존과 똑같이 호출한다.
   *
   * @param {string} roomId - 룸 ID
   * @param {string} url - 요청 URL
   * @param {RequestInit} [init] - fetch 옵션
   * @returns {Promise<Response>}
   */
  async fetchWithRoomAuth(roomId, url, init) {
    const send = async () => {
      const auth = await roomAuthHeaders(roomId)
      const hadToken = Object.keys(auth).length > 0
      if (!hadToken) {
        // 토큰이 없으면 기존 호출과 완전히 같게 (불필요한 preflight도 생기지 않음)
        return { response: await (init ? fetch(url, init) : fetch(url)), hadToken }
      }
      const headers = { ...(init?.headers || {}), ...auth }
      return { response: await fetch(url, { ...(init || {}), headers }), hadToken }
    }

    const first = await send()
    if (first.response.status !== 401 || !first.hadToken) return first.response

    console.warn('[R2Service] 룸 토큰 거부(401) - 재발급 후 1회 재시도')
    invalidateRoomToken(roomId)
    return (await send()).response
  }

  /**
   * 파일의 공개 URL을 생성합니다
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 파일명
   * @returns {string} 파일의 공개 URL
   */
  getFileUrl(roomId, fileName) {
    return `${this.publicUrl}/${roomId}/${fileName}`
  }

  /**
   * 파일의 썸네일 공개 URL을 생성합니다 (thumbs/{roomId}/{fileName}.jpg)
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 파일명
   * @returns {string} 썸네일 URL
   */
  getThumbUrl(roomId, fileName) {
    return `${this.publicUrl}/thumbs/${roomId}/${fileName}.jpg`
  }

  /**
   * 여러 파일의 업로드 Presigned URL을 한 번의 요청으로 받습니다.
   *
   * 배치 엔드포인트(/api/r2/presigned-urls)가 404를 돌려주면 아직 구버전 백엔드가
   * 배포된 상태이므로, 파일별 단일 엔드포인트(/api/r2/presigned-url)로 폴백한다.
   * 프론트(Vercel 자동 배포)와 백엔드(수동 배포)는 따로 배포되기 때문에 새 엔드포인트가
   * 잠시 없을 수 있다. 폴백 결과에는 썸네일 URL이 없어 썸네일 업로드만 생략된다.
   *
   * @param {string} roomId - 룸 ID
   * @param {Array<{fileName: string, contentType: string, size?: number}>} files - 파일 메타데이터
   * @returns {Promise<Array<{uploadUrl: string, fileUrl: string, fileName: string, thumbUploadUrl?: string, thumbUrl?: string}>>}
   */
  async getUploadUrls(roomId, files) {
    const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/presigned-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, files, ...socketIdField() }),
    })

    if (response.status === 404) {
      console.warn('[R2Service] 배치 presign 엔드포인트 없음(404) - 파일별 단일 presign으로 폴백')
      return Promise.all(files.map(file => this.getUploadUrl(roomId, file.fileName, file.contentType, file.size)))
    }

    if (!response.ok) {
      throw await buildApiError(response, 'errors.batchPresignFailed')
    }

    const { files: targets } = await response.json()
    return targets
  }

  /**
   * 단일 파일의 업로드 Presigned URL을 받습니다 (레거시 엔드포인트, 썸네일 URL 없음).
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 원본 파일명
   * @param {string} contentType - Content-Type
   * @param {number} [size] - 파일 크기(바이트). 서버가 용량 검증과 Content-Length 서명에 사용
   * @returns {Promise<{uploadUrl: string, fileUrl: string, fileName: string}>}
   */
  async getUploadUrl(roomId, fileName, contentType, size) {
    const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, fileName, contentType, size, ...socketIdField() }),
    })

    if (!response.ok) {
      throw await buildApiError(response, 'errors.presignFailed')
    }

    const { uploadUrl, fileUrl, fileName: storedName } = await response.json()
    return { uploadUrl, fileUrl, fileName: storedName }
  }

  /**
   * Presigned URL로 본문을 PUT 합니다 (XHR: 진행률 추적).
   *
   * @param {string} uploadUrl - Presigned PUT URL
   * @param {Blob|File} body - 업로드할 본문
   * @param {string} contentType - 서명된 Content-Type
   * @param {{onProgress?: (percent: number) => void, timeoutMs?: number}} [options]
   * @returns {Promise<void>}
   */
  putToPresignedUrl(uploadUrl, body, contentType, options = {}) {
    const { onProgress, timeoutMs = 300000, signal } = options

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(t('errors.r2UploadFailed', { status: xhr.status })))
        }
      })

      xhr.addEventListener('error', () => reject(new Error(t('errors.networkUploadFailed'))))
      xhr.addEventListener('timeout', () => reject(new Error(t('errors.uploadTimeout'))))
      xhr.addEventListener('abort', () => reject(Object.assign(new Error('Upload canceled'), { code: 'UPLOAD_CANCELED' })))

      if (signal) {
        if (signal.aborted) {
          reject(Object.assign(new Error('Upload canceled'), { code: 'UPLOAD_CANCELED' }))
          return
        }
        // 이미 응답을 받은(DONE) 요청은 abort가 no-op이므로 그대로 완료로 처리된다
        signal.addEventListener('abort', () => xhr.abort(), { once: true })
      }

      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.timeout = timeoutMs
      xhr.send(body)
    })
  }

  /**
   * 멀티파트 엔드포인트 호출 (JSON POST). 실패하면 code/status가 붙은 Error를 던진다.
   * @param {string} roomId
   * @param {'create'|'sign'|'parts'|'complete'|'abort'} action
   * @param {object} payload
   */
  async multipartCall(roomId, action, payload) {
    const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/multipart/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, ...payload, ...(action === 'create' ? socketIdField() : {}) }),
    })
    if (!response.ok) {
      throw await buildApiError(response, 'errors.multipartFailed')
    }
    return response.json()
  }

  /** multipartUploader에 주입하는 API 어댑터 */
  get multipartApi() {
    return {
      create: (roomId, p) => this.multipartCall(roomId, 'create', p),
      sign: (roomId, p) => this.multipartCall(roomId, 'sign', p),
      parts: (roomId, p) => this.multipartCall(roomId, 'parts', p),
      complete: (roomId, p) => this.multipartCall(roomId, 'complete', p),
      abort: (roomId, p) => this.multipartCall(roomId, 'abort', p),
    }
  }

  // === 비밀번호 잠금 파일 (docs/superpowers/specs/2026-10-13-password-lock-design.md) ===

  /**
   * 잠금 멀티파트 엔드포인트 호출. 업로드·삭제는 룸 토큰이 필요하다.
   * @param {string} roomId
   * @param {'create'|'sign'|'parts'|'complete'|'abort'} action
   * @param {object} payload
   */
  async lockedMultipartCall(roomId, action, payload) {
    const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/locked/multipart/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, ...payload, ...(action === 'create' ? socketIdField() : {}) }),
    })
    if (!response.ok) {
      throw await buildApiError(response, 'errors.multipartFailed')
    }
    return response.json()
  }

  /** 잠금 업로드용 multipartUploader API 어댑터. create 본문은 { size: 평문 크기, lock: 잠금 메타데이터 } */
  get lockedMultipartApi() {
    return {
      create: (roomId, p) => this.lockedMultipartCall(roomId, 'create', { size: p.size, lock: p.lock }),
      sign: (roomId, p) => this.lockedMultipartCall(roomId, 'sign', p),
      parts: (roomId, p) => this.lockedMultipartCall(roomId, 'parts', p),
      complete: (roomId, p) => this.lockedMultipartCall(roomId, 'complete', p),
      abort: (roomId, p) => this.lockedMultipartCall(roomId, 'abort', p),
    }
  }

  /**
   * 잠긴 파일 메타데이터 (토큰 불필요 — 비밀번호가 관문이다)
   * @returns {Promise<{v:number, salt:string, size:number, rs:number, remaining:number}>}
   */
  async lockedMeta(roomId, id) {
    const response = await fetch(`${this.apiUrl}/api/r2/locked/meta/${encodeURIComponent(roomId)}/${encodeURIComponent(id)}`)
    if (!response.ok) throw await buildApiError(response, 'lock.errors.metaFailed')
    return response.json()
  }

  /**
   * 비밀번호 확인값(verifier)으로 60초 다운로드 URL과 감싼 키를 받는다.
   * 틀리면 code=WRONG_PASSWORD(+remaining), 시도 초과면 LOCKED_OUT 에러를 던진다.
   */
  async lockedUnlock(roomId, id, verifier) {
    const response = await fetch(`${this.apiUrl}/api/r2/locked/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, id, verifier }),
    })
    if (response.ok) return response.json()
    let body = {}
    try { body = (await response.json()) || {} } catch { /* 본문 없음 */ }
    throw Object.assign(new Error(t('lock.errors.unlockFailed', { status: response.status })), {
      code: body.code,
      status: response.status,
      remaining: typeof body.remaining === 'number' ? body.remaining : undefined,
    })
  }

  /**
   * 잠긴 파일 삭제 (룸 토큰 + 증명 필요).
   * @param {{deleteKey?: string, verifier?: string}} proof 올린 기기의 삭제 키 또는 비밀번호 확인값
   */
  async deleteLockedFile(roomId, id, proof = {}) {
    if (!roomId || !id) throw new Error('roomId와 id는 필수입니다')
    const body = { roomId, id }
    if (proof.deleteKey) body.deleteKey = proof.deleteKey
    if (proof.verifier) body.verifier = proof.verifier
    const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/locked/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) return { success: true, data: await response.json().catch(() => ({})) }
    let data = {}
    try { data = (await response.json()) || {} } catch { /* 본문 없음 */ }
    const message = data.code === 'LOCKED_OUT'
      ? t('lock.lockedOut')
      : response.status === 403
        ? t('lock.errors.deleteForbidden')
        : t('errors.deleteFailed', { status: response.status })
    throw Object.assign(new Error(message), { code: data.code, status: response.status })
  }

  /**
   * 브라우저 네이티브 다운로드용 Presigned URL(Content-Disposition: attachment)을 받습니다.
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 파일명
   * @returns {Promise<string>} Presigned GET URL
   */
  async getDownloadUrl(roomId, fileName) {
    const response = await fetch(
      `${this.apiUrl}/api/r2/download-url/${roomId}/${encodeURIComponent(fileName)}`
    )

    if (!response.ok) {
      throw new Error(t('errors.downloadUrlFailed', { status: response.status }))
    }

    const { url } = await response.json()
    return url
  }

  /**
   * 여러 파일의 네이티브 다운로드 URL을 한 번에 받습니다.
   *
   * @param {string} roomId - 룸 ID
   * @param {string[]} fileNames - 파일명 목록
   * @returns {Promise<Record<string, string>>} 파일명 → Presigned GET URL
   */
  async getDownloadUrls(roomId, fileNames) {
    const response = await fetch(`${this.apiUrl}/api/r2/download-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, fileNames }),
    })

    if (!response.ok) {
      throw new Error(t('errors.downloadUrlFailed', { status: response.status }))
    }

    const { urls } = await response.json()
    return Object.fromEntries(urls.map(({ fileName, url }) => [fileName, url]))
  }

  /**
   * 특정 룸의 파일 목록을 불러옵니다
   *
   * @param {string} roomId - 룸 ID
   * @param {Object} options - 옵션
   * @param {number} options.limit - 최대 파일 수 (기본값: 100)
   * @param {string} options.continuationToken - 다음 페이지 토큰
   * @returns {Promise<{files: Array, nextToken: string|undefined}>} 파일 목록과 다음 토큰
   */
  async loadFiles(roomId, options = {}) {
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    const { limit = 100, continuationToken } = options

    console.log('[R2Service] 파일 로드 시작:', { roomId, limit, continuationToken })

    try {
      // URL 파라미터 구성
      const params = new URLSearchParams({ limit: limit.toString() })
      if (continuationToken) {
        params.append('continuationToken', continuationToken)
      }

      const response = await this.fetchWithRoomAuth(
        roomId,
        `${this.apiUrl}/api/r2/files/${roomId}?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(t('errors.listFailed', { status: response.status }))
      }

      const { files, nextToken } = await response.json()

      console.log(`[R2Service] 파일 로드 완료: ${files.length}개, nextToken: ${nextToken ? '있음' : '없음'}`)

      // 파일 정보를 표준 형식으로 변환 (supabaseService와 동일한 형식)
      return {
        files: files.map(file => file.locked ? ({
          // 잠긴 파일: name은 서버 id, 공개 URL·썸네일 없음, size는 평문 크기
          name: file.name,
          locked: true,
          created: file.lastModified,
          size: file.size,
          type: 'application/octet-stream',
          ...(file.uploader ? { uploader: file.uploader } : {})
        }) : ({
          name: file.name,
          url: file.url,
          created: file.lastModified,
          size: file.size,
          type: this.getMimeTypeFromFileName(file.name),
          // 서버가 기록해 둔 업로더 (없으면 생략)
          ...(file.uploader ? { uploader: file.uploader } : {})
        })),
        nextToken
      }
    } catch (error) {
      console.error('[R2Service] 파일 로드 예외:', error)
      throw error
    }
  }

  /**
   * 파일을 업로드합니다 (하이브리드 방식)
   * - 작은 파일 (< 1MB): 서버를 통해 직접 업로드 (1번 요청)
   * - 큰 파일 (>= 1MB): Presigned URL 사용 (2번 요청)
   *
   * @param {string} roomId - 룸 ID
   * @param {File} file - 업로드할 파일
   * @param {Object} options - 옵션
   * @param {Function} options.onProgress - 진행률 콜백 (percent: number) => void
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadFile(roomId, file, options = {}) {
    // 파라미터 검증
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    if (!file) {
      throw new Error('file은 필수입니다')
    }

    if (!(file instanceof File) && !(file instanceof Blob)) {
      throw new Error('file은 File 또는 Blob 객체여야 합니다')
    }

    console.log('[R2Service] 파일 업로드 시작:', { roomId, fileName: file.name, size: file.size })

    const measure = file.size >= UPLOAD_PERF_MIN_BYTES
    const multipart = isMultipartFile(file.size)
    const uploadPath = multipart ? 'multipart' : 'single'
    const uploadMb = Math.round((file.size / (1024 * 1024)) * 10) / 10
    const t0 = measure ? perfNow() : 0
    try {
      const result = await this._uploadFileInner(roomId, file, options, multipart)
      if (measure) {
        const ms = Math.max(perfNow() - t0, 1)
        const mbps = Math.round(((file.size * 8) / 1e6 / (ms / 1000)) * 10) / 10
        safeTrack('upload_perf', {
          upload_mb: uploadMb,
          upload_ms: Math.round(ms),
          upload_mbps: mbps,
          mbps_bucket: mbpsBucket(mbps),
          upload_path: uploadPath,
          retries: Number(result?._retries) || 0,
          resumed: !!result?._resumed,
          locked: !!options?.locked,
          is_mobile: perfMobile(),
          effective_type: perfConn(),
        })
      }
      if (result && '_retries' in result) { delete result._retries; delete result._resumed }
      return result
    } catch (error) {
      if (measure) {
        safeTrack('upload_perf_fail', {
          upload_mb: uploadMb,
          upload_path: uploadPath,
          reason: failReason(error),
          is_mobile: perfMobile(),
        })
      }
      throw error
    }
  }

  async _uploadFileInner(roomId, file, options, multipart) {
    if (multipart) {
      const result = await multipartUpload(roomId, file, { api: this.multipartApi, ...options })
      return {
        _retries: result.retries,
        _resumed: result.resumed,
        success: true,
        path: `${roomId}/${result.fileName}`,
        fileName: result.fileName,
        url: result.fileUrl,
        size: result.size,
        created: new Date().toISOString()
      }
    }

    return this.uploadWithPresignedUrl(roomId, file, options)
  }

  /**
   * 서버를 통해 직접 업로드합니다 (작은 파일용)
   *
   * @param {string} roomId - 룸 ID
   * @param {File} file - 업로드할 파일
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadDirect(roomId, file) {
    console.log('[R2Service] 직접 업로드 방식 사용')

    try {
      const formData = new FormData()
      formData.append('roomId', roomId)
      const { socketId } = socketIdField()
      if (socketId) formData.append('socketId', socketId)
      formData.append('file', file)

      const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw await buildApiError(response, 'errors.directUploadFailed')
      }

      const { fileName, fileUrl, size } = await response.json()

      console.log('[R2Service] 직접 업로드 성공:', fileName)

      return {
        success: true,
        path: `${roomId}/${fileName}`,
        fileName,
        url: fileUrl,
        size,
        created: new Date().toISOString()
      }
    } catch (error) {
      console.error('[R2Service] 직접 업로드 예외:', error)
      throw error
    }
  }

  /**
   * Presigned URL을 사용하여 업로드합니다 (큰 파일용)
   *
   * @param {string} roomId - 룸 ID
   * @param {File} file - 업로드할 파일
   * @param {Object} options - 옵션
   * @param {Function} options.onProgress - 진행률 콜백
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadWithPresignedUrl(roomId, file, options = {}) {
    console.log('[R2Service] Presigned URL 방식 사용')

    const { onProgress } = options

    try {
      // 1. 백엔드에서 Presigned URL 받기
      const presignedResponse = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/presigned-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      })

      if (!presignedResponse.ok) {
        throw await buildApiError(presignedResponse, 'errors.presignFailed')
      }

      const { uploadUrl, fileUrl, fileName } = await presignedResponse.json()

      // 2. R2에 직접 PUT (진행률 추적)
      await this.putToPresignedUrl(uploadUrl, file, file.type || 'application/octet-stream', { onProgress })

      console.log('[R2Service] Presigned URL 업로드 성공:', fileName)
      return {
        success: true,
        path: `${roomId}/${fileName}`,
        fileName,
        url: fileUrl,
        size: file.size,
        created: new Date().toISOString()
      }
    } catch (error) {
      console.error('[R2Service] Presigned URL 업로드 예외:', error)
      throw error
    }
  }

  /**
   * 파일을 삭제합니다
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 삭제할 파일명
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteFile(roomId, fileName) {
    if (!roomId || !fileName) {
      throw new Error('roomId와 fileName은 필수입니다')
    }

    console.log('[R2Service] 파일 삭제 시작:', `${roomId}/${fileName}`)

    try {
      const response = await this.fetchWithRoomAuth(
        roomId,
        `${this.apiUrl}/api/r2/files/${roomId}/${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error(t('errors.deleteFailed', { status: response.status }))
      }

      const data = await response.json()

      console.log('[R2Service] 삭제 성공')

      return {
        success: true,
        data
      }
    } catch (error) {
      console.error('[R2Service] 삭제 예외:', error)
      throw error
    }
  }

  /**
   * 룸의 모든 파일을 삭제합니다
   *
   * @param {string} roomId - 룸 ID
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteAllFiles(roomId) {
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    console.log('[R2Service] 룸 전체 파일 삭제 시작:', roomId)

    try {
      const response = await this.fetchWithRoomAuth(
        roomId,
        `${this.apiUrl}/api/r2/files/${roomId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error(t('errors.deleteAllFailed', { status: response.status }))
      }

      const { deletedCount } = await response.json()

      console.log(`[R2Service] 전체 삭제 성공: ${deletedCount}개 파일`)

      return {
        success: true,
        deletedCount
      }
    } catch (error) {
      console.error('[R2Service] 전체 삭제 예외:', error)
      throw error
    }
  }

  /**
   * 룸의 총 파일 용량을 바이트 단위로 반환합니다
   *
   * @param {string} roomId - 룸 ID
   * @returns {Promise<number>} 총 파일 용량 (바이트)
   */
  async getRoomTotalSize(roomId) {
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    console.log('[R2Service] 룸 총 용량 조회 시작:', roomId)

    try {
      const response = await this.fetchWithRoomAuth(roomId, `${this.apiUrl}/api/r2/size/${roomId}`)

      if (!response.ok) {
        throw new Error(t('errors.quotaFailed', { status: response.status }))
      }

      const { totalSize } = await response.json()

      console.log(`[R2Service] 룸 총 용량: ${totalSize} bytes`)

      return totalSize
    } catch (error) {
      console.error('[R2Service] 총 용량 조회 예외:', error)
      throw error
    }
  }

  /**
   * 파일명에서 MIME 타입을 추출합니다
   *
   * @param {string} fileName - 파일명
   * @returns {string} MIME 타입
   */
  getMimeTypeFromFileName(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase()
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
    }
    return mimeTypes[extension] || 'application/octet-stream'
  }
}

// 싱글톤 인스턴스 생성 및 export
export const r2Service = new R2Service()
