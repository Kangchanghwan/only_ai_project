import { createClient } from '@supabase/supabase-js'

/**
 * Supabase 서비스
 *
 * Supabase Storage와의 상호작용을 담당하는 싱글톤 서비스입니다.
 * Best Practice: 서비스 레이어로 분리하여 스토리지 로직을 중앙화
 */
class SupabaseService {
  constructor() {
    // 환경 변수에서 설정 가져오기
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    this.supabaseKey = import.meta.env.VITE_SUPABASE_KEY

    // 환경 변수 검증
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL과 Key는 환경 변수에 정의되어야 합니다')
    }

    // Supabase 클라이언트 초기화
    this.client = createClient(this.supabaseUrl, this.supabaseKey)

    // Storage 버킷 이름
    this.bucketName = 'test'
  }

  /**
   * 파일명을 생성합니다
   *
   * 타임스탬프를 기반으로 고유한 파일명을 생성합니다.
   * 원본 파일명에서 확장자를 추출하여 사용합니다.
   *
   * @param {string} originalFileName - 원본 파일명
   * @returns {string} 생성된 파일명
   */
  generateFileName(originalFileName) {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)

    // 원본 파일명에서 확장자 추출
    let extension = ''
    if (originalFileName && typeof originalFileName === 'string') {
      const lastDot = originalFileName.lastIndexOf('.')
      if (lastDot !== -1) {
        extension = originalFileName.slice(lastDot) // 점(.)을 포함한 확장자
      }
    }

    return `${timestamp}_${random}${extension}`
  }

  /**
   * 파일의 공개 URL을 생성합니다
   *
   * @param {string} roomId - 룸 ID
   * @param {string} fileName - 파일명
   * @returns {string} 파일의 공개 URL
   */
  getFileUrl(roomId, fileName) {
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${roomId}/${fileName}`
  }

  /**
   * 특정 룸의 파일 목록을 불러옵니다
   *
   * Best Practice:
   * - 구조화된 에러 처리
   * - 명확한 데이터 필터링
   * - 정렬 옵션 제공
   *
   * @param {string} roomId - 룸 ID
   * @param {Object} options - 옵션
   * @param {number} options.limit - 최대 파일 수 (기본값: 100)
   * @param {number} options.offset - 건너뛸 파일 수 (기본값: 0)
   * @param {string} options.sortBy - 정렬 기준 (기본값: 'created_at')
   * @param {string} options.order - 정렬 순서 (기본값: 'desc')
   * @returns {Promise<Array>} 파일 목록
   */
  async loadFiles(roomId, options = {}) {
    if (!roomId) {
      throw new Error('roomId는 필수입니다')
    }

    const {
      limit = 100,
      offset = 0,
      sortBy = 'created_at',
      order = 'desc'
    } = options

    console.log('[SupabaseService] 파일 로드 시작:', { roomId, limit, offset })

    try {
      // Supabase Storage에서 파일 목록 가져오기
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(roomId, {
          limit,
          offset,
          sortBy: { column: sortBy, order }
        })

      if (error) {
        console.error('[SupabaseService] 파일 로드 오류:', error)
        throw error
      }

      // 데이터가 없는 경우 빈 배열 반환
      if (!data) {
        console.warn('[SupabaseService] 반환된 데이터가 null입니다')
        return []
      }

      // 실제 파일만 필터링 (폴더 및 플레이스홀더 제외)
      const filteredFiles = data.filter(file => {
        return (
          file.name !== '.emptyFolderPlaceholder' &&
          file.id !== null &&
          !file.name.endsWith('/')
        )
      })

      console.log(`[SupabaseService] 파일 로드 완료: ${filteredFiles.length}개 (전체: ${data.length}개)`)

      // 파일 정보를 표준 형식으로 변환
      return filteredFiles.map(file => ({
        name: file.name,
        url: this.getFileUrl(roomId, file.name),
        created: file.created_at,
        size: file.metadata?.size || 0,
        type: file.metadata?.mimetype || 'unknown'
      }))
    } catch (error) {
      console.error('[SupabaseService] 파일 로드 예외:', error)
      throw error
    }
  }

  /**
   * 파일을 업로드합니다
   *
   * Best Practice:
   * - 파일 검증
   * - 명확한 에러 메시지
   * - upsert 옵션으로 중복 방지
   *
   * @param {string} roomId - 룸 ID
   * @param {File} file - 업로드할 파일
   * @param {Object} options - 옵션
   * @param {string} options.fileName - 사용자 정의 파일명 (선택)
   * @param {boolean} options.upsert - 기존 파일 덮어쓰기 여부 (기본값: false)
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

    const { fileName, upsert = false } = options

    // 파일명 생성 또는 사용자 정의 파일명 사용
    // 원본 파일명을 전달하여 확장자를 유지
    const finalFileName = fileName || this.generateFileName(file.name)
    const filePath = `${roomId}/${finalFileName}`

    console.log('[SupabaseService] 파일 업로드 시작:', { roomId, fileName: finalFileName, size: file.size })

    try {
      // Supabase Storage에 파일 업로드
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          contentType: file.type,
          upsert
        })

      if (error) {
        console.error('[SupabaseService] 업로드 오류:', error)
        throw error
      }

      console.log('[SupabaseService] 업로드 성공:', data)

      // 업로드 결과 반환
      return {
        success: true,
        path: data.path,
        fileName: finalFileName,
        url: this.getFileUrl(roomId, finalFileName),
        size: file.size,
        created: new Date().toISOString()
      }
    } catch (error) {
      console.error('[SupabaseService] 업로드 예외:', error)
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

    const filePath = `${roomId}/${fileName}`

    console.log('[SupabaseService] 파일 삭제 시작:', filePath)

    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        console.error('[SupabaseService] 삭제 오류:', error)
        throw error
      }

      console.log('[SupabaseService] 삭제 성공:', data)

      return {
        success: true,
        data
      }
    } catch (error) {
      console.error('[SupabaseService] 삭제 예외:', error)
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

    console.log('[SupabaseService] 룸 전체 파일 삭제 시작:', roomId)

    try {
      // 먼저 파일 목록을 가져옴
      const files = await this.loadFiles(roomId)

      if (files.length === 0) {
        console.log('[SupabaseService] 삭제할 파일이 없습니다')
        return { success: true, deletedCount: 0 }
      }

      // 파일 경로 목록 생성
      const filePaths = files.map(file => `${roomId}/${file.name}`)

      // 모든 파일 삭제
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .remove(filePaths)

      if (error) {
        console.error('[SupabaseService] 전체 삭제 오류:', error)
        throw error
      }

      console.log(`[SupabaseService] 전체 삭제 성공: ${files.length}개 파일`)

      return {
        success: true,
        deletedCount: files.length,
        data
      }
    } catch (error) {
      console.error('[SupabaseService] 전체 삭제 예외:', error)
      throw error
    }
  }
}

// 싱글톤 인스턴스 생성 및 export
export const supabaseService = new SupabaseService()
