import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDownload } from './useDownload'
import { r2Service } from '../services/r2Service'

vi.mock('../services/r2Service', () => ({
  r2Service: {
    getDownloadUrl: vi.fn(),
    getDownloadUrls: vi.fn()
  }
}))

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

    // presigned URL 발급 mock 초기화 (기본: 실패 → Blob 폴백 경로)
    r2Service.getDownloadUrl.mockReset()
    r2Service.getDownloadUrls.mockReset()
    r2Service.getDownloadUrl.mockRejectedValue(new Error('no backend'))
    r2Service.getDownloadUrls.mockRejectedValue(new Error('no backend'))
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

    it('여러 파일은 브라우저가 놓치지 않도록 짧은 간격(250ms)으로 순차 트리거된다', async () => {
      vi.useFakeTimers()
      try {
        const files = [
          { name: 'test1.png', url: 'https://example.com/test1.png', roomId: 'room-x' },
          { name: 'test2.pdf', url: 'https://example.com/test2.pdf', roomId: 'room-x' }
        ]
        r2Service.getDownloadUrls.mockResolvedValue({
          'test1.png': 'https://r2/get/1',
          'test2.pdf': 'https://r2/get/2'
        })

        const run = download.downloadParallel(files)

        await vi.advanceTimersByTimeAsync(0)
        expect(mockLink.click).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(249)
        expect(mockLink.click).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1)
        expect(mockLink.click).toHaveBeenCalledTimes(2)

        const result = await run
        expect(result.successCount).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('네이티브 다운로드 (presigned URL)', () => {
    it('roomId가 있는 파일은 presigned URL로 <a> 클릭만 하고 파일 본문을 fetch하지 않는다', async () => {
      const file = { name: '사진.png', url: 'https://store/room-x/사진.png', roomId: 'room-x' }
      r2Service.getDownloadUrl.mockResolvedValue('https://r2/get/signed?response-content-disposition=attachment')

      const result = await download.downloadFile(file)

      expect(result.success).toBe(true)
      expect(r2Service.getDownloadUrl).toHaveBeenCalledWith('room-x', '사진.png')
      expect(mockLink.href).toBe('https://r2/get/signed?response-content-disposition=attachment')
      expect(mockLink.download).toBe('사진.png')
      expect(mockLink.click).toHaveBeenCalledTimes(1)
      expect(global.fetch).not.toHaveBeenCalled()
      expect(global.URL.createObjectURL).not.toHaveBeenCalled()
    })

    it('presigned URL 발급에 실패하면 기존 Blob 방식으로 폴백한다', async () => {
      const file = { name: 'test.png', url: 'https://example.com/test.png', roomId: 'room-x' }
      r2Service.getDownloadUrl.mockRejectedValue(new Error('404'))
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/png' }))
      })

      const result = await download.downloadFile(file)

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(file.url)
      expect(mockLink.href).toBe('blob:mock-url')
      expect(mockLink.click).toHaveBeenCalledTimes(1)
    })

    it('여러 파일은 룸별로 URL을 한 번에 발급받고 각각 네이티브로 트리거한다', async () => {
      const files = [
        { name: 'a.png', url: 'https://store/room-x/a.png', roomId: 'room-x' },
        { name: 'b.pdf', url: 'https://store/room-x/b.pdf', roomId: 'room-x' },
        { name: 'c.txt', url: 'https://store/room-y/c.txt', roomId: 'room-y' }
      ]
      r2Service.getDownloadUrls.mockImplementation(async (roomId, names) =>
        Object.fromEntries(names.map(n => [n, `https://r2/get/${roomId}/${n}`]))
      )

      const result = await download.downloadParallel(files)

      expect(result.successCount).toBe(3)
      expect(r2Service.getDownloadUrls).toHaveBeenCalledTimes(2)
      expect(r2Service.getDownloadUrls).toHaveBeenCalledWith('room-x', ['a.png', 'b.pdf'])
      expect(r2Service.getDownloadUrls).toHaveBeenCalledWith('room-y', ['c.txt'])
      expect(mockLink.click).toHaveBeenCalledTimes(3)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('배치 발급에 빠진 파일은 Blob 방식으로 폴백한다', async () => {
      const files = [
        { name: 'a.png', url: 'https://store/room-x/a.png', roomId: 'room-x' },
        { name: 'b.pdf', url: 'https://store/room-x/b.pdf', roomId: 'room-x' }
      ]
      r2Service.getDownloadUrls.mockResolvedValue({ 'a.png': 'https://r2/get/a' })
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'], { type: 'application/pdf' }))
      })

      const result = await download.downloadParallel(files)

      expect(result.successCount).toBe(2)
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith('https://store/room-x/b.pdf')
    })
  })
})
