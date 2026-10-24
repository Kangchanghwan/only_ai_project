import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const trackEvent = vi.fn()
vi.mock('../utils/analytics.js', () => ({ trackEvent: (...a) => trackEvent(...a) }))
const multipartUpload = vi.fn()
vi.mock('./multipartUploader.js', () => ({
  multipartUpload: (...a) => multipartUpload(...a),
  isMultipartFile: (size) => size > 100 * 1024 * 1024,
}))
import { r2Service } from './r2Service'

const MB = 1024 * 1024
const fileOf = (size) => new File([new Uint8Array(1)], 'a.bin', { type: 'application/octet-stream' }) && Object.defineProperty(new File(['x'], 'a.bin'), 'size', { value: size })

describe('upload_perf', () => {
  let spy
  beforeEach(() => {
    trackEvent.mockReset()
    multipartUpload.mockReset()
    spy = vi.spyOn(r2Service, 'uploadWithPresignedUrl')
  })
  afterEach(() => spy.mockRestore())
  const ok = (size) => ({ success: true, path: 'r/a', fileName: 'a', url: 'u', size, created: 'c' })

  it('8MB 이상 성공이면 1회', async () => {
    spy.mockResolvedValue(ok(10 * MB))
    const res = await r2Service.uploadFile('room', fileOf(10 * MB))
    expect(res).toEqual(ok(10 * MB))
    const calls = trackEvent.mock.calls.filter((c) => c[0] === 'upload_perf')
    expect(calls).toHaveLength(1)
    const p = calls[0][1]
    expect(p).toMatchObject({ upload_mb: 10, upload_path: 'single', retries: 0, resumed: false, locked: false })
    expect(typeof p.upload_ms).toBe('number')
    expect(typeof p.upload_mbps).toBe('number')
    expect(p.mbps_bucket).toBeTruthy()
  })

  it('8MB 미만은 이벤트 없음', async () => {
    spy.mockResolvedValue(ok(MB))
    await r2Service.uploadFile('room', fileOf(MB))
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('multipart: retries/resumed 반영, 결과에 내부 필드 없음', async () => {
    multipartUpload.mockResolvedValue({ fileName: 'a', fileUrl: 'u', size: 200 * MB, retries: 3, resumed: true })
    const res = await r2Service.uploadFile('room', fileOf(200 * MB))
    expect(Object.keys(res).sort()).toEqual(['created', 'fileName', 'path', 'size', 'success', 'url'])
    expect(trackEvent.mock.calls[0][1]).toMatchObject({ upload_path: 'multipart', retries: 3, resumed: true })
  })

  it.each([
    [Object.assign(new Error('x'), { code: 'UPLOAD_CANCELED' }), 'canceled'],
    [new TypeError('Failed to fetch'), 'network'],
    [Object.assign(new Error('x'), { status: 500 }), 'http'],
    [new Error('???'), 'other'],
  ])('실패 시 upload_perf_fail(%#)', async (err, reason) => {
    spy.mockRejectedValue(err)
    await expect(r2Service.uploadFile('room', fileOf(9 * MB))).rejects.toBe(err)
    expect(trackEvent.mock.calls.map((c) => c[0])).toEqual(['upload_perf_fail'])
    expect(trackEvent.mock.calls[0][1]).toMatchObject({ reason, upload_path: 'single', upload_mb: 9 })
  })

  it('8MB 미만 실패는 이벤트 없음', async () => {
    spy.mockRejectedValue(new Error('x'))
    await expect(r2Service.uploadFile('room', fileOf(MB))).rejects.toThrow()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('trackEvent가 throw해도 업로드 결과 동일', async () => {
    trackEvent.mockImplementation(() => { throw new Error('ga') })
    spy.mockResolvedValue(ok(10 * MB))
    expect(await r2Service.uploadFile('room', fileOf(10 * MB))).toEqual(ok(10 * MB))
    spy.mockRejectedValue(new Error('up'))
    await expect(r2Service.uploadFile('room', fileOf(10 * MB))).rejects.toThrow('up')
  })
})
