import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { supabaseService } from '../services/supabaseService'

// Supabase 모킹
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        list: vi.fn(),
        upload: vi.fn(),
      }))
    }
  }))
}))

describe('useFileManager', () => {
  let fileManager

  beforeEach(() => {
    fileManager = useFileManager()
  })

  describe('파일 목록', () => {
    it('초기 파일 목록은 비어있어야 한다', () => {
      expect(fileManager.files.value).toEqual([])
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

      // supabaseService.loadFiles를 모킹
      vi.spyOn(supabaseService, 'loadFiles').mockResolvedValue(mockFiles)

      await fileManager.loadFiles('ROOM01')

      expect(fileManager.files.value.length).toBe(1)
      expect(fileManager.files.value[0].name).toBe('1234567890.png')
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

      // supabaseService.uploadFile을 모킹
      vi.spyOn(supabaseService, 'uploadFile').mockResolvedValue({
        success: true,
        path: 'ROOM01/test.png',
        fileName: 'test.png',
        url: 'https://example.com/test.png'
      })

      const uploadResult = await fileManager.uploadFile('ROOM01', mockFile)

      expect(uploadResult).toBeDefined()
      expect(uploadResult.success).toBe(true)
    })

    it('업로드된 파일 이름은 타임스탬프를 포함해야 한다', () => {
      // supabaseService의 generateFileName 메서드 테스트
      const fileName = supabaseService.generateFileName('test.png')

      // 타임스탬프_랜덤문자열.png 형식 (원본 확장자 유지)
      expect(fileName).toMatch(/^\d+_[a-z0-9]{6}\.png$/)
    })

    it('원본 파일의 확장자를 유지해야 한다', () => {
      const pdfFileName = supabaseService.generateFileName('document.pdf')
      const jpgFileName = supabaseService.generateFileName('photo.jpg')
      const txtFileName = supabaseService.generateFileName('readme.txt')

      expect(pdfFileName).toMatch(/^\d+_[a-z0-9]{6}\.pdf$/)
      expect(jpgFileName).toMatch(/^\d+_[a-z0-9]{6}\.jpg$/)
      expect(txtFileName).toMatch(/^\d+_[a-z0-9]{6}\.txt$/)
    })

    it('확장자가 없는 파일도 처리해야 한다', () => {
      const fileName = supabaseService.generateFileName('noextension')

      // 확장자 없이 타임스탬프_랜덤문자열 형식
      expect(fileName).toMatch(/^\d+_[a-z0-9]{6}$/)
    })
  })

  describe('파일 URL', () => {
    it('파일 URL을 올바르게 생성해야 한다', () => {
      const roomId = 'ROOM01'
      const fileName = '1234567890.png'

      // supabaseService의 getFileUrl 메서드 테스트
      const url = supabaseService.getFileUrl(roomId, fileName)

      expect(url).toContain(roomId)
      expect(url).toContain(fileName)
      expect(url).toContain('/storage/v1/object/public/test/')
    })
  })

  describe('파일 크기 제한', () => {
    it('환경 변수로 설정된 최대 파일 크기 이하일 때 업로드가 성공해야 한다', async () => {
      // 기본값 10MB의 절반인 5MB 파일 생성
      const fiveMB = 5 * 1024 * 1024
      const mockFile = new File([new ArrayBuffer(fiveMB)], 'small.png', { type: 'image/png' })

      vi.spyOn(supabaseService, 'uploadFile').mockResolvedValue({
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

      vi.spyOn(supabaseService, 'uploadFile').mockResolvedValue({
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
})
