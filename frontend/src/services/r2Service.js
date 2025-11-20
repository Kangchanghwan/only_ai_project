/**
 * R2 Storage 서비스
 *
 * Cloudflare R2와의 상호작용을 담당하는 서비스입니다.
 * 백엔드 API를 통해 Presigned URL을 받아 직접 R2에 업로드합니다.
 * 다운로드는 퍼블릭 URL을 통해 직접 접근합니다.
 */
class R2Service {
  constructor() {
    // 백엔드 API URL
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'

    // R2 퍼블릭 URL
    this.publicUrl = import.meta.env.VITE_R2_PUBLIC_URL || 'https://clipboardapp.org'

    // 직접 업로드 임계값 (1MB) - 이 크기 이하는 서버를 통해 직접 업로드
    this.directUploadThreshold = 1 * 1024 * 1024
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
   * 특정 룸의 파일 목록을 불러옵니다
   *
   * @param {string} roomId - 룸 ID
   * @param {Object} options - 옵션
   * @param {number} options.limit - 최대 파일 수 (기본값: 100)
   * @returns {Promise<Array>} 파일 목록
   */
  async loadFiles(roomId, options = {}) {
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    const { limit = 100 } = options

    console.log('[R2Service] 파일 로드 시작:', { roomId, limit })

    try {
      const response = await fetch(
        `${this.apiUrl}/api/r2/files/${roomId}?limit=${limit}`
      )

      if (!response.ok) {
        throw new Error(`파일 목록 조회 실패: ${response.status}`)
      }

      const { files } = await response.json()

      console.log(`[R2Service] 파일 로드 완료: ${files.length}개`)

      // 파일 정보를 표준 형식으로 변환 (supabaseService와 동일한 형식)
      return files.map(file => ({
        name: file.name,
        url: file.url,
        created: file.lastModified,
        size: file.size,
        type: this.getMimeTypeFromFileName(file.name)
      }))
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
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadFile(roomId, file) {
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


    return this.uploadWithPresignedUrl(roomId, file)
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
      formData.append('file', file)

      const response = await fetch(`${this.apiUrl}/api/r2/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `직접 업로드 실패: ${response.status}`)
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
   * @returns {Promise<Object>} 업로드 결과
   */
  async uploadWithPresignedUrl(roomId, file) {
    console.log('[R2Service] Presigned URL 방식 사용')

    try {
      // 1. 백엔드에서 Presigned URL 받기
      const presignedResponse = await fetch(`${this.apiUrl}/api/r2/presigned-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      })

      if (!presignedResponse.ok) {
        throw new Error(`Presigned URL 생성 실패: ${presignedResponse.status}`)
      }

      const { uploadUrl, fileUrl, fileName } = await presignedResponse.json()

      // 2. Presigned URL을 사용하여 R2에 직접 업로드
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      })

      if (!uploadResponse.ok) {
        throw new Error(`R2 업로드 실패: ${uploadResponse.status}`)
      }

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
      const response = await fetch(
        `${this.apiUrl}/api/r2/files/${roomId}/${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error(`파일 삭제 실패: ${response.status}`)
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
      const response = await fetch(
        `${this.apiUrl}/api/r2/files/${roomId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error(`전체 파일 삭제 실패: ${response.status}`)
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
      const response = await fetch(`${this.apiUrl}/api/r2/size/${roomId}`)

      if (!response.ok) {
        throw new Error(`룸 용량 조회 실패: ${response.status}`)
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
