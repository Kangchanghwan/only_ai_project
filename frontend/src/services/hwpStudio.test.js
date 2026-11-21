import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveEditor, toOrigin, DEFAULT_EDITOR_ORIGIN, LEGACY_STUDIO_PATH, BAR_COLORS, barColors, applyBarColors, hostTheme, applyStudioTheme, watchHostTheme, watchDirty } from './hwpStudio.js'

const loc = (href) => { const u = new URL(href); return { hostname: u.hostname, search: u.search, origin: u.origin } }

afterEach(() => { vi.useRealTimers() })

describe('편집기 주소 고르기', () => {
  it('기본은 운영 편집기 출처', () => {
    const c = resolveEditor({ location: loc('https://www.clipboardapp.org/tools/hwp/') })
    expect(DEFAULT_EDITOR_ORIGIN).toBe('https://hwp.clipboardapp.org')
    expect(c).toEqual({ studioUrl: 'https://hwp.clipboardapp.org/', base: 'https://hwp.clipboardapp.org/', origin: 'https://hwp.clipboardapp.org', crossOrigin: true })
  })
  it('빌드 환경 변수가 있으면 그 출처 (경로는 버리고 출처만)', () => {
    expect(resolveEditor({ env: 'https://hwp-staging.example.org/x/', location: loc('https://www.clipboardapp.org/') }).studioUrl).toBe('https://hwp-staging.example.org/')
  })
  it('환경 변수가 http(s) 주소가 아니면 기본값', () => {
    expect(resolveEditor({ env: '/tools/hwp/studio/' }).origin).toBe(DEFAULT_EDITOR_ORIGIN)
    expect(resolveEditor({ env: 'javascript:alert(1)' }).origin).toBe(DEFAULT_EDITOR_ORIGIN)
  })
  it('운영 도메인에서는 ?hed= 를 무시한다', () => {
    expect(resolveEditor({ location: loc('https://www.clipboardapp.org/tools/hwp/?hed=same') }).studioUrl).toBe('https://hwp.clipboardapp.org/')
    expect(resolveEditor({ location: loc('https://x.vercel.app/tools/hwp/?hed=https://evil.example') }).origin).toBe(DEFAULT_EDITOR_ORIGIN)
  })
  it('localhost 에서만 ?hed=same 으로 예전 같은 출처 빌드', () => {
    const c = resolveEditor({ location: loc('http://localhost:5173/tools/hwp/?hed=same') })
    expect(c).toEqual({ studioUrl: LEGACY_STUDIO_PATH, base: 'http://localhost:5173/tools/hwp/studio/', origin: 'http://localhost:5173', crossOrigin: false })
  })
  it('localhost 에서 ?hed=<출처> 로 다른 편집기', () => {
    expect(resolveEditor({ location: loc('http://127.0.0.1:4173/tools/hwp/?hed=http://localhost:8788') }).studioUrl).toBe('http://localhost:8788/')
    expect(resolveEditor({ location: loc('http://localhost:5173/?hed=garbage') }).origin).toBe(DEFAULT_EDITOR_ORIGIN)
  })
  it('toOrigin', () => {
    expect(toOrigin('https://a.b/c?d')).toBe('https://a.b')
    expect(toOrigin('')).toBe(null)
    expect(toOrigin('ftp://a.b')).toBe(null)
  })
})

