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

import { useFileManager, lockedFileConcurrency } from './useFileManager'
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

describe('잠금 업로드 동시성', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFileManager().clearFiles()
  })
  const MB = 1024 * 1024
  const fakeFile = (name, size) => ({ name, size, type: 'application/octet-stream', lastModified: 1 })

  it('기기별 동시 개수: PC 3, 폰·태블릿 2', () => {
    expect(lockedFileConcurrency('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/143')).toBe(3)
    expect(lockedFileConcurrency('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148')).toBe(2)
    expect(lockedFileConcurrency('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe(2)
  })

  it('한 조각(64MiB 이하)짜리 파일은 동시에 올리고, 큰 파일은 작은 파일이 끝난 뒤 하나씩 올린다', async () => {
    let inFlight = 0
    let maxSmall = 0
    const order = []
    const releases = []
    lockedUpload.mockImplementation((roomId, file) => new Promise((resolve) => {
      inFlight++
      if (file.size <= 64 * MB) maxSmall = Math.max(maxSmall, inFlight)
      order.push(`start:${file.name}:${inFlight}`)
      releases.push(() => { inFlight--; order.push(`end:${file.name}`); resolve({ id: 'id-' + file.name, size: file.size }) })
    }))
    const fm = useFileManager()
    const files = [fakeFile('s1', 5 * MB), fakeFile('big1', 200 * MB), fakeFile('s2', 10 * MB), fakeFile('s3', 64 * MB), fakeFile('s4', 1 * MB), fakeFile('big2', 70 * MB)]
    const run = fm.uploadFiles('prv-g-x', files, { lock: { salt: 's' } })
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
    while (order.filter((x) => x.startsWith('end:')).length < files.length) {
      await flush()
      const r = releases.shift()
      if (r) r(); else await new Promise((res) => setTimeout(res, 0))
    }
    const summary = await run
    expect(summary.successCount).toBe(6)
    // jsdom/happy-dom UA는 데스크톱 → 작은 파일은 3개까지 동시에
    expect(maxSmall).toBe(lockedFileConcurrency())
    expect(maxSmall).toBeGreaterThan(1)
    // 큰 파일(64MiB 초과)은 작은 파일이 모두 끝난 뒤, 한 번에 하나씩
    const firstBig = order.findIndex((x) => x.startsWith('start:big'))
    const lastSmallEnd = Math.max(...['s1', 's2', 's3', 's4'].map((n) => order.indexOf(`end:${n}`)))
    expect(firstBig).toBeGreaterThan(lastSmallEnd)
    expect(order.filter((x) => /^start:big/.test(x)).every((x) => x.endsWith(':1'))).toBe(true)
  })

  it('작은 파일 하나가 실패해도 나머지는 올라가고 실패만 집계된다', async () => {
    lockedUpload.mockImplementation(async (roomId, file) => {
      if (file.name === 'bad') throw Object.assign(new Error('boom'), { retryable: false })
      return { id: 'id-' + file.name, size: file.size }
    })
    const fm = useFileManager()
    const summary = await fm.uploadFiles('prv-g-x', [fakeFile('a', MB), fakeFile('bad', MB), fakeFile('c', MB)], { lock: { salt: 's' } })
    expect(summary.successCount).toBe(2)
    expect(summary.failCount).toBe(1)
  })
})
