import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/lockedUploader.js', () => ({
  lockedUpload: vi.fn(async (roomId, file, lock, opts) => {
    opts.onProgress?.({ encPercent: 100, upPercent: 100 })
    return { id: 'id-' + file.name, size: file.size, ctSize: file.size + 16 }
  })
}))
vi.mock('../services/r2Service.js', () => ({
  r2Service: {
    getUploadUrls: vi.fn(),
    putToPresignedUrl: vi.fn(),
    deleteFile: vi.fn(async () => ({ success: true })),
    deleteLockedFile: vi.fn(async () => ({ success: true })),
    multipartApi: {}
  }
}))

import { useFileManager } from './useFileManager'
import { lockedUpload } from '../services/lockedUploader.js'
import { r2Service } from '../services/r2Service.js'

describe('useFileManager 잠금 업로드', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lock이 있으면 작은 파일도 잠금 업로드로 보내고 presign을 쓰지 않는다', async () => {
    const fm = useFileManager()
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
    const onProgress = vi.fn()
    const onComplete = vi.fn()
    const summary = await fm.uploadFiles('room-1', [file], { lock: { salt: 's' }, onProgress, onComplete })
    expect(summary.successCount).toBe(1)
    expect(r2Service.getUploadUrls).not.toHaveBeenCalled()
    expect(lockedUpload).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(file, 100, { locked: true, encPercent: 100 })
    expect(onComplete.mock.calls[0][1]).toMatchObject({ locked: true, fileName: 'id-a.txt', originalName: 'a.txt' })
    expect(fm.files.value[0]).toMatchObject({ name: 'id-a.txt', locked: true, roomId: 'room-1' })
  })

  it('잠긴 파일 삭제는 잠금 삭제 API를 쓴다', async () => {
    const fm = useFileManager()
    fm.addFile({ name: 'id-1', locked: true, size: 1, created: 'x', roomId: 'room-1' })
    await fm.deleteFile('room-1', 'id-1')
    expect(r2Service.deleteLockedFile).toHaveBeenCalledWith('room-1', 'id-1')
    expect(r2Service.deleteFile).not.toHaveBeenCalled()
    expect(fm.files.value.length).toBe(0)
  })
})
