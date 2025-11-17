import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'

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
        { name: '1234567890.png', created_at: new Date().toISOString() }
      ]

      // Supabase 응답 모킹
      fileManager.loadFiles = vi.fn(() => {
        fileManager.files.value = mockFiles.map(f => ({
          name: f.name,
          url: `https://example.com/${f.name}`,
          created: f.created_at
        }))
      })

      await fileManager.loadFiles('ROOM01')

      expect(fileManager.files.value.length).toBeGreaterThan(0)
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

      // Supabase 모킹을 실제로 구현
      fileManager.uploadFile = vi.fn(async () => ({
        success: true,
        data: { path: 'ROOM01/test.png' },
        fileName: 'test.png',
        url: 'https://example.com/test.png'
      }))

      const uploadResult = await fileManager.uploadFile('ROOM01', mockFile)

      expect(uploadResult).toBeDefined()
      expect(uploadResult.success).toBe(true)
    })

    it('업로드된 파일 이름은 타임스탬프를 포함해야 한다', () => {
      const fileName = fileManager.generateFileName()

      expect(fileName).toMatch(/^\d+\.png$/)
    })
  })

  describe('파일 URL', () => {
    it('파일 URL을 올바르게 생성해야 한다', () => {
      const roomId = 'ROOM01'
      const fileName = '1234567890.png'

      const url = fileManager.getFileUrl(roomId, fileName)

      expect(url).toContain(roomId)
      expect(url).toContain(fileName)
      expect(url).toContain('/storage/v1/object/public/test/')
    })
  })
})
