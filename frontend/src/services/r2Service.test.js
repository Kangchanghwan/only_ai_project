import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { r2Service } from './r2Service'

describe('R2Service', () => {
  let mockXHR
  let mockFetch

  beforeEach(() => {
    // XMLHttpRequest 모킹
    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {
        addEventListener: vi.fn()
      },
      addEventListener: vi.fn(),
      readyState: 4,
      status: 200,
      responseText: JSON.stringify({ success: true })
    }

    // 생성자 함수로 모킹
    const MockXHR = function() {
      return mockXHR
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR)

    // fetch 모킹
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('uploadFile with onProgress', () => {
    it('onProgress 콜백이 전달되면 호출되어야 한다', async () => {
      const onProgress = vi.fn()
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

      // Presigned URL 응답 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          uploadUrl: 'https://r2.example.com/upload',
          fileUrl: 'https://r2.example.com/file',
          fileName: 'test.txt'
        })
      })

      // XMLHttpRequest progress 시뮬레이션을 위한 설정
      mockXHR.send.mockImplementation(() => {
        // progress 이벤트 핸들러 찾기
        const progressCall = mockXHR.upload.addEventListener.mock.calls.find(
          call => call[0] === 'progress'
        )
        if (progressCall) {
          const progressHandler = progressCall[1]
          // 진행률 이벤트 발생
          progressHandler({ lengthComputable: true, loaded: 50, total: 100 })
          progressHandler({ lengthComputable: true, loaded: 100, total: 100 })
        }

        // load 이벤트 핸들러 찾기
        const loadCall = mockXHR.addEventListener.mock.calls.find(
          call => call[0] === 'load'
        )
        if (loadCall) {
          loadCall[1]()
        }
      })

      await r2Service.uploadFile('ROOM01', file, { onProgress })

      expect(onProgress).toHaveBeenCalledWith(50)
      expect(onProgress).toHaveBeenCalledWith(100)
    })

    it('onProgress가 없어도 업로드가 정상 동작해야 한다', async () => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

      // Presigned URL 응답 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          uploadUrl: 'https://r2.example.com/upload',
          fileUrl: 'https://r2.example.com/file',
          fileName: 'test.txt'
        })
      })

      // XMLHttpRequest load 시뮬레이션
      mockXHR.send.mockImplementation(() => {
        const loadCall = mockXHR.addEventListener.mock.calls.find(
          call => call[0] === 'load'
        )
        if (loadCall) {
          loadCall[1]()
        }
      })

      const result = await r2Service.uploadFile('ROOM01', file)

      expect(result.success).toBe(true)
      expect(result.fileName).toBe('test.txt')
    })

    it('업로드 실패 시 에러를 발생시켜야 한다', async () => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

      // Presigned URL 응답 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          uploadUrl: 'https://r2.example.com/upload',
          fileUrl: 'https://r2.example.com/file',
          fileName: 'test.txt'
        })
      })

      // XMLHttpRequest error 시뮬레이션
      mockXHR.send.mockImplementation(() => {
        const errorCall = mockXHR.addEventListener.mock.calls.find(
          call => call[0] === 'error'
        )
        if (errorCall) {
          errorCall[1]()
        }
      })

      await expect(r2Service.uploadFile('ROOM01', file)).rejects.toThrow()
    })

    it('진행률이 lengthComputable이 false이면 onProgress가 호출되지 않아야 한다', async () => {
      const onProgress = vi.fn()
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

      // Presigned URL 응답 모킹
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          uploadUrl: 'https://r2.example.com/upload',
          fileUrl: 'https://r2.example.com/file',
          fileName: 'test.txt'
        })
      })

      mockXHR.send.mockImplementation(() => {
        const progressCall = mockXHR.upload.addEventListener.mock.calls.find(
          call => call[0] === 'progress'
        )
        if (progressCall) {
          // lengthComputable이 false인 이벤트
          progressCall[1]({ lengthComputable: false, loaded: 50, total: 0 })
        }

        const loadCall = mockXHR.addEventListener.mock.calls.find(
          call => call[0] === 'load'
        )
        if (loadCall) {
          loadCall[1]()
        }
      })

      await r2Service.uploadFile('ROOM01', file, { onProgress })

      expect(onProgress).not.toHaveBeenCalled()
    })
  })
})
