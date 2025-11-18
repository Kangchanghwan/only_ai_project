import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDownload } from './useDownload'

describe('useDownload', () => {
  let download
  let mockLink
  let originalCreateElement

  beforeEach(() => {
    download = useDownload()

    // Mock document.createElement for <a> tag
    originalCreateElement = document.createElement
    mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
      style: {}
    }

    document.createElement = vi.fn((tagName) => {
      if (tagName === 'a') {
        return mockLink
      }
      return originalCreateElement.call(document, tagName)
    })

    document.body.appendChild = vi.fn()
    document.body.removeChild = vi.fn()

    // Mock fetch
    global.fetch = vi.fn()

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    document.createElement = originalCreateElement
    vi.restoreAllMocks()
  })

  describe('개별 파일 다운로드', () => {
    it('파일을 다운로드할 수 있어야 한다', async () => {
      const file = {
        name: 'test.png',
        url: 'https://example.com/test.png'
      }

      await download.downloadFile(file)

      expect(mockLink.href).toBe(file.url)
      expect(mockLink.download).toBe(file.name)
      expect(mockLink.click).toHaveBeenCalled()
    })

    it('다운로드 실패시 에러를 반환해야 한다', async () => {
      const file = {
        name: 'test.png',
        url: 'invalid-url'
      }

      // click이 에러를 던지도록 설정
      mockLink.click = vi.fn(() => {
        throw new Error('Download failed')
      })

      const result = await download.downloadFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('ZIP 다운로드', () => {
    it('여러 파일을 ZIP으로 다운로드할 수 있어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' }
      ]

      global.fetch.mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      const result = await download.downloadAsZip(files, 'my-files.zip')

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(mockLink.download).toBe('my-files.zip')
      expect(mockLink.click).toHaveBeenCalled()
    })

    it('ZIP 다운로드 실패시 에러를 반환해야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' }
      ]

      global.fetch.mockRejectedValue(new Error('Network error'))

      const result = await download.downloadAsZip(files, 'my-files.zip')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('빈 파일 배열로 ZIP 다운로드 시도시 에러를 반환해야 한다', async () => {
      const result = await download.downloadAsZip([], 'empty.zip')

      expect(result.success).toBe(false)
      expect(result.error.message).toContain('파일')
    })
  })

  describe('클립보드에 파일 저장', () => {
    it('선택한 파일들을 클립보드에 저장할 수 있어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' }
      ]

      const mockBlob = new Blob(['test'], { type: 'image/png' })
      global.fetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob)
      })

      // Mock clipboard API
      Object.defineProperty(global.navigator, 'clipboard', {
        value: {
          write: vi.fn().mockResolvedValue(undefined)
        },
        writable: true,
        configurable: true
      })

      const result = await download.copyFilesToClipboard(files)

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(files[0].url)
      expect(navigator.clipboard.write).toHaveBeenCalled()
    })

    it('여러 파일을 선택해도 첫 번째 파일만 클립보드에 저장되어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.jpg', url: 'https://example.com/test2.jpg' }
      ]

      const mockBlob = new Blob(['test'], { type: 'image/png' })
      global.fetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob)
      })

      Object.defineProperty(global.navigator, 'clipboard', {
        value: {
          write: vi.fn().mockResolvedValue(undefined)
        },
        writable: true,
        configurable: true
      })

      const result = await download.copyFilesToClipboard(files)

      expect(result.success).toBe(true)
      expect(result.copiedCount).toBe(1)
      expect(result.totalCount).toBe(2)
      // 첫 번째 파일만 fetch되어야 함
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(files[0].url)
    })

    it('클립보드 저장 실패시 에러를 반환해야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' }
      ]

      global.fetch.mockRejectedValue(new Error('Network error'))

      const result = await download.copyFilesToClipboard(files)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('빈 파일 배열로 클립보드 저장 시도시 에러를 반환해야 한다', async () => {
      const result = await download.copyFilesToClipboard([])

      expect(result.success).toBe(false)
      expect(result.error.message).toContain('파일')
    })
  })
})
