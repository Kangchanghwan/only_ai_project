import { describe, it, expect, vi, afterEach } from 'vitest'
import { preloadEngine, progressText, resolveFiles, keyFiles, isRecorded, readRecord, writeRecord, servedFromCache, RECORD_KEY } from './hwpEngine.js'

const BASE = 'https://hwp.example.org/'
const manifest = { files: [{ url: '/assets/a.part0.wasm', raw: 100, est: 40 }, { url: '/assets/a.part1.wasm', raw: 100, est: 40 }, { url: '/assets/b.js', raw: 100, est: 20 }] }
const body = (n) => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(n / 2)); c.enqueue(new Uint8Array(n / 2)); c.close() } })

function memStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }
}

afterEach(() => vi.unstubAllGlobals())

describe('hwpEngine', () => {
  it('manifest 는 편집기 출처에서 받고 루트 기준 주소를 그 출처로 풀어 받는다', async () => {
    const seenUrls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      seenUrls.push(String(url))
      if (String(url).endsWith('manifest.json')) return { json: async () => manifest }
      return { ok: true, body: body(100) }
    }))
    const seen = []
    const storage = memStorage()
    const r = await preloadEngine((p) => seen.push(p), { base: BASE, storage, perf: { getEntriesByName: () => [] } })
    expect(r.cached).toBe(false)
    expect(seenUrls[0]).toBe('https://hwp.example.org/manifest.json')
    expect(seenUrls.slice(1).sort()).toEqual(['https://hwp.example.org/assets/a.part0.wasm', 'https://hwp.example.org/assets/a.part1.wasm', 'https://hwp.example.org/assets/b.js'])
    const last = seen.at(-1)
    expect(last.loaded).toBe(300)
    expect(last.estTotal).toBe(100)
    expect(last.estLoaded).toBeCloseTo(100)
    expect(seen.every((p) => p.estLoaded <= p.estTotal + 1e-9)).toBe(true)
    // 끝까지 받은 주소가 기록된다
    expect(JSON.parse(storage.map.get(RECORD_KEY)).sort()).toEqual(seenUrls.slice(1).sort())
  })

  it('두 번째 방문: 엔진 wasm 이 모두 기록돼 있으면 받지 않는다', async () => {
    const storage = memStorage({ [RECORD_KEY]: JSON.stringify(['https://hwp.example.org/assets/a.part0.wasm', 'https://hwp.example.org/assets/a.part1.wasm']) })
    const f = vi.fn(async (url) => {
      if (String(url).endsWith('manifest.json')) return { json: async () => manifest }
      throw new Error('받으면 안 됨')
    })
    vi.stubGlobal('fetch', f)
    const cb = vi.fn()
    expect((await preloadEngine(cb, { base: BASE, storage })).cached).toBe(true)
    expect(cb).not.toHaveBeenCalled()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('wasm 한 조각만 기록돼 있으면 다시 받는다', async () => {
    const storage = memStorage({ [RECORD_KEY]: JSON.stringify(['https://hwp.example.org/assets/a.part0.wasm']) })
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).endsWith('manifest.json') ? { json: async () => manifest } : { ok: true, body: body(100) })))
    expect((await preloadEngine(() => {}, { base: BASE, storage, perf: { getEntriesByName: () => [] } })).cached).toBe(false)
  })

  it('중간에 끊긴 파일은 기록하지 않는다', async () => {
    const storage = memStorage()
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      if (u.endsWith('manifest.json')) return { json: async () => manifest }
      if (u.endsWith('part1.wasm')) return { ok: true, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.error(new Error('cut')) } }) }
      return { ok: true, body: body(100) }
    }))
    await preloadEngine(() => {}, { base: BASE, storage, perf: { getEntriesByName: () => [] } })
    const rec = JSON.parse(storage.map.get(RECORD_KEY))
    expect(rec).not.toContain('https://hwp.example.org/assets/a.part1.wasm')
    expect(rec).toContain('https://hwp.example.org/assets/a.part0.wasm')
  })

  it('Resource Timing transferSize 0 이면 이미 HTTP 캐시에 있던 것으로 본다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).endsWith('manifest.json') ? { json: async () => manifest } : { ok: true, body: body(100) })))
    const perf = { getEntriesByName: () => [{ transferSize: 0, decodedBodySize: 100 }] }
    const r = await preloadEngine(() => {}, { base: BASE, storage: memStorage(), perf })
    expect(r.fromHttpCache).toBe(true)
  })

  it('manifest를 못 읽어도 조용히 넘어간다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x') }))
    expect((await preloadEngine(() => {}, { base: BASE, storage: memStorage() })).cached).toBe(false)
  })

  it('예비(같은 출처) 경로 기준도 그대로 풀린다', () => {
    const files = resolveFiles({ files: [{ url: '/tools/hwp/studio/assets/x.wasm' }] }, 'http://localhost:5173/tools/hwp/studio/manifest.json')
    expect(files[0].url).toBe('http://localhost:5173/tools/hwp/studio/assets/x.wasm')
  })

  it('keyFiles / isRecorded / 기록 정리', () => {
    const files = resolveFiles(manifest, BASE + 'manifest.json')
    expect(keyFiles(files).map((f) => f.url)).toEqual(['https://hwp.example.org/assets/a.part0.wasm', 'https://hwp.example.org/assets/a.part1.wasm'])
    expect(keyFiles([{ url: 'https://x/a.js' }]).length).toBe(1)
    expect(isRecorded(files, [])).toBe(false)
    expect(isRecorded([], ['x'])).toBe(false)
    const st = memStorage({ [RECORD_KEY]: JSON.stringify(['https://hwp.example.org/assets/old.wasm', 'https://hwp.example.org/assets/b.js']) })
    writeRecord(st, files, ['https://hwp.example.org/assets/a.part0.wasm'])
    expect(readRecord(st).sort()).toEqual(['https://hwp.example.org/assets/a.part0.wasm', 'https://hwp.example.org/assets/b.js'])
    expect(readRecord(memStorage({ [RECORD_KEY]: '{bad' }))).toEqual([])
    expect(readRecord(null)).toEqual([])
  })

  it('servedFromCache', () => {
    expect(servedFromCache('u', { getEntriesByName: () => [{ transferSize: 300, decodedBodySize: 100 }, { transferSize: 0, decodedBodySize: 100 }] })).toBe(true)
    expect(servedFromCache('u', { getEntriesByName: () => [{ transferSize: 300, decodedBodySize: 100 }] })).toBe(false)
    expect(servedFromCache('u', { getEntriesByName: () => [{ transferSize: 0, decodedBodySize: 0 }] })).toBe(false)
    expect(servedFromCache('u', { getEntriesByName: () => [] })).toBe(false)
    expect(servedFromCache('u', null)).toBe(false)
  })

  it('문구', () => {
    expect(progressText({ phase: 'download', estLoaded: 4.2 * 1048576, estTotal: 10.7 * 1048576 })).toBe('편집 엔진 받는 중 4.2MB / 10.7MB (처음 한 번만)')
    expect(progressText({ phase: 'render' })).toBe('문서 그리는 중…')
  })
})
