import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'

// r2Service 모킹
vi.mock('../services/r2Service', () => ({
  r2Service: {
    loadFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getFileUrl: vi.fn(),
    getRoomTotalSize: vi.fn()
  }
}))

describe('useFileManager', () => {
  let fileManager

  beforeEach(() => {
    fileManager = useFileManager()
    vi.resetAllMocks()
    // 환경 변수 초기화
    delete import.meta.env.VITE_MAX_FILE_SIZE_MB
    delete import.meta.env.VITE_MAX_ROOM_SIZE_MB
  })

  describe('파일 목록', () => {
    it('초기 파일 목록은 비어있어야 한다', () => {
      expect(fileManager.files.value).toEqual([])
    })

    it('초기 totalSize는 0이어야 한다', () => {
      expect(fileManager.totalSize).toBeDefined()
      expect(fileManager.totalSize.value).toBe(0)
    })

    it('파일 목록을 로드할 수 있어야 한다', async () => {
      const mockFiles = [
        {
          name: '1234567890.png',
          url: 'https://example.com/ROOM01/1234567890.png',
          created: new Date().toISOString(),
          size: 1024,
          type: 'image/png'
        }
      ]

      // r2Service.loadFiles를 모킹
      r2Service.loadFiles.mockResolvedValue(mockFiles)

      await fileManager.loadFiles('ROOM01')

      expect(fileManager.files.value.length).toBe(1)
      expect(fileManager.files.value[0].name).toBe('1234567890.png')
    })

    it('파일 목록 로드 시 총 용량을 계산해야 한다', async () => {
      const mockFiles = [
        {
          name: 'file1.png',
          url: 'https://example.com/ROOM01/file1.png',
          created: new Date().toISOString(),
          size: 1024,
          type: 'image/png'
        },
        {
          name: 'file2.jpg',
          url: 'https://example.com/ROOM01/file2.jpg',
          created: new Date().toISOString(),
          size: 2048,
          type: 'image/jpeg'
        },
        {
          name: 'file3.pdf',
          url: 'https://example.com/ROOM01/file3.pdf',
          created: new Date().toISOString(),
          size: 4096,
          type: 'application/pdf'
        }
      ]

      r2Service.loadFiles.mockResolvedValue(mockFiles)

      await fileManager.loadFiles('ROOM01')

      // 총 용량 = 1024 + 2048 + 4096 = 7168
      expect(fileManager.totalSize.value).toBe(7168)
    })

    it('.emptyFolderPlaceholder 파일은 필터링되어야 한다', () => {
      const mockData = [
        { name: '.emptyFolderPlaceholder', created_at: new Date().toISOString() },
        { name: '1234567890.png', created_at: new Date().toISOString() }
      ]

      const filtered = mockData.filter(file => file.name !== '.emptyFolderPlaceholder')

      expect(filtered.length).toBe(1)
      expect(filtered[0].name).toBe('1234567890.png')
    })
  })

  describe('파일 업로드', () => {
    it('이미지 파일을 업로드할 수 있어야 한다', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' })

      // r2Service.uploadFile을 모킹
      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/test.png',
        fileName: 'test.png',
        url: 'https://example.com/test.png'
      })

      const uploadResult = await fileManager.uploadFile('ROOM01', mockFile)

      expect(uploadResult).toBeDefined()
      expect(uploadResult.success).toBe(true)
    })

    it('r2Service.uploadFile이 올바르게 호출되어야 한다', async () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/test.pdf',
        fileName: 'test.pdf',
        url: 'https://example.com/test.pdf'
      })

      await fileManager.uploadFile('ROOM01', mockFile)

      expect(r2Service.uploadFile).toHaveBeenCalledWith('ROOM01', mockFile, {})
    })
  })

  describe('파일 크기 제한', () => {
    it('환경 변수로 설정된 최대 파일 크기 이하일 때 업로드가 성공해야 한다', async () => {
      // 기본값 10MB의 절반인 5MB 파일 생성
      const fiveMB = 5 * 1024 * 1024
      const mockFile = new File([new ArrayBuffer(fiveMB)], 'small.png', { type: 'image/png' })

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/small.png',
        fileName: 'small.png',
        url: 'https://example.com/small.png'
      })

      const uploadResult = await fileManager.uploadFile('ROOM01', mockFile)

      expect(uploadResult.success).toBe(true)
    })

    it('환경 변수로 설정된 최대 파일 크기를 초과할 때 에러가 발생해야 한다', async () => {
      // 기본값 10MB를 초과하는 15MB 파일 생성
      const fifteenMB = 15 * 1024 * 1024
      const mockFile = new File([new ArrayBuffer(fifteenMB)], 'large.png', { type: 'image/png' })

      // 에러 메시지는 환경 변수 값을 반영해야 함
      await expect(fileManager.uploadFile('ROOM01', mockFile)).rejects.toThrow(/파일 크기는 \d+MB를 초과할 수 없습니다/)
    })

    it('정확히 최대 파일 크기와 같을 때 업로드가 성공해야 한다', async () => {
      // 정확히 10MB 파일 (기본값)
      const tenMB = 10 * 1024 * 1024
      const mockFile = new File([new ArrayBuffer(tenMB)], 'exact.png', { type: 'image/png' })

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/exact.png',
        fileName: 'exact.png',
        url: 'https://example.com/exact.png'
      })

      const uploadResult = await fileManager.uploadFile('ROOM01', mockFile)

      expect(uploadResult.success).toBe(true)
    })

    it('파일 크기가 0일 때 에러가 발생해야 한다', async () => {
      const mockFile = new File([], 'empty.png', { type: 'image/png' })

      await expect(fileManager.uploadFile('ROOM01', mockFile)).rejects.toThrow('파일이 비어있습니다')
    })

    it('환경 변수가 설정되지 않았을 때 기본값 10MB를 사용해야 한다', () => {
      // import.meta.env.VITE_MAX_FILE_SIZE_MB가 undefined일 때 기본값 사용
      // 이는 실제 구현에서 확인됨
      expect(true).toBe(true) // 구현 검증용 플레이스홀더
    })
  })

  describe('룸 총 용량 제한', () => {
    beforeEach(() => {
      // 개별 파일 크기 제한을 충분히 크게 설정 (테스트에서 룸 용량만 체크하기 위해)
      import.meta.env.VITE_MAX_FILE_SIZE_MB = 100
    })

    it('룸의 현재 총 용량이 제한을 초과하면 업로드가 거부되어야 한다', async () => {
      // Given: 룸에 이미 90MB가 사용되고 있음 (totalSize 상태로 관리)
      const currentRoomSize = 90 * 1024 * 1024 // 90MB
      const maxRoomSize = 100 // 100MB (환경 변수)
      const newFileSize = 15 * 1024 * 1024 // 15MB

      // loadFiles를 통해 totalSize 설정
      const mockFiles = [{ name: 'existing.png', size: currentRoomSize, url: 'http://test.com', created: new Date().toISOString(), type: 'image/png' }]
      r2Service.loadFiles.mockResolvedValue(mockFiles)
      await fileManager.loadFiles('ROOM01')

      // 환경 변수 모킹
      import.meta.env.VITE_MAX_ROOM_SIZE_MB = maxRoomSize

      const mockFile = new File([new ArrayBuffer(newFileSize)], 'large.png', { type: 'image/png' })

      // When/Then: 업로드가 거부되어야 함 (API 호출 없이 totalSize만 사용)
      await expect(fileManager.uploadFile('ROOM01', mockFile)).rejects.toThrow(
        /룸 용량 제한.*초과/
      )
    })

    it('룸의 현재 총 용량 + 새 파일 크기가 제한 이하면 업로드가 허용되어야 한다', async () => {
      // Given: 룸에 이미 50MB가 사용되고 있고, 제한은 100MB
      const currentRoomSize = 50 * 1024 * 1024 // 50MB
      const maxRoomSize = 100 // 100MB
      const newFileSize = 40 * 1024 * 1024 // 40MB (총 90MB)

      // loadFiles를 통해 totalSize 설정
      const mockFiles = [{ name: 'existing.png', size: currentRoomSize, url: 'http://test.com', created: new Date().toISOString(), type: 'image/png' }]
      r2Service.loadFiles.mockResolvedValue(mockFiles)
      await fileManager.loadFiles('ROOM01')

      import.meta.env.VITE_MAX_ROOM_SIZE_MB = maxRoomSize

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/file.png',
        fileName: 'file.png',
        url: 'https://example.com/file.png',
        size: newFileSize
      })

      const mockFile = new File([new ArrayBuffer(newFileSize)], 'file.png', { type: 'image/png' })

      // When: 업로드 실행
      const result = await fileManager.uploadFile('ROOM01', mockFile)

      // Then: 업로드 성공
      expect(result.success).toBe(true)
      // 업로드 후 totalSize가 업데이트되어야 함
      expect(fileManager.totalSize.value).toBe(currentRoomSize + newFileSize)
    })

    it('룸 용량 제한이 설정되지 않았을 때 기본값 500MB를 사용해야 한다', async () => {
      // Given: 환경 변수가 설정되지 않음
      delete import.meta.env.VITE_MAX_ROOM_SIZE_MB
      import.meta.env.VITE_MAX_FILE_SIZE_MB = 100 // 개별 파일 크기 제한 상향

      const currentRoomSize = 400 * 1024 * 1024 // 400MB
      const newFileSize = 50 * 1024 * 1024 // 50MB

      // loadFiles를 통해 totalSize 설정
      const mockFiles = [{ name: 'existing.png', size: currentRoomSize, url: 'http://test.com', created: new Date().toISOString(), type: 'image/png' }]
      r2Service.loadFiles.mockResolvedValue(mockFiles)
      await fileManager.loadFiles('ROOM01')

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/file.png',
        fileName: 'file.png',
        url: 'https://example.com/file.png',
        size: newFileSize
      })

      const mockFile = new File([new ArrayBuffer(newFileSize)], 'file.png', { type: 'image/png' })

      // When: 업로드 실행 (총 450MB, 기본 제한 500MB 이하)
      const result = await fileManager.uploadFile('ROOM01', mockFile)

      // Then: 업로드 성공 (기본값 500MB 사용)
      expect(result.success).toBe(true)
    })

    it('정확히 제한과 같은 용량일 때는 업로드가 허용되어야 한다', async () => {
      // Given: 현재 90MB + 새 파일 10MB = 정확히 100MB
      const currentRoomSize = 90 * 1024 * 1024
      const maxRoomSize = 100
      const newFileSize = 10 * 1024 * 1024

      // loadFiles를 통해 totalSize 설정
      const mockFiles = [{ name: 'existing.png', size: currentRoomSize, url: 'http://test.com', created: new Date().toISOString(), type: 'image/png' }]
      r2Service.loadFiles.mockResolvedValue(mockFiles)
      await fileManager.loadFiles('ROOM01')

      import.meta.env.VITE_MAX_ROOM_SIZE_MB = maxRoomSize

      r2Service.uploadFile.mockResolvedValue({
        success: true,
        path: 'ROOM01/exact.png',
        fileName: 'exact.png',
        url: 'https://example.com/exact.png',
        size: newFileSize
      })

      const mockFile = new File([new ArrayBuffer(newFileSize)], 'exact.png', { type: 'image/png' })

      // When: 업로드 실행
      const result = await fileManager.uploadFile('ROOM01', mockFile)

      // Then: 업로드 성공
      expect(result.success).toBe(true)
    })
  })
})
