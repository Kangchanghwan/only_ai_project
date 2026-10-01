import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  splitParts,
  uploadConcurrency,
  isMultipartFile,
  multipartUpload,
  fingerprintOf,
  pruneStaleUploads,
  MULTIPART_THRESHOLD,
  DEFAULT_PART_SIZE,
  MAX_SIGN_BATCH,
  SIGN_TTL_MS,
} from './multipartUploader.js'

const MB = 1024 * 1024
const P = 10 // 테스트용 작은 파트 크기 (서버가 partSize를 내려주므로 가능)

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size },
    _map: m,
  }
}

function fakeFile(size, name = 'big.bin') {
  return { name, size, type: 'video/mp4', lastModified: 1700000000000, slice: (start, end) => ({ start, end, size: end - start }) }
}

function makeApi({ partCount, parts = [] } = {}) {
  return {
    create: vi.fn(async (_r, { size }) => ({ uploadId: 'U1', key: 'room/big.bin', partSize: P, partCount: partCount ?? Math.ceil(size / P) })),
    sign: vi.fn(async (_r, { partNumbers }) => ({ urls: partNumbers.map((n) => ({ partNumber: n, url: `https://r2/u?p=${n}` })) })),
    parts: vi.fn(async () => ({ parts })),
    complete: vi.fn(async (_r, { parts: ps }) => ({ fileName: 'big.bin', fileUrl: 'https://store/room/big.bin', size: ps.length })),
    abort: vi.fn(async () => ({ success: true })),
  }
}

const okPut = () => vi.fn(async (url) => `"etag-${new URL(url).searchParams.get('p')}"`)
const instantSleep = () => vi.fn(async () => {})

