import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileManager } from './useFileManager'
import { r2Service } from '../services/r2Service'
import { createImageThumbnail } from '../utils/thumbnail'

vi.mock('../services/r2Service', () => ({
  r2Service: {
    loadFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    deleteAllFiles: vi.fn(),
    getFileUrl: vi.fn(),
    getRoomTotalSize: vi.fn(),
    getUploadUrls: vi.fn(),
    putToPresignedUrl: vi.fn(),
    getThumbUrl: vi.fn((roomId, name) => `https://store/thumbs/${roomId}/${name}.jpg`)
  }
}))

vi.mock('../utils/thumbnail', () => ({
  THUMBNAIL_CONTENT_TYPE: 'image/jpeg',
  createImageThumbnail: vi.fn()
}))

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeFile(name, type, size = 10) {
  return new File(['x'.repeat(size)], name, { type })
}

function presignFor(roomId, files) {
  return files.map(({ fileName, contentType }) => ({
    uploadUrl: `https://r2/put/${roomId}/${fileName}`,
    fileUrl: `https://store/${roomId}/${fileName}`,
    fileName,
    ...(contentType.startsWith('image/')
      ? { thumbUploadUrl: `https://r2/put/thumbs/${roomId}/${fileName}.jpg`, thumbUrl: `https://store/thumbs/${roomId}/${fileName}.jpg` }
      : {})
  }))
}

describe('useFileManager - 로컬 목록 동기화 (addFile / removeFile / clearRoomFiles)', () => {
  let fm

  beforeEach(() => {
    vi.resetAllMocks()
    delete import.meta.env.VITE_MAX_FILE_SIZE_MB
    fm = useFileManager()
  })

  it('addFile은 새 파일을 맨 앞에 추가하고 totalSize를 가산하며 true를 반환한다', () => {
    fm.addFile({ name: 'a.png', url: 'u/a', size: 100, created: '2026-01-01T00:00:00Z', roomId: 'room-x' })
    const added = fm.addFile({ name: 'b.png', url: 'u/b', size: 50, created: '2026-01-02T00:00:00Z', roomId: 'room-x' })

    expect(added).toBe(true)
    expect(fm.files.value.map(f => f.name)).toEqual(['b.png', 'a.png'])
    expect(fm.totalSize.value).toBe(150)
  })

  it('addFile은 같은 roomId+name이면 교체하고 false를 반환하며 용량을 중복 가산하지 않는다', () => {
    fm.addFile({ name: 'a.png', url: 'u/a', size: 100, created: '2026-01-01T00:00:00Z', roomId: 'room-x' })
    const added = fm.addFile({ name: 'a.png', url: 'u/a2', size: 120, created: '2026-01-03T00:00:00Z', roomId: 'room-x' })

    expect(added).toBe(false)
    expect(fm.files.value).toHaveLength(1)
    expect(fm.files.value[0].url).toBe('u/a2')
    expect(fm.totalSize.value).toBe(120)
  })

  it('addFile은 다른 룸의 같은 파일명을 별개 파일로 취급한다', () => {
    fm.addFile({ name: 'dup.png', url: 'u/a', size: 1, created: '2026-01-01T00:00:00Z', roomId: 'room-a' })
    fm.addFile({ name: 'dup.png', url: 'u/b', size: 2, created: '2026-01-01T00:00:00Z', roomId: 'room-b' })

    expect(fm.files.value).toHaveLength(2)
  })

  it('removeFile은 해당 파일만 제거하고 totalSize를 감산한다', () => {
    fm.addFile({ name: 'a.png', url: 'u/a', size: 100, created: '2026-01-01T00:00:00Z', roomId: 'room-x' })
    fm.addFile({ name: 'b.png', url: 'u/b', size: 50, created: '2026-01-01T00:00:00Z', roomId: 'room-x' })

    expect(fm.removeFile('room-x', 'a.png')).toBe(true)
    expect(fm.files.value.map(f => f.name)).toEqual(['b.png'])
    expect(fm.totalSize.value).toBe(50)
    expect(fm.removeFile('room-x', 'missing.png')).toBe(false)
  })

  it('clearRoomFiles는 해당 룸의 파일만 비운다', () => {
    fm.addFile({ name: 'a.png', url: 'u/a', size: 100, created: '2026-01-01T00:00:00Z', roomId: 'room-a' })
    fm.addFile({ name: 'b.png', url: 'u/b', size: 50, created: '2026-01-01T00:00:00Z', roomId: 'room-b' })

    fm.clearRoomFiles('room-a')

    expect(fm.files.value.map(f => f.roomId)).toEqual(['room-b'])
    expect(fm.totalSize.value).toBe(50)
  })
})

