import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useClipboard } from './useClipboard'

describe('useClipboard', () => {
  let clipboard

  beforeEach(() => {
    clipboard = useClipboard()

    // Clipboard API 모킹
    Object.defineProperty(global.navigator, 'clipboard', {
      value: {
        write: vi.fn().mockResolvedValue(undefined),
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      writable: true,
      configurable: true
    })

    global.fetch = vi.fn()
  })

  describe('텍스트 복사', () => {
    it('텍스트를 클립보드에 복사할 수 있어야 한다', async () => {
      const text = 'ABC123'

      await clipboard.copyText(text)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text)
    })
  })

  describe('이미지 복사', () => {
    it('이미지를 클립보드에 복사할 수 있어야 한다', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' })

      global.fetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob)
      })

      await clipboard.copyImage('https://example.com/image.png')

      expect(fetch).toHaveBeenCalledWith('https://example.com/image.png')
      expect(navigator.clipboard.write).toHaveBeenCalled()
    })

    it('이미지 복사 실패시 에러를 처리해야 한다', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      const result = await clipboard.copyImage('https://example.com/image.png')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('클립보드 붙여넣기', () => {
    it('붙여넣기 이벤트에서 이미지를 추출할 수 있어야 한다', () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' })

      const mockEvent = {
        clipboardData: {
          items: [
            {
              type: 'image/png',
              getAsFile: () => mockFile
            }
          ]
        }
      }

      const files = clipboard.extractFilesFromPaste(mockEvent)

      expect(files.length).toBe(1)
      expect(files[0]).toBe(mockFile)
    })

    it('붙여넣기 이벤트에서 모든 파일 형식을 추출할 수 있어야 한다', () => {
      const mockImageFile = new File(['image'], 'test.png', { type: 'image/png' })
      const mockPdfFile = new File(['pdf'], 'test.pdf', { type: 'application/pdf' })

      const mockEvent = {
        clipboardData: {
          items: [
            {
              type: 'image/png',
              getAsFile: () => mockImageFile
            },
            {
              type: 'application/pdf',
              getAsFile: () => mockPdfFile
            }
          ]
        }
      }

      const files = clipboard.extractFilesFromPaste(mockEvent)

      expect(files.length).toBe(2)
      expect(files[0]).toBe(mockImageFile)
      expect(files[1]).toBe(mockPdfFile)
    })

    it('파일이 아닌 항목(텍스트)은 무시해야 한다', () => {
      const mockEvent = {
        clipboardData: {
          items: [
            {
              type: 'text/plain',
              getAsFile: () => null
            }
          ]
        }
      }

      const files = clipboard.extractFilesFromPaste(mockEvent)

      expect(files.length).toBe(0)
    })

    it('clipboardData가 없으면 빈 배열을 반환해야 한다', () => {
      const mockEvent = {}

      const files = clipboard.extractFilesFromPaste(mockEvent)

      expect(files.length).toBe(0)
    })
  })
})
