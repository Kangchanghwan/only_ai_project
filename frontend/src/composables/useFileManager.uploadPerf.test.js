import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'
import { multipartUpload } from '../services/multipartUploader'
import { lockedUpload } from '../services/lockedUploader'
import { trackEvent } from '../utils/analytics'

vi.mock('../services/r2Service', () => ({
  r2Service: { getUploadUrls: vi.fn(), putToPresignedUrl: vi.fn(), multipartApi: {} },
}))
vi.mock('../services/multipartUploader', async (orig) => ({ ...(await orig()), multipartUpload: vi.fn() }))
vi.mock('../services/lockedUploader', () => ({ lockedUpload: vi.fn() }))
vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../utils/thumbnail', () => ({ THUMBNAIL_CONTENT_TYPE: 'image/jpeg', createImageThumbnail: vi.fn() }))

const MB = 1024 * 1024
const fake = (name, size) => ({ name, size, type: 'video/mp4', lastModified: 1 })
const perfCalls = (name = 'upload_perf') => trackEvent.mock.calls.filter(([n]) => n === name)

describe('useFileManager - upload_perf / upload_perf_fail', () => {
  let fm
  beforeEach(() => {
    vi.clearAllMocks()
    fm = useFileManager()
    fm.clearFiles()
    r2Service.getUploadUrls.mockImplementation(async (roomId, files) =>
      files.map((f) => ({ uploadUrl: `u/${f.fileName}`, fileUrl: `f/${f.fileName}`, fileName: f.fileName }))
    )
    r2Service.putToPresignedUrl.mockResolvedValue()
    lockedUpload.mockImplementation(async (roomId, file) => ({ id: 'id-' + file.name, size: file.size }))
  })

  it('8MB 이상 일반 파일(단일 PUT)은 upload_perf가 한 번 나간다', async () => {
    await fm.uploadFiles('room-1', [fake('a.mp4', 16 * MB)])
    const calls = perfCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({
      upload_mb: 16, upload_path: 'single', retries: 0, resumed: false, locked: false, is_mobile: false,
    })
    expect(typeof calls[0][1].upload_ms).toBe('number')
    expect(calls[0][1].upload_ms).toBeGreaterThanOrEqual(1)
    expect(calls[0][1].upload_mbps).toBeGreaterThan(0)
    expect(typeof calls[0][1].mbps_bucket).toBe('string')
    expect(perfCalls('upload_perf_fail')).toHaveLength(0)
  })

  it('100MB 초과 멀티파트 파일은 재시도/이어올리기 값과 함께 한 번 나간다', async () => {
    multipartUpload.mockResolvedValue({ fileName: 'big.mp4', fileUrl: 'f/big.mp4', size: 120 * MB, parts: 2, retries: 2, resumed: true })
    await fm.uploadFiles('room-1', [fake('big.mp4', 120 * MB)])
    const calls = perfCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ upload_mb: 120, upload_path: 'multipart', retries: 2, resumed: true, locked: false })
  })

  it('8MB 이상 잠금 파일은 locked=true로 한 번 나간다', async () => {
    await fm.uploadFiles('room-1', [fake('s.mp4', 10 * MB)], { lock: { salt: 's' } })
    const calls = perfCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ upload_mb: 10, upload_path: 'locked', locked: true })
    expect(trackEvent).toHaveBeenCalledWith('locked_upload_complete', expect.anything())
  })

  it('8MB 미만 파일은 일반/잠금 모두 upload_perf를 보내지 않는다', async () => {
    await fm.uploadFiles('room-1', [fake('s.txt', 1 * MB)])
    await fm.uploadFiles('room-1', [fake('l.txt', 7 * MB)], { lock: { salt: 's' } })
    expect(perfCalls()).toHaveLength(0)
    expect(perfCalls('upload_perf_fail')).toHaveLength(0)
  })

  it('시간은 파일별 업로드 시작부터 잰다 (앞 파일을 기다린 시간 제외)', async () => {
    let now = 1000
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    lockedUpload.mockImplementation(async (roomId, file) => {
      now += file.name === 'one.mp4' ? 4000 : 2000
      return { id: 'id-' + file.name, size: file.size }
    })
    await fm.uploadFiles('room-1', [fake('one.mp4', 10 * MB), fake('two.mp4', 10 * MB)], { lock: { salt: 's' }, concurrency: 1 })
    spy.mockRestore()
    const ms = perfCalls().map(([, p]) => p.upload_ms).sort((a, b) => a - b)
    expect(ms.length).toBe(2)
    expect(ms[0]).toBeLessThan(ms[1])
  })

  it('단일 PUT 실패는 upload_perf_fail을 보내고 upload_perf는 보내지 않는다', async () => {
    const err = Object.assign(new Error('HTTP 500'), { status: 500 })
    r2Service.putToPresignedUrl.mockRejectedValue(err)
    const summary = await fm.uploadFiles('room-1', [fake('a.mp4', 16 * MB)])
    expect(summary.failCount).toBe(1)
    const fails = perfCalls('upload_perf_fail')
    expect(fails).toHaveLength(1)
    expect(fails[0][1]).toMatchObject({ upload_mb: 16, upload_path: 'single', reason: 'http', is_mobile: false })
    expect(perfCalls()).toHaveLength(0)
  })

  it('멀티파트 실패와 잠금 실패도 upload_perf_fail을 한 번씩 보낸다', async () => {
    multipartUpload.mockRejectedValue(new TypeError('network down'))
    await fm.uploadFiles('room-1', [fake('big.mp4', 120 * MB)])
    lockedUpload.mockRejectedValue(new Error('boom'))
    await fm.uploadFiles('room-1', [fake('s.mp4', 10 * MB)], { lock: { salt: 's' } })
    const fails = perfCalls('upload_perf_fail')
    expect(fails).toHaveLength(2)
    expect(fails[0][1]).toMatchObject({ upload_path: 'multipart', reason: 'network' })
    expect(fails[1][1]).toMatchObject({ upload_path: 'locked', reason: 'other' })
  })

  it('사용자 취소는 upload_perf_fail을 보내지 않는다', async () => {
    lockedUpload.mockImplementation(async () => { throw Object.assign(new Error('canceled'), { code: 'UPLOAD_CANCELED' }) })
    await fm.uploadFiles('room-1', [fake('s.mp4', 10 * MB)], { lock: { salt: 's' } })
    expect(perfCalls('upload_perf_fail')).toHaveLength(0)
    expect(perfCalls()).toHaveLength(0)
  })
})