describe('테마', () => {
  it('색표: 라이트/다크 x flat', () => {
    expect(Object.keys(BAR_COLORS).sort()).toEqual(['dark/flat', 'light/flat'])
    expect(barColors('light')).toEqual({ bg: '#ffffff', fg: '#333333', bd: '#e9ecf1', bdW: '1px' })
    expect(barColors('dark')).toEqual({ bg: '#2f343c', fg: '#eef1f5', bd: '#454d58', bdW: '1px' })
    expect(barColors('dark', 'classic')).toBe(null)
  })
  it('applyBarColors 는 변수를 넣고, 없는 조합이면 지운다', () => {
    const el = document.createElement('div')
    expect(applyBarColors(el, 'dark')).toBe(true)
    expect(el.style.getPropertyValue('--bar-bg')).toBe('#2f343c')
    expect(el.style.getPropertyValue('--bar-bd-w')).toBe('1px')
    expect(applyBarColors(el, 'dark', 'nope')).toBe(false)
    expect(el.style.getPropertyValue('--bar-bg')).toBe('')
    expect(applyBarColors(null, 'dark')).toBe(false)
  })
  it('hostTheme: light 가 아니면 dark', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(hostTheme()).toBe('light')
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(hostTheme()).toBe('dark')
    document.documentElement.removeAttribute('data-theme')
    expect(hostTheme()).toBe('dark')
  })
  it('applyStudioTheme 는 스킨과 테마 커맨드를 보낸다', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    expect(await applyStudioTheme({ commands: { execute } }, 'light')).toBe(true)
    expect(execute.mock.calls.map((c) => c[0])).toEqual(['view:skin-flat', 'view:theme-light'])
  })
  it('applyStudioTheme 는 실패해도 던지지 않는다', async () => {
    const execute = vi.fn(async (id) => { if (id === 'view:skin-flat') throw new Error('x'); return { ok: false, reason: 'r' } })
    expect(await applyStudioTheme({ commands: { execute } }, 'dark')).toBe(false)
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it('watchHostTheme 는 data-theme 가 바뀔 때만 알린다', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const cb = vi.fn()
    const stop = watchHostTheme(cb)
    document.documentElement.setAttribute('data-theme', 'light')
    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledWith('light')
    stop()
    document.documentElement.setAttribute('data-theme', 'dark')
    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('변경 표시 (getDocumentState 확인)', () => {
  const studioWith = (states) => {
    let i = 0
    return { getDocumentState: vi.fn(async () => states[Math.min(i++, states.length - 1)]) }
  }
  it('타이핑으로 changeSeq 가 오르면 변경됨', async () => {
    const st = studioWith([{ documentEpoch: 1, changeSeq: 5, dirty: false }, { documentEpoch: 1, changeSeq: 5, dirty: false }, { documentEpoch: 1, changeSeq: 6, dirty: false }])
    const on = vi.fn()
    const w = watchDirty(st, on, { intervalMs: 1e9 })
    await w.reset()
    expect(await w.check()).toBe(false)
    expect(on).not.toHaveBeenCalled()
    expect(await w.check()).toBe(true)
    expect(on).toHaveBeenCalledWith(true)
    w.stop()
  })
  it('dirty 가 true 면 변경됨, 저장 뒤 reset 하면 다시 깨끗', async () => {
    const st = studioWith([{ documentEpoch: 1, changeSeq: 0, dirty: false }, { documentEpoch: 1, changeSeq: 0, dirty: true }, { documentEpoch: 1, changeSeq: 3, dirty: false }, { documentEpoch: 1, changeSeq: 3, dirty: false }])
    const on = vi.fn()
    const w = watchDirty(st, on, { intervalMs: 1e9 })
    await w.reset()
    expect(await w.check()).toBe(true)
    await w.reset()
    expect(await w.check()).toBe(false)
    w.stop()
  })
  it('새 문서(epoch 변경)는 기준을 다시 잡는다', async () => {
    const st = studioWith([{ documentEpoch: 1, changeSeq: 9, dirty: false }, { documentEpoch: 2, changeSeq: 0, dirty: false }])
    const w = watchDirty(st, () => {}, { intervalMs: 1e9 })
    await w.reset()
    expect(await w.check()).toBe(false)
    w.stop()
  })
  it('보이지 않을 때는 묻지 않는다', async () => {
    const st = studioWith([{ documentEpoch: 1, changeSeq: 0, dirty: false }])
    const w = watchDirty(st, () => {}, { intervalMs: 1e9, active: () => false })
    expect(await w.check()).toBe(null)
    expect(st.getDocumentState).not.toHaveBeenCalled()
    w.stop()
  })
  it('주기적으로 확인하고 stop 뒤에는 멈춘다', async () => {
    vi.useFakeTimers()
    const st = studioWith([{ documentEpoch: 1, changeSeq: 0, dirty: false }])
    const w = watchDirty(st, () => {}, { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(3100)
    const n = st.getDocumentState.mock.calls.length
    expect(n).toBe(3)
    w.stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(st.getDocumentState.mock.calls.length).toBe(n)
  })
})
