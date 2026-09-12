import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { r2Service } from './r2Service'

describe('R2Service - 배치 presign / 네이티브 다운로드 URL / 썸네일 URL', () => {
  let mockFetch
  let mockXHR

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: { addEventListener: vi.fn() },
      addEventListener: vi.fn(),
      status: 200
    }
    vi.stubGlobal('XMLHttpRequest', function () { return mockXHR })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getThumbUrl은 thumbs/ 프리픽스 아래 .jpg URL을 만든다', () => {
    expect(r2Service.getThumbUrl('room-x', 'photo.png')).toBe(`${r2Service.publicUrl}/thumbs/room-x/photo.png.jpg`)
  })

  it('getUploadUrls는 배치 엔드포인트를 한 번 호출하고 파일별 URL 배열을 반환한다', async () => {
    const presigned = [
      { uploadUrl: 'https://r2/up/a', fileUrl: 'https://store/room-x/a.png', fileName: 'a.png', thumbUploadUrl: 'https://r2/up/a-thumb', thumbUrl: 'https://store/thumbs/room-x/a.png.jpg' },
      { uploadUrl: 'https://r2/up/b', fileUrl: 'https://store/room-x/b.pdf', fileName: 'b.pdf' }
    ]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ files: presigned }) })

    const result = await r2Service.getUploadUrls('room-x', [
      { fileName: 'a.png', contentType: 'image/png' },
      { fileName: 'b.pdf', contentType: 'application/pdf' }
    ])

    expect(result).toEqual(presigned)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${r2Service.apiUrl}/api/r2/presigned-urls`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      roomId: 'room-x',
      files: [
        { fileName: 'a.png', contentType: 'image/png' },
        { fileName: 'b.pdf', contentType: 'application/pdf' }
      ]
    })
  })

  it('getUploadUrls는 응답이 실패하면 상태 코드를 담은 에러를 던진다 (404 외에는 폴백하지 않는다)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(r2Service.getUploadUrls('room-x', [{ fileName: 'a.png', contentType: 'image/png' }]))
      .rejects.toThrow('500')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('getUploadUrls는 배치 엔드포인트가 404면 파일별 단일 presign 엔드포인트로 폴백한다 (구버전 백엔드 호환)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://r2/up/a', fileUrl: 'https://store/room-x/a.png', fileName: 'a.png' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://r2/up/b', fileUrl: 'https://store/room-x/b.pdf', fileName: 'b.pdf' }) })

    const result = await r2Service.getUploadUrls('room-x', [
      { fileName: 'a.png', contentType: 'image/png' },
      { fileName: 'b.pdf', contentType: 'application/pdf' }
    ])

    // 입력 순서 유지, 단일 엔드포인트는 썸네일 URL을 주지 않으므로 thumb 필드 없음
    expect(result).toEqual([
      { uploadUrl: 'https://r2/up/a', fileUrl: 'https://store/room-x/a.png', fileName: 'a.png' },
      { uploadUrl: 'https://r2/up/b', fileUrl: 'https://store/room-x/b.pdf', fileName: 'b.pdf' }
    ])

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch.mock.calls[0][0]).toBe(`${r2Service.apiUrl}/api/r2/presigned-urls`)
    expect(mockFetch.mock.calls[1][0]).toBe(`${r2Service.apiUrl}/api/r2/presigned-url`)
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ roomId: 'room-x', fileName: 'a.png', contentType: 'image/png' })
    expect(mockFetch.mock.calls[2][0]).toBe(`${r2Service.apiUrl}/api/r2/presigned-url`)
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ roomId: 'room-x', fileName: 'b.pdf', contentType: 'application/pdf' })
  })

  it('getUploadUrls 폴백 중 단일 presign이 실패하면 그 상태 코드를 담은 에러를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(r2Service.getUploadUrls('room-x', [{ fileName: 'a.png', contentType: 'image/png' }]))
      .rejects.toThrow('Presigned URL 생성 실패: 500')
  })

  it('putToPresignedUrl은 XHR PUT으로 본문을 보내고 진행률을 보고한다', async () => {
    const onProgress = vi.fn()
    const blob = new Blob(['data'], { type: 'image/jpeg' })

    mockXHR.upload.addEventListener.mockImplementation((event, handler) => {
      if (event === 'progress') handler({ lengthComputable: true, loaded: 5, total: 10 })
    })
    mockXHR.addEventListener.mockImplementation((event, handler) => {
      if (event === 'load') handler()
    })

    await r2Service.putToPresignedUrl('https://r2/up/thumb', blob, 'image/jpeg', { onProgress })

    expect(mockXHR.open).toHaveBeenCalledWith('PUT', 'https://r2/up/thumb')
    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg')
    expect(mockXHR.send).toHaveBeenCalledWith(blob)
    expect(onProgress).toHaveBeenCalledWith(50)
  })

  it('putToPresignedUrl은 2xx가 아니면 거부한다', async () => {
    mockXHR.status = 403
    mockXHR.addEventListener.mockImplementation((event, handler) => {
      if (event === 'load') handler()
    })

    await expect(r2Service.putToPresignedUrl('https://r2/up/x', new Blob(['x']), 'text/plain'))
      .rejects.toThrow('403')
  })

  it('getDownloadUrl은 파일명을 인코딩해 요청하고 presigned URL을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ fileName: '사진.png', url: 'https://r2/get/signed' }) })

    const url = await r2Service.getDownloadUrl('room-x', '사진.png')

    expect(url).toBe('https://r2/get/signed')
    expect(mockFetch.mock.calls[0][0]).toBe(`${r2Service.apiUrl}/api/r2/download-url/room-x/${encodeURIComponent('사진.png')}`)
  })

  it('getDownloadUrls는 배치 엔드포인트로 파일명→URL 맵을 만든다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ urls: [{ fileName: 'a.png', url: 'https://r2/get/a' }, { fileName: 'b.pdf', url: 'https://r2/get/b' }] })
    })

    const map = await r2Service.getDownloadUrls('room-x', ['a.png', 'b.pdf'])

    expect(map).toEqual({ 'a.png': 'https://r2/get/a', 'b.pdf': 'https://r2/get/b' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${r2Service.apiUrl}/api/r2/download-urls`)
    expect(JSON.parse(init.body)).toEqual({ roomId: 'room-x', fileNames: ['a.png', 'b.pdf'] })
  })
})
