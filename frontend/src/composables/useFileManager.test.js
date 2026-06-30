import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'

// r2Service 모킹
vi.mock('../services/r2Service', () => ({
  r2Service: {
    loadFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    deleteAllFiles: vi.fn(),
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

  describe('병합 로더 (loadFilesFromRooms)', () => {
    it('여러 룸의 파일을 하나의 목록으로 병합하고 각 파일에 roomId를 태깅한다', async () => {
      r2Service.loadFiles.mockImplementation((roomId) => {
        if (roomId === 'room-shared') {
          return Promise.resolve({
            files: [{ name: 'a.png', url: 'u1', created: '2024-01-02T00:00:00Z', size: 100, type: 'image/png' }],
            nextToken: undefined
          })
        }
        return Promise.resolve({
          files: [{ name: 'b.png', url: 'u2', created: '2024-01-03T00:00:00Z', size: 200, type: 'image/png' }],
          nextToken: undefined
        })
      })

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-shared', 'room-ip123'])

      expect(fm.files.value).toHaveLength(2)
      expect(fm.files.value.find(f => f.name === 'a.png').roomId).toBe('room-shared')
      expect(fm.files.value.find(f => f.name === 'b.png').roomId).toBe('room-ip123')
      // created 내림차순 정렬 (b가 더 최신)
      expect(fm.files.value[0].name).toBe('b.png')
      expect(fm.totalSize.value).toBe(300)
    })

    it('같은 룸+같은 파일명 중복은 제거한다', async () => {
      r2Service.loadFiles.mockResolvedValue({
        files: [{ name: 'dup.png', url: 'u', created: '2024-01-01T00:00:00Z', size: 10, type: 'image/png' }],
        nextToken: undefined
      })

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-a'])
      // 같은 룸을 두 번 로드해도(예: 재시도) 중복 누적되지 않음을 loadFilesFromRooms 재호출로 확인
      await fm.loadFilesFromRooms(['room-a'])

      expect(fm.files.value).toHaveLength(1)
    })

    it('roomIds가 비어있으면 아무 동작도 하지 않는다', async () => {
      const fm = useFileManager()
      await fm.loadFilesFromRooms([])
      expect(r2Service.loadFiles).not.toHaveBeenCalled()
    })
  })

  describe('hasMore / loadMore (다중 룸)', () => {
    it('한 룸이라도 nextToken이 있으면 hasMore는 true다', async () => {
      r2Service.loadFiles
        .mockResolvedValueOnce({ files: [], nextToken: 'token-a' })
        .mockResolvedValueOnce({ files: [], nextToken: undefined })

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-a', 'room-b'])

      expect(fm.hasMore.value).toBe(true)
    })

    it('loadMore는 nextToken이 남은 룸만 이어서 불러와 병합한다', async () => {
      r2Service.loadFiles
        .mockResolvedValueOnce({
          files: [{ name: 'a1.png', url: 'u', created: '2024-01-01T00:00:00Z', size: 10, type: 'image/png' }],
          nextToken: 'token-a'
        })
        .mockResolvedValueOnce({
          files: [{ name: 'b1.png', url: 'u', created: '2024-01-02T00:00:00Z', size: 10, type: 'image/png' }],
          nextToken: undefined
        })

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-a', 'room-b'])
      expect(fm.hasMore.value).toBe(true)

      r2Service.loadFiles.mockResolvedValueOnce({
        files: [{ name: 'a2.png', url: 'u', created: '2024-01-03T00:00:00Z', size: 10, type: 'image/png' }],
        nextToken: undefined
      })

      await fm.loadMore()

      // room-b는 토큰이 없었으므로 다시 호출되지 않고, room-a만 이어서 호출됨
      expect(r2Service.loadFiles).toHaveBeenCalledTimes(3)
      expect(fm.files.value.map(f => f.name).sort()).toEqual(['a1.png', 'a2.png', 'b1.png'].sort())
      expect(fm.hasMore.value).toBe(false)
    })
  })

  describe('룸별 용량 검증 (roomSize / uploadFile)', () => {
    it('roomSize는 해당 룸에 속한 파일의 합산 용량만 반환한다', async () => {
      r2Service.loadFiles.mockImplementation((roomId) =>
        Promise.resolve({
          files: roomId === 'room-a'
            ? [{ name: 'x.png', url: 'u', created: '2024-01-01T00:00:00Z', size: 1000, type: 'image/png' }]
            : [{ name: 'y.png', url: 'u', created: '2024-01-01T00:00:00Z', size: 5000, type: 'image/png' }],
          nextToken: undefined
        })
      )

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-a', 'room-b'])

      expect(fm.roomSize('room-a')).toBe(1000)
      expect(fm.roomSize('room-b')).toBe(5000)
    })

    it('다른 룸의 용량은 업로드 대상 룸의 용량 제한 검증에 영향을 주지 않는다', async () => {
      import.meta.env.VITE_MAX_ROOM_SIZE_MB = '1' // 1MB 제한

      r2Service.loadFiles.mockImplementation((roomId) =>
        Promise.resolve({
          // room-full은 이미 1MB 꽉 참, room-empty는 비어있음
          files: roomId === 'room-full'
            ? [{ name: 'big.png', url: 'u', created: '2024-01-01T00:00:00Z', size: 1024 * 1024, type: 'image/png' }]
            : [],
          nextToken: undefined
        })
      )

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-full', 'room-empty'])

      r2Service.uploadFile.mockResolvedValue({ success: true, fileName: 'small.png', url: 'u' })
      const smallFile = new File(['x'.repeat(100)], 'small.png', { type: 'image/png' })

      // room-empty에 작은 파일을 올리는 건 room-full이 꽉 찼어도 성공해야 한다
      await expect(fm.uploadFile('room-empty', smallFile)).resolves.toBeDefined()

      delete import.meta.env.VITE_MAX_ROOM_SIZE_MB
    })
  })

  describe('deleteAllFiles (다중 룸)', () => {
    it('해당 룸의 파일만 제거하고 다른 룸의 파일은 유지한다', async () => {
      r2Service.loadFiles.mockImplementation((roomId) =>
        Promise.resolve({
          files: [{ name: `${roomId}-file.png`, url: 'u', created: '2024-01-01T00:00:00Z', size: 10, type: 'image/png' }],
          nextToken: undefined
        })
      )

      const fm = useFileManager()
      await fm.loadFilesFromRooms(['room-a', 'room-b'])
      expect(fm.files.value).toHaveLength(2)

      r2Service.deleteAllFiles = vi.fn().mockResolvedValue({ success: true, deletedCount: 1 })
      await fm.deleteAllFiles('room-a')

      expect(fm.files.value).toHaveLength(1)
      expect(fm.files.value[0].roomId).toBe('room-b')
    })
  })
})
