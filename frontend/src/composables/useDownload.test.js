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

      // fetch mock 설정
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      await download.downloadFile(file)

      expect(global.fetch).toHaveBeenCalledWith(file.url)
      expect(mockLink.download).toBe(file.name)
      expect(mockLink.click).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
    })

    it('다운로드 실패시 에러를 반환해야 한다', async () => {
      const file = {
        name: 'test.png',
        url: 'invalid-url'
      }

      // fetch가 실패하도록 설정
      global.fetch.mockRejectedValue(new Error('Network error'))

      const result = await download.downloadFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
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

  describe('병렬 다운로드', () => {
    it('여러 파일을 병렬로 다운로드할 수 있어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' },
        { name: 'test3.jpg', url: 'https://example.com/test3.jpg' }
      ]

      // fetch mock 설정
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      const result = await download.downloadParallel(files)

      expect(result.success).toBe(true)
      expect(result.successCount).toBe(3)
      expect(result.failCount).toBe(0)
      expect(result.total).toBe(3)
      // 각 파일마다 개별 다운로드가 트리거되어야 함
      expect(mockLink.click).toHaveBeenCalledTimes(3)
    })

    it('단일 파일도 병렬 다운로드할 수 있어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' }
      ]

      // fetch mock 설정
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      const result = await download.downloadParallel(files)

      expect(result.success).toBe(true)
      expect(result.successCount).toBe(1)
      expect(result.failCount).toBe(0)
      expect(mockLink.click).toHaveBeenCalledTimes(1)
    })

    it('일부 파일이 실패해도 나머지는 다운로드되어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' },
        { name: 'test3.jpg', url: 'https://example.com/test3.jpg' }
      ]

      let callCount = 0
      // 두 번째 fetch만 실패하도록 설정
      global.fetch.mockImplementation((url) => {
        callCount++
        if (callCount === 2) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
        })
      })

      const result = await download.downloadParallel(files)

      expect(result.success).toBe(true) // 일부라도 성공하면 true
      expect(result.successCount).toBe(2)
      expect(result.failCount).toBe(1)
      expect(result.total).toBe(3)
      expect(result.errors).toHaveLength(1)
    })

    it('모든 파일이 실패하면 success가 false여야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' }
      ]

      mockLink.click = vi.fn(() => {
        throw new Error('Download failed')
      })

      const result = await download.downloadParallel(files)

      expect(result.success).toBe(false)
      expect(result.successCount).toBe(0)
      expect(result.failCount).toBe(2)
      expect(result.errors).toHaveLength(2)
    })

    it('빈 파일 배열로 병렬 다운로드 시도시 에러를 반환해야 한다', async () => {
      const result = await download.downloadParallel([])

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('파일')
    })

    it('null이나 undefined를 전달하면 에러를 반환해야 한다', async () => {
      const result1 = await download.downloadParallel(null)
      const result2 = await download.downloadParallel(undefined)

      expect(result1.success).toBe(false)
      expect(result2.success).toBe(false)
    })

    it('다운로드가 병렬로 실행되어야 한다', async () => {
      const files = [
        { name: 'test1.png', url: 'https://example.com/test1.png' },
        { name: 'test2.pdf', url: 'https://example.com/test2.pdf' }
      ]

      // fetch mock 설정
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      const startTime = Date.now()
      const clickTimes = []

      mockLink.click = vi.fn(() => {
        clickTimes.push(Date.now() - startTime)
      })

      await download.downloadParallel(files)

      // 병렬 실행이므로 모든 click이 거의 동시에 발생해야 함
      // (순차 실행이라면 시간 차이가 있을 것)
      expect(clickTimes.length).toBe(2)
      const timeDiff = Math.abs(clickTimes[1] - clickTimes[0])
      // 병렬이므로 시간 차이가 작아야 함 (100ms 이내)
      expect(timeDiff).toBeLessThan(100)
    })
  })
})
