import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'
import { multipartUpload } from '../services/multipartUploader'
import { trackEvent } from '../utils/analytics'

vi.mock('../services/r2Service', () => ({
  r2Service: {
    getUploadUrls: vi.fn(),
    putToPresignedUrl: vi.fn(),
    multipartApi: { create: vi.fn() },
  },
}))
vi.mock('../services/multipartUploader', async (orig) => ({
  ...(await orig()),
  multipartUpload: vi.fn(),
}))
vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../utils/thumbnail', () => ({ THUMBNAIL_CONTENT_TYPE: 'image/jpeg', createImageThumbnail: vi.fn() }))

const MB = 1024 * 1024
const fake = (name, size) => ({ name, size, type: 'video/mp4', lastModified: 1 })

describe('useFileManager - 100MB 경계 분기와 GA4 이벤트', () => {
  let fm
  beforeEach(() => {
    vi.clearAllMocks()
    fm = useFileManager()
    r2Service.getUploadUrls.mockImplementation(async (roomId, files) =>
      files.map((f) => ({ uploadUrl: `u/${f.fileName}`, fileUrl: `f/${f.fileName}`, fileName: f.fileName }))
    )
    r2Service.putToPresignedUrl.mockResolvedValue()
  })

  it('정확히 100MB는 단일 PUT, 100MB+1은 멀티파트로 간다', async () => {
    multipartUpload.mockResolvedValue({ fileName: 'big.mp4', fileUrl: 'f/big.mp4', size: 100 * MB + 1, parts: 2, retries: 1, resumed: true })
    const small = fake('small.mp4', 100 * MB)
    const big = fake('big.mp4', 100 * MB + 1)
    // 단일 PUT 쪽은 실제 업로드 대신 목으로 통과
    const summary = await fm.uploadFiles('room-1', [small, big])

    expect(r2Service.getUploadUrls).toHaveBeenCalledTimes(1)
    expect(r2Service.getUploadUrls.mock.calls[0][1].map((f) => f.fileName)).toEqual(['small.mp4'])
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(1)
    expect(multipartUpload).toHaveBeenCalledTimes(1)
    expect(multipartUpload.mock.calls[0][1]).toBe(big)
    expect(summary.successCount).toBe(2)
    expect(trackEvent).toHaveBeenCalledWith('multipart_upload_complete', expect.objectContaining({ parts: 2, retries: 1, resumed: true, size_mb: 100 }))
  })

  it('멀티파트 실패는 multipart_upload_failed를 보내고 실패로 집계된다', async () => {
    multipartUpload.mockRejectedValue(Object.assign(new Error('net'), { partsDone: 3, code: 'X' }))
    const onError = vi.fn()
    const summary = await fm.uploadFiles('room-1', [fake('big.mp4', 200 * MB)], { onError })
    expect(summary.failCount).toBe(1)
    expect(onError).toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('multipart_upload_failed', { size_mb: 200, reason: 'X', parts_done: 3 })
  })

  it('취소는 failed 이벤트를 보내지 않는다', async () => {
    multipartUpload.mockRejectedValue(Object.assign(new Error('c'), { code: 'UPLOAD_CANCELED' }))
    await fm.uploadFiles('room-1', [fake('big.mp4', 200 * MB)])
    expect(trackEvent).not.toHaveBeenCalledWith('multipart_upload_failed', expect.anything())
  })

  it('5GB 초과 파일은 file_too_large로 거절되고 어떤 업로드도 시작하지 않는다', async () => {
    const summary = await fm.uploadFiles('room-1', [fake('huge.bin', 5120 * MB + 1)])
    expect(summary.failCount).toBe(1)
    expect(multipartUpload).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('file_too_large', { file_size_mb: 5120, limit_mb: 5120 })
  })

  it('정확히 5GB는 허용된다', async () => {
    multipartUpload.mockResolvedValue({ fileName: 'x.bin', fileUrl: 'f/x.bin', size: 5120 * MB, parts: 80, retries: 0, resumed: false })
    const summary = await fm.uploadFiles('room-1', [fake('x.bin', 5120 * MB)])
    expect(summary.successCount).toBe(1)
  })
})