describe('분할/상수', () => {
  it('마지막 파트는 나머지 크기', () => {
    const parts = splitParts(2 * DEFAULT_PART_SIZE + 5)
    expect(parts).toHaveLength(3)
    expect(parts.map((p) => p.length)).toEqual([DEFAULT_PART_SIZE, DEFAULT_PART_SIZE, 5])
    expect(parts[2]).toMatchObject({ partNumber: 3, start: 2 * DEFAULT_PART_SIZE, end: 2 * DEFAULT_PART_SIZE + 5 })
  })

  it('파트 크기의 정수배면 마지막 파트도 꽉 찬다', () => {
    const parts = splitParts(3 * DEFAULT_PART_SIZE)
    expect(parts).toHaveLength(3)
    expect(parts[2].length).toBe(DEFAULT_PART_SIZE)
  })

  it('5GB는 64MiB 80조각', () => {
    expect(splitParts(5120 * MB)).toHaveLength(80)
  })

  it('100MB 경계: 100MB 이하는 단일, 초과는 멀티파트', () => {
    expect(MULTIPART_THRESHOLD).toBe(100 * MB)
    expect(isMultipartFile(100 * MB)).toBe(false)
    expect(isMultipartFile(100 * MB + 1)).toBe(true)
  })

  it('동시성: 모바일 UA는 2, 데스크톱은 4', () => {
    expect(uploadConcurrency('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe(2)
    expect(uploadConcurrency('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe(2)
    expect(uploadConcurrency('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')).toBe(4)
  })
})

describe('multipartUpload', () => {
  afterEach(() => vi.restoreAllMocks())

  it('동시 업로드 수가 concurrency를 넘지 않는다', async () => {
    const api = makeApi()
    let active = 0
    let max = 0
    const putPart = vi.fn(async (url) => {
      active++
      max = Math.max(max, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    const res = await multipartUpload('room', fakeFile(P * 9), { api, concurrency: 3, deps: { putPart, storage: memoryStorage() } })
    expect(max).toBe(3)
    expect(putPart).toHaveBeenCalledTimes(9)
    expect(res).toMatchObject({ parts: 9, retries: 0, resumed: false })
    expect(api.complete.mock.calls[0][1].parts.map((p) => p.PartNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('파트 슬라이스는 마지막 파트가 나머지 크기이고 sign은 배치(최대 20개)로 요청한다', async () => {
    const api = makeApi()
    const putPart = vi.fn(async (url) => `"e${new URL(url).searchParams.get('p')}"`)
    await multipartUpload('room', fakeFile(P * 44 + 3), { api, concurrency: 4, deps: { putPart, storage: memoryStorage() } })
    const last = putPart.mock.calls.find(([url]) => url.endsWith('p=45'))
    expect(last[1]).toMatchObject({ start: P * 44, end: P * 44 + 3 })
    for (const [, body] of api.sign.mock.calls) expect(body.partNumbers.length).toBeLessThanOrEqual(MAX_SIGN_BATCH)
    expect(api.sign.mock.calls.length).toBeLessThan(45)
  })

  it('서명 URL이 50분 넘게 지나면 재서명한다', async () => {
    const api = makeApi()
    let t = 1_000_000
    const putPart = vi.fn(async (url) => {
      t += SIGN_TTL_MS + 1000 // 한 파트마다 시간이 크게 흐른다
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    await multipartUpload('room', fakeFile(P * 3), { api, concurrency: 1, deps: { putPart, storage: memoryStorage(), now: () => t } })
    expect(api.sign.mock.calls.length).toBeGreaterThan(1)
  })

  it('파트 실패는 1s,2s 백오프로 재시도하고 성공하면 retries를 집계한다', async () => {
    const api = makeApi()
    const sleep = instantSleep()
    let calls = 0
    const putPart = vi.fn(async (url) => {
      calls++
      if (calls <= 2) throw Object.assign(new Error('boom'), { network: true })
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    const res = await multipartUpload('room', fakeFile(P), { api, concurrency: 1, deps: { putPart, sleep, storage: memoryStorage() } })
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000])
    expect(res.retries).toBe(2)
  })

  it('재시도 4회를 모두 소진하면 실패하고(1/2/4/8초) 이어올리기용 저장 항목은 남는다', async () => {
    const api = makeApi()
    const sleep = instantSleep()
    const storage = memoryStorage()
    const putPart = vi.fn(async () => { throw Object.assign(new Error('boom'), { network: true }) })
    const file = fakeFile(P * 2)
    await expect(multipartUpload('room', file, { api, concurrency: 1, deps: { putPart, sleep, storage } })).rejects.toMatchObject({ partsDone: 0 })
    expect(putPart).toHaveBeenCalledTimes(5)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000, 8000])
    expect(storage.getItem(fingerprintOf('room', file))).not.toBeNull()
    expect(api.abort).not.toHaveBeenCalled()
  })

  it('403(서명 만료)이면 다음 시도 전에 재서명한다', async () => {
    const api = makeApi()
    let calls = 0
    const putPart = vi.fn(async (url) => {
      calls++
      if (calls === 1) throw Object.assign(new Error('expired'), { status: 403 })
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    await multipartUpload('room', fakeFile(P), { api, concurrency: 1, deps: { putPart, sleep: instantSleep(), storage: memoryStorage() } })
    expect(api.sign).toHaveBeenCalledTimes(2)
  })

  it('이어올리기: 저장된 업로드의 완료 파트는 건너뛰고 onResume을 호출한다', async () => {
    const file = fakeFile(P * 4)
    const storage = memoryStorage({
      [fingerprintOf('room', file)]: JSON.stringify({ uploadId: 'OLD', key: 'room/big.bin', partSize: P, createdAt: Date.now() - 1000 }),
    })
    const api = makeApi({
      parts: [
        { PartNumber: 1, ETag: '"a"', Size: P },
        { PartNumber: 2, ETag: '"b"', Size: P },
      ],
    })
    const putPart = okPut()
    const onResume = vi.fn()
    const onProgress = vi.fn()
    const res = await multipartUpload('room', file, { api, concurrency: 2, onResume, onProgress, deps: { putPart, storage } })

    expect(api.create).not.toHaveBeenCalled()
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(putPart).toHaveBeenCalledTimes(2)
    expect(api.sign.mock.calls.flatMap(([, b]) => b.partNumbers).sort()).toEqual([3, 4])
    expect(api.sign.mock.calls[0][1].uploadId).toBe('OLD')
    expect(api.complete.mock.calls[0][1].parts).toEqual([
      { PartNumber: 1, ETag: '"a"' },
      { PartNumber: 2, ETag: '"b"' },
      { PartNumber: 3, ETag: '"etag-3"' },
      { PartNumber: 4, ETag: '"etag-4"' },
    ])
    expect(onProgress.mock.calls[0][0]).toBe(50) // 시작 시점에 이미 50%
    expect(res.resumed).toBe(true)
    expect(storage.getItem(fingerprintOf('room', file))).toBeNull() // 완료 후 삭제
  })

  it('크기가 다른 파트는 완료로 치지 않고 다시 올린다', async () => {
    const file = fakeFile(P * 2)
    const storage = memoryStorage({
      [fingerprintOf('room', file)]: JSON.stringify({ uploadId: 'OLD', key: 'room/big.bin', partSize: P, createdAt: Date.now() }),
    })
    const api = makeApi({ parts: [{ PartNumber: 1, ETag: '"a"', Size: P - 1 }] })
    const putPart = okPut()
    await multipartUpload('room', file, { api, concurrency: 1, deps: { putPart, storage } })
    expect(putPart).toHaveBeenCalledTimes(2)
  })

  it('서버에서 업로드가 사라졌으면(parts 실패) 새로 시작한다', async () => {
    const file = fakeFile(P * 2)
    const storage = memoryStorage({
      [fingerprintOf('room', file)]: JSON.stringify({ uploadId: 'GONE', key: 'room/big.bin', partSize: P, createdAt: Date.now() }),
    })
    const api = makeApi()
    api.parts.mockRejectedValue(Object.assign(new Error('nf'), { status: 404, code: 'UPLOAD_NOT_FOUND' }))
    const onResume = vi.fn()
    const res = await multipartUpload('room', file, { api, concurrency: 2, onResume, deps: { putPart: okPut(), storage } })
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(onResume).not.toHaveBeenCalled()
    expect(res.resumed).toBe(false)
  })

  it('24시간 지난 저장 항목은 무시하고 삭제한다', async () => {
    const file = fakeFile(P * 2)
    const key = fingerprintOf('room', file)
    const storage = memoryStorage({
      [key]: JSON.stringify({ uploadId: 'OLD', key: 'room/big.bin', partSize: P, createdAt: Date.now() - 25 * 3600 * 1000 }),
      'mpu:other|x|1|1': JSON.stringify({ uploadId: 'Z', key: 'k', partSize: P, createdAt: 0 }),
      unrelated: 'keep',
    })
    pruneStaleUploads(storage)
    expect(storage.getItem(key)).toBeNull()
    expect(storage.getItem('mpu:other|x|1|1')).toBeNull()
    expect(storage.getItem('unrelated')).toBe('keep')
  })

  it('취소하면 서버 abort를 호출하고 저장 항목을 지운다', async () => {
    const api = makeApi()
    const storage = memoryStorage()
    const ctrl = new AbortController()
    const file = fakeFile(P * 6)
    const putPart = vi.fn(async (url) => {
      ctrl.abort()
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    await expect(
      multipartUpload('room', file, { api, concurrency: 1, signal: ctrl.signal, deps: { putPart, storage } })
    ).rejects.toMatchObject({ code: 'UPLOAD_CANCELED' })
    expect(api.abort).toHaveBeenCalledTimes(1)
    expect(api.complete).not.toHaveBeenCalled()
    expect(storage.getItem(fingerprintOf('room', file))).toBeNull()
  })

  it('SIZE_MISMATCH로 완료가 거절되면 저장 항목을 지운다', async () => {
    const api = makeApi()
    api.complete.mockRejectedValue(Object.assign(new Error('mismatch'), { code: 'SIZE_MISMATCH' }))
    const storage = memoryStorage()
    const file = fakeFile(P)
    await expect(multipartUpload('room', file, { api, concurrency: 1, deps: { putPart: okPut(), storage } })).rejects.toMatchObject({ code: 'SIZE_MISMATCH' })
    expect(storage.getItem(fingerprintOf('room', file))).toBeNull()
  })

  it('진행률은 파트 진행 바이트를 합산한다', async () => {
    const api = makeApi()
    const seen = []
    const putPart = vi.fn(async (url, _blob, { onProgress }) => {
      onProgress(P / 2)
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    await multipartUpload('room', fakeFile(P * 2), { api, concurrency: 1, onProgress: (p) => seen.push(p), deps: { putPart, storage: memoryStorage() } })
    expect(seen).toEqual([0, 25, 50, 75, 100])
  })
})

describe('오프라인 일시정지', () => {
  let online = true
  beforeEach(() => {
    online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  })
  afterEach(() => vi.restoreAllMocks())

  it('offline이면 PUT을 시작하지 않고 online 이벤트에 재개한다', async () => {
    online = false
    const api = makeApi()
    const putPart = okPut()
    const promise = multipartUpload('room', fakeFile(P * 2), { api, concurrency: 2, deps: { putPart, storage: memoryStorage() } })
    await new Promise((r) => setTimeout(r, 30))
    expect(putPart).not.toHaveBeenCalled()

    online = true
    window.dispatchEvent(new Event('online'))
    const res = await promise
    expect(putPart).toHaveBeenCalledTimes(2)
    expect(res.parts).toBe(2)
  })

  it('전송 중 오프라인으로 실패해도 재시도 횟수를 소모하지 않고 복귀 후 재개한다', async () => {
    const api = makeApi()
    const sleep = instantSleep()
    let calls = 0
    const putPart = vi.fn(async (url) => {
      calls++
      if (calls === 1) {
        online = false
        throw Object.assign(new Error('net'), { network: true })
      }
      return `"e${new URL(url).searchParams.get('p')}"`
    })
    const promise = multipartUpload('room', fakeFile(P), { api, concurrency: 1, deps: { putPart, sleep, storage: memoryStorage() } })
    await new Promise((r) => setTimeout(r, 30))
    expect(calls).toBe(1)
    online = true
    window.dispatchEvent(new Event('online'))
    const res = await promise
    expect(res.retries).toBe(0)
    expect(sleep).not.toHaveBeenCalled()
  })
})

describe('취소 (UI 취소 버튼 경로)', () => {
  const FP = () => fingerprintOf('room', fakeFile(40))

  it('진행 중 파트 PUT을 abort 신호로 끊고, 서버 abort 호출 + mpu 항목 삭제', async () => {
    const api = makeApi()
    const storage = memoryStorage()
    const ctrl = new AbortController()
    const putPart = vi.fn((url, _blob, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { code: 'UPLOAD_CANCELED' })))
    }))
    const p = multipartUpload('room', fakeFile(40), { api, signal: ctrl.signal, concurrency: 2, deps: { putPart, storage, sleep: instantSleep() } })
    await vi.waitFor(() => expect(putPart).toHaveBeenCalled())
    expect(storage.getItem(FP())).not.toBeNull()
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ code: 'UPLOAD_CANCELED' })
    expect(api.abort).toHaveBeenCalledTimes(1)
    expect(api.complete).not.toHaveBeenCalled()
    expect(storage.getItem(FP())).toBeNull()
  })

  it('서버 abort가 실패해도 취소로 끝나고 저장 항목은 지워진다', async () => {
    const api = makeApi()
    api.abort = vi.fn(async () => { throw new Error('500') })
    const storage = memoryStorage()
    const ctrl = new AbortController()
    const putPart = vi.fn(() => new Promise(() => {})) // 영원히 대기
    const p = multipartUpload('room', fakeFile(40), { api, signal: ctrl.signal, concurrency: 1, deps: { putPart, storage, sleep: instantSleep() } })
    await vi.waitFor(() => expect(putPart).toHaveBeenCalled())
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ code: 'UPLOAD_CANCELED' })
    expect(api.abort).toHaveBeenCalled()
    expect(storage.getItem(FP())).toBeNull()
  })

  it('complete 요청을 보낸 뒤의 취소는 무시하고 완료 처리한다', async () => {
    const api = makeApi()
    const ctrl = new AbortController()
    let release
    api.complete = vi.fn(() => new Promise((r) => { release = () => r({ fileName: 'big.bin', fileUrl: 'u', size: 40 }) }))
    const onCommit = vi.fn()
    const p = multipartUpload('room', fakeFile(40), { api, signal: ctrl.signal, onCommit, deps: { putPart: okPut(), storage: memoryStorage(), sleep: instantSleep() } })
    await vi.waitFor(() => expect(api.complete).toHaveBeenCalled())
    expect(onCommit).toHaveBeenCalledTimes(1)
    ctrl.abort()
    release()
    await expect(p).resolves.toMatchObject({ fileName: 'big.bin' })
    expect(api.abort).not.toHaveBeenCalled()
  })
})
