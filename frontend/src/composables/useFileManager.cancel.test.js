import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'
import { multipartUpload } from '../services/multipartUploader'
import { trackEvent } from '../utils/analytics'
import { createUploadProgress, cancelUpload, cancelAllUploads, CANCEL_BATCH_DELAY_MS } from '../utils/uploadProgress'
import { notificationService } from '../services/notificationService'
import { useNotification } from './useNotification'
import i18n from '../i18n/index.js'

vi.mock('../services/r2Service', () => ({
  r2Service: { getUploadUrls: vi.fn(), putToPresignedUrl: vi.fn(), multipartApi: {} },
}))
vi.mock('../services/multipartUploader', async (orig) => ({ ...(await orig()), multipartUpload: vi.fn() }))
vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../utils/thumbnail', () => ({ THUMBNAIL_CONTENT_TYPE: 'image/jpeg', createImageThumbnail: vi.fn() }))

const MB = 1024 * 1024
const fake = (name, size) => ({ name, size, type: 'video/mp4', lastModified: 1 })
const canceled = () => Object.assign(new Error('c'), { code: 'UPLOAD_CANCELED' })

/** signal이 abort되면 UPLOAD_CANCELED로 거절되는 대기 PUT */
const hangingPut = () => (url, body, type, { signal }) => new Promise((_res, rej) => {
  signal.addEventListener('abort', () => rej(canceled()))
})

