import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createUploadProgress, FAILED_UPLOAD_REMOVE_DELAY_MS } from './uploadProgress.js'
import { notificationService } from '../services/notificationService.js'
import { useNotification } from '../composables/useNotification.js'
import { useFileManager } from '../composables/useFileManager.js'
import { r2Service } from '../services/r2Service.js'
import i18n from '../i18n/index.js'

const big = (name = 'big.bin') => ({ name, size: 501 * 1024 * 1024, type: 'application/octet-stream' })

describe('업로드 진행 카드 (거절/실패 파일)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    notificationService.clearAllUploads()
    i18n.global.locale.value = 'en'
  })
  afterEach(() => {
    vi.useRealTimers()
    i18n.global.locale.value = 'ko'
    vi.restoreAllMocks()
  })

  it('크기 초과로 거절된 파일은 진행 카드를 만들지 않고 영어 토스트만 띄운다', async () => {
    const notification = useNotification()
    const manager = useFileManager()
    const progress = createUploadProgress(notification)
    const getUrls = vi.spyOn(r2Service, 'getUploadUrls')

    const summary = await manager.uploadFiles('room-1', [big()], {
      onStart: f => progress.start(f),
      onProgress: (f, p) => progress.progress(f, p),
      onComplete: f => progress.complete(f),
      onError: (f, e) => progress.fail(f, e)
    })

    expect(summary.failCount).toBe(1)
    expect(getUrls).not.toHaveBeenCalled()
    expect(notificationService.uploads.value.size).toBe(0)
    expect(notificationService.notification.value).toBe('✗ File size cannot exceed 500MB')
  })

  it('presign 실패(413 등)도 진행 카드가 남지 않는다', async () => {
    const notification = useNotification()
    const manager = useFileManager()
    const progress = createUploadProgress(notification)
    vi.spyOn(r2Service, 'getUploadUrls').mockRejectedValue(new Error('Failed to create upload URL: 413'))

    const file = { name: 'a.bin', size: 1024, type: 'application/octet-stream' }
    await manager.uploadFiles('room-1', [file], {
      onStart: f => progress.start(f),
      onError: (f, e) => progress.fail(f, e)
    })

    expect(notificationService.uploads.value.size).toBe(0)
    expect(notificationService.notification.value).toBe('✗ Upload failed: Failed to create upload URL: 413')
  })

  it('전송 중 실패(네트워크)한 카드는 실패로 표시된 뒤 자동 제거된다', () => {
    const notification = useNotification()
    const progress = createUploadProgress(notification)
    const file = { name: 'n.bin', size: 10 }

    progress.start(file)
    expect(notificationService.uploads.value.size).toBe(1)

    progress.fail(file, new Error('network'))
    expect([...notificationService.uploads.value.values()][0].status).toBe('failed')

    vi.advanceTimersByTime(FAILED_UPLOAD_REMOVE_DELAY_MS)
    expect(notificationService.uploads.value.size).toBe(0)
  })
})