describe('useFileManager - uploadFiles (배치 presign + 제한 병렬 + 썸네일)', () => {
  let fm

  beforeEach(() => {
    vi.resetAllMocks()
    delete import.meta.env.VITE_MAX_FILE_SIZE_MB
    delete import.meta.env.VITE_MAX_ROOM_SIZE_MB
    fm = useFileManager()
    r2Service.getUploadUrls.mockImplementation(async (roomId, files) => presignFor(roomId, files))
    r2Service.putToPresignedUrl.mockResolvedValue(undefined)
    createImageThumbnail.mockResolvedValue(null)
  })

  it('presign은 한 번만 호출하고 파일마다 PUT 한 뒤 목록에 추가한다', async () => {
    const files = [makeFile('a.pdf', 'application/pdf'), makeFile('b.txt', 'text/plain')]
    const onStart = vi.fn(), onComplete = vi.fn(), onError = vi.fn()

    const summary = await fm.uploadFiles('room-x', files, { onStart, onComplete, onError })

    expect(r2Service.getUploadUrls).toHaveBeenCalledTimes(1)
    expect(r2Service.getUploadUrls).toHaveBeenCalledWith('room-x', [
      { fileName: 'a.pdf', contentType: 'application/pdf' },
      { fileName: 'b.txt', contentType: 'text/plain' }
    ])
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(2)
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledWith(
      'https://r2/put/room-x/a.pdf', files[0], 'application/pdf', expect.objectContaining({ onProgress: expect.any(Function) })
    )

    expect(summary.successCount).toBe(2)
    expect(summary.failCount).toBe(0)
    expect(onStart).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    expect(onComplete.mock.calls[0][1]).toMatchObject({ success: true, fileName: 'a.pdf', url: 'https://store/room-x/a.pdf', size: 10 })

    expect(fm.files.value.map(f => f.name).sort()).toEqual(['a.pdf', 'b.txt'])
    expect(fm.files.value.every(f => f.roomId === 'room-x')).toBe(true)
    expect(fm.totalSize.value).toBe(20)
  })

  it('진행률 콜백에 파일과 퍼센트를 전달한다', async () => {
    const file = makeFile('a.pdf', 'application/pdf')
    const onProgress = vi.fn()
    r2Service.putToPresignedUrl.mockImplementation(async (url, body, type, { onProgress: report }) => { report(40) })

    await fm.uploadFiles('room-x', [file], { onProgress })

    expect(onProgress).toHaveBeenCalledWith(file, 40)
  })

  it('이미지는 썸네일을 만들어 thumbUploadUrl로 함께 올리고, 썸네일이 없으면 원본만 올린다', async () => {
    const photo = makeFile('photo.png', 'image/png')
    const noThumb = makeFile('tiny.png', 'image/png')
    const thumbBlob = new Blob(['thumb'], { type: 'image/jpeg' })
    createImageThumbnail.mockImplementation(async (file) => (file === photo ? thumbBlob : null))

    await fm.uploadFiles('room-x', [photo, noThumb])

    expect(createImageThumbnail).toHaveBeenCalledTimes(2)
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledWith(
      'https://r2/put/thumbs/room-x/photo.png.jpg', thumbBlob, 'image/jpeg'
    )
    const thumbPuts = r2Service.putToPresignedUrl.mock.calls.filter(([url]) => url.includes('/thumbs/'))
    expect(thumbPuts).toHaveLength(1)
  })

  it('썸네일 업로드가 실패해도 원본 업로드는 성공으로 처리한다', async () => {
    const photo = makeFile('photo.png', 'image/png')
    createImageThumbnail.mockResolvedValue(new Blob(['thumb'], { type: 'image/jpeg' }))
    r2Service.putToPresignedUrl.mockImplementation(async (url) => {
      if (url.includes('/thumbs/')) throw new Error('thumb failed')
    })
    const onError = vi.fn()

    const summary = await fm.uploadFiles('room-x', [photo], { onError })

    expect(summary.successCount).toBe(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('검증에 실패한 파일은 presign 대상에서 빼고 onError로 보고하며 나머지는 진행한다', async () => {
    import.meta.env.VITE_MAX_FILE_SIZE_MB = '1'
    const empty = makeFile('empty.txt', 'text/plain', 0)
    const huge = makeFile('huge.bin', 'application/octet-stream', 1024 * 1024 + 1)
    const ok = makeFile('ok.txt', 'text/plain', 10)
    const onError = vi.fn()

    const summary = await fm.uploadFiles('room-x', [empty, huge, ok], { onError })

    expect(r2Service.getUploadUrls).toHaveBeenCalledWith('room-x', [{ fileName: 'ok.txt', contentType: 'text/plain' }])
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError.mock.calls[0][0]).toBe(empty)
    expect(onError.mock.calls[0][1].message).toContain('비어있습니다')
    expect(onError.mock.calls[1][0]).toBe(huge)
    expect(onError.mock.calls[1][1].message).toContain('MB를 초과할 수 없습니다')
    expect(summary.successCount).toBe(1)
    expect(summary.failCount).toBe(2)
    expect(fm.files.value.map(f => f.name)).toEqual(['ok.txt'])
  })

  it('presign 자체가 실패하면 모든 파일을 onError로 보고하고 목록은 바뀌지 않는다', async () => {
    r2Service.getUploadUrls.mockRejectedValue(new Error('presign down'))
    const files = [makeFile('a.txt', 'text/plain'), makeFile('b.txt', 'text/plain')]
    const onError = vi.fn()

    const summary = await fm.uploadFiles('room-x', files, { onError })

    expect(onError).toHaveBeenCalledTimes(2)
    expect(r2Service.putToPresignedUrl).not.toHaveBeenCalled()
    expect(summary.failCount).toBe(2)
    expect(fm.files.value).toEqual([])
  })

  it('PUT이 실패한 파일만 실패로 보고하고 나머지는 성공한다', async () => {
    const files = [makeFile('a.txt', 'text/plain'), makeFile('bad.txt', 'text/plain'), makeFile('c.txt', 'text/plain')]
    r2Service.putToPresignedUrl.mockImplementation(async (url) => {
      if (url.endsWith('/bad.txt')) throw new Error('R2 업로드 실패: 500')
    })
    const onError = vi.fn()

    const summary = await fm.uploadFiles('room-x', files, { onError })

    expect(summary.successCount).toBe(2)
    expect(summary.failCount).toBe(1)
    expect(onError).toHaveBeenCalledWith(files[1], expect.any(Error))
    expect(fm.files.value.map(f => f.name).sort()).toEqual(['a.txt', 'c.txt'])
  })

  it('동시에 진행 중인 PUT 수가 concurrency를 넘지 않는다', async () => {
    const files = [1, 2, 3, 4].map(i => makeFile(`f${i}.txt`, 'text/plain'))
    const gates = new Map()
    let active = 0
    let maxActive = 0
    r2Service.putToPresignedUrl.mockImplementation((url) => {
      active++
      maxActive = Math.max(maxActive, active)
      const gate = deferred()
      gates.set(url, gate)
      return gate.promise.finally(() => { active-- })
    })

    const tick = () => new Promise(resolve => setTimeout(resolve, 0))

    const run = fm.uploadFiles('room-x', files, { concurrency: 2 })

    // presign 이후 두 개만 시작되어야 한다
    await tick()
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(2)
    expect(active).toBe(2)

    // 첫 게이트를 풀면 세 번째 PUT이 시작되고 동시 실행은 여전히 2다
    const firstGate = gates.values().next().value
    firstGate.resolve()
    await tick()
    await tick()
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(3)
    expect(active).toBe(2)

    // 새로 생기는 게이트까지 모두 풀어주며 완료를 기다린다
    while (r2Service.putToPresignedUrl.mock.calls.length < 4 || active > 0) {
      for (const gate of gates.values()) gate.resolve()
      await tick()
    }
    await run

    expect(maxActive).toBe(2)
    expect(r2Service.putToPresignedUrl).toHaveBeenCalledTimes(4)
  })
})
