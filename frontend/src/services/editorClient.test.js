import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createEditorClient, EditorError } from './editorClient'

const ORIGIN = 'https://office.clipboardapp.org'
let frameWin, client, fakeWin, listener

beforeEach(() => {
  vi.useFakeTimers()
  frameWin = { postMessage: vi.fn() }
  listener = null
  fakeWin = { addEventListener: (_, fn) => { listener = fn }, removeEventListener: vi.fn() }
  client = createEditorClient({ getWindow: () => frameWin, origin: ORIGIN + '/', win: fakeWin })
})
afterEach(() => { client.destroy(); vi.useRealTimers() })

const send = (data, o = {}) => listener({ origin: ORIGIN, source: frameWin, data, ...o })
const lastReq = () => frameWin.postMessage.mock.calls.at(-1)

describe('editorClient', () => {
  it('요청은 규약 모양 + 편집기 출처로, 바이트는 transfer 로', async () => {
    const buf = new ArrayBuffer(8)
    const p = client.open('a.docx', buf)
    const [msg, target, transfer] = lastReq()
    expect(target).toBe(ORIGIN)
    expect(msg).toMatchObject({ cbEdit: 1, method: 'open', args: { name: 'a.docx', bytes: buf } })
    expect(typeof msg.id).toBe('string')
    expect(transfer).toEqual([buf])
    send({ cbEdit: 1, id: msg.id, ok: true, result: { pages: 3 } })
    await expect(p).resolves.toEqual({ pages: 3 })
  })
  it('오류 응답은 code 가 있는 EditorError', async () => {
    const p = client.export()
    const { id } = lastReq()[0]
    send({ cbEdit: 1, id, ok: false, error: { code: 'NO_DOCUMENT', message: 'x' } })
    await expect(p).rejects.toMatchObject({ name: 'EditorError', code: 'NO_DOCUMENT' })
    expect(lastReq()[0].args).toEqual({})
  })
  it('export format 전달', () => {
    client.export('hwpx').catch(() => {})
    expect(lastReq()[0].args).toEqual({ format: 'hwpx' })
  })
  it('잘못된 출처·source·cbEdit 아닌 메시지는 무시', async () => {
    const p = client.markSaved()
    const { id } = lastReq()[0]
    const res = { cbEdit: 1, id, ok: true, result: {} }
    send(res, { origin: 'https://evil.example' })
    send(res, { source: {} })
    send({ ...res, cbEdit: 2 })
    send({ id, ok: true, result: {} })
    let settled = false
    p.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    send(res)
    await expect(p).resolves.toEqual({})
  })
  it('시간 초과: open 120초, export 60초, 그 밖 10초', async () => {
    const o = client.open('a.hwp', new ArrayBuffer(1)); o.catch(() => {})
    const e = client.export(); e.catch(() => {})
    const m = client.state(); m.catch(() => {})
    vi.advanceTimersByTime(10000)
    await expect(m).rejects.toMatchObject({ code: 'TIMEOUT' })
    vi.advanceTimersByTime(50000)
    await expect(e).rejects.toMatchObject({ code: 'TIMEOUT' })
    vi.advanceTimersByTime(60000)
    await expect(o).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
  it('ready: 이벤트 전달, 늦게 기다려도 받고, 120초 지나면 TIMEOUT', async () => {
    const onReady = vi.fn()
    client.on('ready', onReady)
    const early = client.whenReady()
    send({ cbEdit: 1, event: 'ready', editor: 'office', chrome: { bg: '#fff', fg: '#000', border: '#ccc' } })
    await expect(early).resolves.toMatchObject({ editor: 'office' })
    expect(onReady).toHaveBeenCalledOnce()
    await expect(client.whenReady()).resolves.toMatchObject({ editor: 'office' })
  })
  it('ready 가 안 오면 120초 뒤 TIMEOUT', async () => {
    const p = client.whenReady()
    p.catch(() => {})
    vi.advanceTimersByTime(120000)
    await expect(p).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
  it('dirty / chrome / saveRequest / error 이벤트', () => {
    const got = {}
    for (const n of ['dirty', 'chrome', 'saveRequest', 'error']) client.on(n, (d) => { got[n] = d })
    send({ cbEdit: 1, event: 'dirty', dirty: true })
    send({ cbEdit: 1, event: 'chrome', chrome: { bg: '#111' } })
    send({ cbEdit: 1, event: 'saveRequest' })
    send({ cbEdit: 1, event: 'error', code: 'X', message: 'm' })
    expect(got.dirty.dirty).toBe(true)
    expect(got.chrome.chrome.bg).toBe('#111')
    expect(got.saveRequest).toBeTruthy()
    expect(got.error.code).toBe('X')
  })
  it('잘못된 출처의 이벤트는 구독자에게 가지 않는다', () => {
    const fn = vi.fn()
    client.on('dirty', fn)
    send({ cbEdit: 1, event: 'dirty', dirty: true }, { origin: 'https://evil.example' })
    expect(fn).not.toHaveBeenCalled()
  })
  it('destroy 하면 대기 중 요청이 거절되고 리스너를 뗀다', async () => {
    const p = client.export()
    client.destroy()
    await expect(p).rejects.toBeInstanceOf(EditorError)
    expect(fakeWin.removeEventListener).toHaveBeenCalled()
  })
})