describe('업로드 취소', () => {
  let fm, progress, hooks, publish
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    i18n.global.locale.value = 'ko'
    notificationService.clearAllUploads()
    fm = useFileManager()
    progress = createUploadProgress(useNotification())
    publish = vi.fn()
    hooks = {
      concurrency: 1,
      onQueue: (f, h) => progress.queue(f, h),
      onStart: (f) => progress.start(f),
      onProgress: (f, p) => progress.progress(f, p),
      onCancel: (f, info) => progress.cancelled(f, info),
      onComplete: (f, r) => { publish(r.fileName); progress.complete(f) },
      onError: (f, e) => progress.fail(f, e),
    }
    r2Service.getUploadUrls.mockImplementation(async (roomId, files) =>
      files.map((f) => ({ uploadUrl: `u/${f.fileName}`, fileUrl: `f/${f.fileName}`, fileName: f.fileName }))
    )
  })

  const ids = () => [...notificationService.uploads.value.keys()]

  it('단일 PUT 취소: 전송 중단, 카드 즉시 제거, 완료/실패 콜백·publish 없음, upload_cancelled(single)', async () => {
    r2Service.putToPresignedUrl.mockImplementation(hangingPut())
    const onError = vi.fn()
    const run = fm.uploadFiles('room-1', [fake('a.mp4', 10 * MB)], { ...hooks, onError })
    await vi.waitFor(() => expect(r2Service.putToPresignedUrl).toHaveBeenCalled())
    expect(ids()).toHaveLength(1)
    cancelUpload(ids()[0])
    const summary = await run
    expect(notificationService.uploads.value.size).toBe(0)
    expect(summary).toMatchObject({ successCount: 0, failCount: 0, cancelCount: 1 })
    expect(onError).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CANCEL_BATCH_DELAY_MS)
    expect(notificationService.notification.value).toContain('업로드를 취소했어요')
    expect(trackEvent).toHaveBeenCalledWith('upload_cancelled', { size_mb: 10, progress_pct: 0, method: 'single', count: 1 })
  })

  it('멀티파트 취소: signal로 중단, multipart_upload_failed 없음, upload_cancelled(multipart)', async () => {
    multipartUpload.mockImplementation((roomId, file, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(canceled()))
    }))
    const run = fm.uploadFiles('room-1', [fake('big.mp4', 200 * MB)], hooks)
    await vi.waitFor(() => expect(multipartUpload).toHaveBeenCalled())
    cancelUpload(ids()[0])
    const summary = await run
    expect(summary.cancelCount).toBe(1)
    expect(trackEvent).not.toHaveBeenCalledWith('multipart_upload_failed', expect.anything())
    expect(publish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CANCEL_BATCH_DELAY_MS)
    expect(trackEvent).toHaveBeenCalledWith('upload_cancelled', expect.objectContaining({ method: 'multipart', size_mb: 200, count: 1 }))
  })

  it('대기열 취소: 시작 안 한 파일은 업로드/publish 없이 제거된다', async () => {
    r2Service.putToPresignedUrl.mockImplementation(hangingPut())
    const files = [fake('a.mp4', MB), fake('b.mp4', MB)]
    const run = fm.uploadFiles('room-1', files, hooks) // concurrency 1 → b는 대기
    await vi.waitFor(() => expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(1))
    expect(ids()).toHaveLength(2)
    const [aId, bId] = ids()
    cancelUpload(bId)
    expect(ids()).toEqual([aId]) // 대기 파일 카드 즉시 제거
    cancelUpload(aId)
    const summary = await run
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(1) // b는 시작도 안 함
    expect(summary.cancelCount).toBe(2)
    expect(publish).not.toHaveBeenCalled()
  })

  it('모두 취소: 진행 중 + 대기 파일 모두 취소하고 토스트는 N개로 한 번만', async () => {
    r2Service.putToPresignedUrl.mockImplementation(hangingPut())
    multipartUpload.mockImplementation((roomId, file, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(canceled()))
    }))
    const run = fm.uploadFiles('room-1', [fake('a.mp4', MB), fake('b.mp4', MB), fake('c.mp4', 300 * MB)], hooks)
    await vi.waitFor(() => expect(r2Service.putToPresignedUrl).toHaveBeenCalled())
    await vi.waitFor(() => expect(multipartUpload).toHaveBeenCalled())
    expect(cancelAllUploads()).toBe(3)
    const summary = await run
    expect(summary.cancelCount).toBe(3)
    expect(notificationService.uploads.value.size).toBe(0)
    vi.advanceTimersByTime(CANCEL_BATCH_DELAY_MS)
    expect(notificationService.notification.value).toContain('3개 업로드를 취소했어요')
    expect(trackEvent.mock.calls.filter(([n]) => n === 'upload_cancelled')).toHaveLength(3)
    expect(trackEvent).toHaveBeenCalledWith('upload_cancelled', expect.objectContaining({ count: 3 }))
    expect(publish).not.toHaveBeenCalled()
  })

  it('단일 PUT 완료 경합: 취소 요청 직후 PUT이 성공하면 완료로 처리된다', async () => {
    let finish
    r2Service.putToPresignedUrl.mockImplementation(() => new Promise((res) => { finish = res })) // abort 무시(이미 응답 수신)
    const run = fm.uploadFiles('room-1', [fake('a.mp4', MB)], hooks)
    await vi.waitFor(() => expect(r2Service.putToPresignedUrl).toHaveBeenCalled())
    cancelUpload(ids()[0])
    finish()
    const summary = await run
    expect(summary).toMatchObject({ successCount: 1, cancelCount: 0 })
    expect(publish).toHaveBeenCalledWith('a.mp4')
    vi.advanceTimersByTime(CANCEL_BATCH_DELAY_MS)
    expect(trackEvent).not.toHaveBeenCalledWith('upload_cancelled', expect.anything())
  })

  it('멀티파트 complete 이후(commit) 취소는 무시되고 완료 처리된다', async () => {
    let commit, finish
    multipartUpload.mockImplementation((roomId, file, { onCommit }) => new Promise((res) => {
      commit = onCommit
      finish = () => res({ fileName: 'big.mp4', fileUrl: 'f/big.mp4', size: file.size, parts: 4, retries: 0, resumed: false })
    }))
    const run = fm.uploadFiles('room-1', [fake('big.mp4', 200 * MB)], hooks)
    await vi.waitFor(() => expect(multipartUpload).toHaveBeenCalled())
    commit()
    expect(cancelUpload(ids()[0])).toBe(false)
    finish()
    const summary = await run
    expect(summary.successCount).toBe(1)
    expect(publish).toHaveBeenCalledWith('big.mp4')
    expect(trackEvent).not.toHaveBeenCalledWith('upload_cancelled', expect.anything())
  })

  it('취소 시 실패 카드/실패 토스트가 없다', async () => {
    r2Service.putToPresignedUrl.mockImplementation(hangingPut())
    const run = fm.uploadFiles('room-1', [fake('a.mp4', MB)], hooks)
    await vi.waitFor(() => expect(r2Service.putToPresignedUrl).toHaveBeenCalled())
    cancelUpload(ids()[0])
    await run
    vi.advanceTimersByTime(CANCEL_BATCH_DELAY_MS)
    expect(notificationService.notification.value).not.toContain('✗')
    expect(notificationService.notification.value).not.toContain('실패')
  })
})
