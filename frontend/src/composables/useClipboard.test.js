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

      const files = clipboard.extractImagesFromPaste(mockEvent)

      expect(files.length).toBe(1)
      expect(files[0]).toBe(mockFile)
    })

    it('이미지가 아닌 항목은 무시해야 한다', () => {
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

      const files = clipboard.extractImagesFromPaste(mockEvent)

      expect(files.length).toBe(0)
    })
  })
})
