import { describe, it, expect, beforeEach } from 'vitest'
import { useFileManager } from './useFileManager'

/**
 * 통합 테스트 - 실제 백엔드 API 호출
 *
 * 이 테스트는 실제로 떠 있는 백엔드(기본 http://localhost:3001, VITE_API_URL로 변경 가능)에
 * HTTP 요청을 보내며, 업로드는 백엔드에 설정된 R2 버킷으로 실제 전송된다.
 * 백엔드가 없으면 NetworkError로 실패하므로 기본 `npm test`에서는 건너뛰고,
 * RUN_INTEGRATION 환경 변수가 설정된 경우에만 실행된다.
 *
 *   (backend/ 에서 `npm run dev`로 백엔드를 띄운 뒤, frontend/ 에서)
 *   RUN_INTEGRATION=1 npx vitest run src/composables/useFileManager.integration.test.js
 *
 * 자세한 내용은 README.md의 "통합 테스트" 항목 참고.
 */
describe.skipIf(!process.env.RUN_INTEGRATION)('useFileManager Integration Tests', () => {
  let fileManager

  beforeEach(() => {
    fileManager = useFileManager()
  })

  describe('실제 Supabase 연동', () => {
    it('빈 룸의 파일 목록을 가져올 수 있어야 한다', async () => {
      const testRoomId = 'TEST' + Date.now()

      await fileManager.loadFiles(testRoomId)

      // 새로운 룸이므로 파일이 없어야 함
      expect(fileManager.files.value).toEqual([])
      expect(fileManager.error.value).toBeNull()
    }, 10000)

    it('파일 업로드 후 목록에 나타나야 한다', async () => {
      const testRoomId = 'UPLOAD' + Date.now()
      const mockFile = new File(['test content'], 'test.png', { type: 'image/png' })

      // 파일 업로드
      await fileManager.uploadFile(testRoomId, mockFile)

      // 파일 목록 로드
      await fileManager.loadFiles(testRoomId)

      // 업로드한 파일이 목록에 있어야 함
      expect(fileManager.files.value.length).toBeGreaterThan(0)
      expect(fileManager.files.value[0].url).toContain(testRoomId)
    }, 15000)

    it('존재하지 않는 룸의 파일 목록은 빈 배열이어야 한다', async () => {
      const nonExistentRoom = 'NONEXIST' + Date.now()

      await fileManager.loadFiles(nonExistentRoom)

      expect(fileManager.files.value).toEqual([])
      expect(fileManager.isLoading.value).toBe(false)
    }, 10000)

    it('여러 파일을 업로드하면 모두 목록에 나타나야 한다', async () => {
      const testRoomId = 'MULTI' + Date.now()

      // 3개 파일 업로드
      for (let i = 0; i < 3; i++) {
        const file = new File([`test ${i}`], `test${i}.png`, { type: 'image/png' })
        await fileManager.uploadFile(testRoomId, file)
      }

      // 파일 목록 로드
      await fileManager.loadFiles(testRoomId)

      // 3개 파일이 모두 있어야 함
      expect(fileManager.files.value.length).toBe(3)
    }, 20000)
  })

  describe('API 응답 형식 검증', () => {
    it('파일 객체는 필수 속성을 가져야 한다', async () => {
      const testRoomId = 'PROPS' + Date.now()
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' })

      await fileManager.uploadFile(testRoomId, mockFile)
      await fileManager.loadFiles(testRoomId)

      if (fileManager.files.value.length > 0) {
        const file = fileManager.files.value[0]

        expect(file).toHaveProperty('name')
        expect(file).toHaveProperty('url')
        expect(file).toHaveProperty('created')

        expect(typeof file.name).toBe('string')
        expect(typeof file.url).toBe('string')
        expect(file.url).toContain('https://')
      }
    }, 15000)
  })
})
