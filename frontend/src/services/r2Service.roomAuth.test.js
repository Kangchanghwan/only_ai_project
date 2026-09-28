import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { r2Service } from './r2Service'
import { setRoomTokens, setRoomTokenRefresher, clearRoomTokens } from './roomTokenStore'

const okJson = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) })

describe('R2Service 룸 토큰 인증', () => {
  let mockFetch

  beforeEach(() => {
    clearRoomTokens()
    setRoomTokenRefresher(null)
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('토큰이 있으면 목록 조회·삭제·용량 조회에 X-Room-Token 헤더를 붙인다', async () => {
    setRoomTokens({ roomTokens: { 'room-a': 'tok-a' }, roomTokenTtlSec: 7200 })
    mockFetch
      .mockResolvedValueOnce(okJson({ files: [], nextToken: undefined }))
      .mockResolvedValueOnce(okJson({ success: true }))
      .mockResolvedValueOnce(okJson({ totalSize: 0 }))

    await r2Service.loadFiles('room-a')
    await r2Service.deleteFile('room-a', 'x.png')
    await r2Service.getRoomTotalSize('room-a')

    for (const call of mockFetch.mock.calls) {
      expect(call[1].headers['X-Room-Token']).toBe('tok-a')
    }
    expect(mockFetch.mock.calls[1][1].method).toBe('DELETE')
  })

  it('업로드 URL 배치 발급은 기존 Content-Type과 토큰 헤더를 함께 보낸다', async () => {
    setRoomTokens({ roomTokens: { 'room-a': 'tok-a' }, roomTokenTtlSec: 7200 })
    mockFetch.mockResolvedValueOnce(okJson({ files: [] }))

    await r2Service.getUploadUrls('room-a', [{ fileName: 'a.png', contentType: 'image/png' }])

    expect(mockFetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', 'X-Room-Token': 'tok-a' })
  })

  it('토큰이 없으면(구버전 백엔드) 예전과 똑같이 헤더 없이 호출한다', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ files: [], nextToken: undefined }))

    await r2Service.loadFiles('room-a')

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/r2/files/room-a?'))
    expect(mockFetch.mock.calls[0]).toHaveLength(1)
  })

  it('401을 받으면 토큰을 재발급받아 한 번만 재시도한다', async () => {
    setRoomTokens({ roomTokens: { 'room-a': 'stale' }, roomTokenTtlSec: 7200 })
    setRoomTokenRefresher(vi.fn().mockResolvedValue({ roomTokens: { 'room-a': 'fresh' }, roomTokenTtlSec: 7200 }))
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(okJson({ files: [], nextToken: undefined }))

    await r2Service.loadFiles('room-a')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][1].headers['X-Room-Token']).toBe('stale')
    expect(mockFetch.mock.calls[1][1].headers['X-Room-Token']).toBe('fresh')
  })

  it('다운로드 URL 발급은 공유 링크 수신자도 써야 하므로 토큰을 붙이지 않는다', async () => {
    setRoomTokens({ roomTokens: { 'room-a': 'tok-a' }, roomTokenTtlSec: 7200 })
    mockFetch
      .mockResolvedValueOnce(okJson({ url: 'https://signed' }))
      .mockResolvedValueOnce(okJson({ urls: [] }))

    await r2Service.getDownloadUrl('room-a', 'a.png')
    await r2Service.getDownloadUrls('room-a', ['a.png'])

    expect(mockFetch.mock.calls[0]).toHaveLength(1)
    expect(mockFetch.mock.calls[1][1].headers).toEqual({ 'Content-Type': 'application/json' })
  })
})
