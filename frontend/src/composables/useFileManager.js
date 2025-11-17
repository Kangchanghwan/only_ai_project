import { ref } from 'vue'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export function useFileManager() {
  const files = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  /**
   * 타임스탬프 기반 파일명 생성
   */
  function generateFileName() {
    return `${Date.now()}.png`
  }

  /**
   * 파일 URL 생성
   */
  function getFileUrl(roomId, fileName) {
    return `${SUPABASE_URL}/storage/v1/object/public/test/${roomId}/${fileName}`
  }

  /**
   * 파일 목록 로드
   */
  async function loadFiles(roomId) {
    if (!roomId) {
      console.warn('roomId가 없습니다')
      return
    }

    isLoading.value = true
    error.value = null

    try {
      console.log('파일 로딩 시작:', roomId)

      // Supabase Storage list API
      // list(path, options) - path는 폴더 경로
      const { data, error: loadError } = await supabase.storage
        .from('test')
        .list(roomId, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        })

      console.log('Supabase 응답:', { data, error: loadError, roomId })

      if (loadError) {
        console.error('파일 로드 오류:', loadError)
        error.value = loadError
        return
      }

      if (data) {
        const filteredFiles = data
          .filter(file => {
            // 폴더와 플레이스홀더 제외
            return file.name !== '.emptyFolderPlaceholder' &&
                   file.id !== null &&
                   !file.name.endsWith('/')
          })

        console.log('필터 전:', data.length, '필터 후:', filteredFiles.length)

        files.value = filteredFiles.map(file => ({
          name: file.name,
          url: getFileUrl(roomId, file.name),
          created: file.created_at
        }))

        console.log('파일 로드 완료:', files.value.length, '개')
        console.log('파일 목록:', files.value)
      } else {
        console.warn('data가 null입니다')
        files.value = []
      }
    } catch (err) {
      console.error('파일 로드 예외:', err)
      error.value = err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 파일 업로드
   */
  async function uploadFile(roomId, file) {
    if (!roomId || !file) {
      throw new Error('roomId와 file이 필요합니다')
    }

    const fileName = generateFileName()

    try {
      console.log('파일 업로드 시작:', fileName)

      const { data, error: uploadError } = await supabase.storage
        .from('test')
        .upload(`${roomId}/${fileName}`, file, {
          contentType: file.type,
          upsert: false
        })

      if (uploadError) {
        console.error('업로드 오류:', uploadError)
        throw uploadError
      }

      console.log('업로드 성공:', data)
      return {
        success: true,
        data,
        fileName,
        url: getFileUrl(roomId, fileName)
      }
    } catch (err) {
      console.error('업로드 예외:', err)
      throw err
    }
  }

  /**
   * 파일 목록 초기화
   */
  function clearFiles() {
    files.value = []
  }

  return {
    files,
    isLoading,
    error,
    generateFileName,
    getFileUrl,
    loadFiles,
    uploadFile,
    clearFiles
  }
}
