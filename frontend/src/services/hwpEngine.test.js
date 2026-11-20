import { describe, it, expect, vi, afterEach } from 'vitest'
import { preloadEngine, progressText } from './hwpEngine.js'

const manifest = { files: [{ url: '/s/a.wasm', raw: 100, est: 40 }, { url: '/s/b.js', raw: 100, est: 20 }] }
const body = (n) => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(n / 2)); c.enqueue(new Uint8Array(n / 2)); c.close() } })

afterEach(() => vi.unstubAllGlobals())

describe('hwpEngine', () => {
  it('manifest 파일을 받으며 진행률(원본 기준, 전송량 추정으로 표시)을 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      if (String(url).endsWith('manifest.json')) return { json: async () => manifest }
      if (opts?.cache === 'only-if-cached') throw new TypeError('not cached')
      return { ok: true, body: body(100) }
    }))
    const seen = []
    const r = await preloadEngine((p) => seen.push(p))
    expect(r.cached).toBe(false)
    const last = seen.at(-1)
    expect(last.loaded).toBe(200)
    expect(last.estTotal).toBe(60)
    expect(last.estLoaded).toBeCloseTo(60)
    expect(seen.every((p) => p.estLoaded <= p.estTotal + 1e-9)).toBe(true)
  })
  it('이미 캐시에 있으면 받지 않는다', async () => {
    const f = vi.fn(async (url, opts) => {
      if (String(url).endsWith('manifest.json')) return { json: async () => manifest }
      if (opts?.cache === 'only-if-cached') return { ok: true, body: { cancel() {} } }
      throw new Error('받으면 안 됨')
    })
    vi.stubGlobal('fetch', f)
    const cb = vi.fn()
    expect((await preloadEngine(cb)).cached).toBe(true)
    expect(cb).not.toHaveBeenCalled()
  })
  it('manifest를 못 읽어도 조용히 넘어간다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x') }))
    expect((await preloadEngine(() => {})).cached).toBe(false)
  })
  it('문구', () => {
    expect(progressText({ phase: 'download', estLoaded: 4.2 * 1048576, estTotal: 10.7 * 1048576 })).toBe('편집 엔진 받는 중 4.2MB / 10.7MB (처음 한 번만)')
    expect(progressText({ phase: 'render' })).toBe('문서 그리는 중…')
  })
})
