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
    lockedMeta: vi.fn(async () => ({ salt: 'none' })),
    multipartApi: {}
  }
}))

import { useFileManager } from './useFileManager'
import { lockedUpload } from '../services/lockedUploader.js'
import { r2Service } from '../services/r2Service.js'
import { useLockState } from './useLockState.js'

describe('useFileManager 잠금 업로드', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLockState().resetLockState()
    useFileManager().clearFiles()
  })

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

  it('내가 올린 잠긴 파일은 삭제 키로 지운다', async () => {
    const fm = useFileManager()
    const ls = useLockState()
    ls.rememberDeleteKey('room-1', 'id-1', 'dk-1')
    fm.addFile({ name: 'id-1', locked: true, size: 1, created: 'x', roomId: 'room-1' })
    await fm.deleteFile('room-1', 'id-1')
    expect(r2Service.deleteLockedFile).toHaveBeenCalledWith('room-1', 'id-1', { deleteKey: 'dk-1' })
    expect(r2Service.deleteFile).not.toHaveBeenCalled()
    expect(fm.files.value.length).toBe(0)
  })

  it('이번 접속에서 같은 비밀번호를 확인했으면 확인값으로 지운다', async () => {
    const fm = useFileManager()
    const ls = useLockState()
    ls.rememberKey('salt-1', {}, 'verifier-1')
    r2Service.lockedMeta.mockResolvedValue({ salt: 'salt-1' })
    fm.addFile({ name: 'id-2', locked: true, size: 1, created: 'x', roomId: 'room-1' })
    await fm.deleteFile('room-1', 'id-2')
    expect(r2Service.deleteLockedFile).toHaveBeenCalledWith('room-1', 'id-2', { verifier: 'verifier-1' })
  })

  it('증명이 없으면 서버에 삭제 요청을 보내지 않고 목록에도 남긴다', async () => {
    const fm = useFileManager()
    r2Service.lockedMeta.mockResolvedValue({ salt: 'unknown-salt' })
    fm.addFile({ name: 'id-3', locked: true, size: 1, created: 'x', roomId: 'room-1' })
    await expect(fm.deleteFile('room-1', 'id-3')).rejects.toMatchObject({ code: 'NEED_PASSWORD' })
    expect(r2Service.deleteLockedFile).not.toHaveBeenCalled()
    expect(fm.files.value.length).toBe(1)
  })

  it('룸 초기화(로컬)는 잠긴 파일을 남긴다', () => {
    const fm = useFileManager()
    fm.addFile({ name: 'a.png', url: 'u', size: 1, created: 'x', roomId: 'room-1' })
    fm.addFile({ name: 'id-4', locked: true, size: 1, created: 'x', roomId: 'room-1' })
    fm.clearRoomFiles('room-1')
    expect(fm.files.value.map((f) => f.name)).toEqual(['id-4'])
  })
})
