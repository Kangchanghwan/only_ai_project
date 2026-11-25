import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initHost } from './host.js'

const html = readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8')
const bodyHtml = html.split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '')

function fakeClient() {
  const handlers = {}
  const c = {
    on: (ev, fn) => { handlers[ev] = fn; return () => {} },
    whenReady: vi.fn(async () => ({ chrome: { bg: '#111', fg: '#eee', border: '#333' } })),
    open: vi.fn(async () => ({ pages: 1 })),
    export: vi.fn(async (format) => ({ bytes: new Uint8Array([9, 9]).buffer, ext: format || 'hwpx', mime: 'application/octet-stream' })),
    markSaved: vi.fn(async () => ({})),
    setTheme: vi.fn(async () => ({})),
    destroy: vi.fn(),
    _emit: (ev, d) => handlers[ev]?.(d),
  }
  return c
}

const file = (name = '보고서.hwpx') => new File([new Uint8Array([1, 2, 3])], name)
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('/tools/hwp/ 호스트', () => {
  let client, track, download, navigate, store, host
  beforeEach(() => {
    document.body.className = ''
    document.body.innerHTML = bodyHtml
    client = fakeClient()
    track = vi.fn()
    download = vi.fn()
    navigate = vi.fn()
    store = { put: vi.fn(async () => 'id-123') }
    host = initHost({ origin: 'https://hwp.example.test', createClient: () => client, track, download, navigate, store })
  })

  it('파일을 고르기 전에는 iframe 이 없다 (편집기 출처로 가는 요청 0)', () => {
    expect(document.querySelector('iframe')).toBeNull()
    expect(host.isOpen()).toBe(false)
    expect(client.whenReady).not.toHaveBeenCalled()
  })

  it('.hwp/.hwpx 가 아니면 열지 않고 iframe 도 만들지 않는다', async () => {
    await host.openFile(file('a.docx'))
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.getElementById('status').textContent).toContain('.hwp')
  })

  it('파일을 고르면 iframe 생성 → ready 대기 → open(이름, 바이트) → tool_open(ext)', async () => {
    await host.openFile(file())
    const f = document.querySelector('iframe')
    expect(f.src).toMatch(/^https:\/\/hwp\.example\.test\/\?embed=cs&theme=(dark|light)$/)
    expect(client.whenReady).toHaveBeenCalled()
    expect(client.open).toHaveBeenCalledTimes(1)
    expect(client.open.mock.calls[0][0]).toBe('보고서.hwpx')
    expect(client.open.mock.calls[0][1].byteLength).toBe(3)
    expect(track).toHaveBeenCalledWith('tool_open', { ext: 'hwpx' }) // 파일 이름은 보내지 않는다
    expect(document.body.classList.contains('ed')).toBe(true)
  })

  it('두 번째 파일은 iframe 을 다시 만들지 않는다', async () => {
    await host.openFile(file())
    await host.openFile(file('b.hwp'))
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    expect(client.open).toHaveBeenCalledTimes(2)
  })

  it('HWP로 저장: format hwp 로 export 하고 이름을 .hwp 로 내려받는다', async () => {
    await host.openFile(file())
    await host.saveAs('hwp')
    expect(client.export).toHaveBeenCalledWith('hwp')
    expect(download.mock.calls[0][1]).toBe('보고서.hwp')
    expect(track).toHaveBeenCalledWith('tool_save', { format: 'hwp' })
    expect(client.markSaved).toHaveBeenCalled()
  })

  it('Ctrl+S(saveRequest)는 원래 형식으로 저장한다', async () => {
    await host.openFile(file())
    client._emit('saveRequest', {})
    await flush()
    expect(client.export).toHaveBeenCalledWith(undefined)
    expect(download.mock.calls[0][1]).toBe('보고서.hwpx')
  })

  it('폰으로 보내기: export 바이트를 전달함에 넣고 /?handoff=<id>&from=tools-hwp 로 이동한다', async () => {
    vi.useFakeTimers()
    try {
      await host.openFile(file())
      await host.sendToPhone()
      expect(store.put).toHaveBeenCalledTimes(1)
      expect(store.put.mock.calls[0][0].name).toBe('보고서.hwpx')
      expect(track).toHaveBeenCalledWith('tool_send_to_phone')
      vi.advanceTimersByTime(300)
      expect(navigate).toHaveBeenCalledWith('/?handoff=id-123&from=tools-hwp')
    } finally { vi.useRealTimers() }
  })

  it('변경이 있을 때만 페이지를 나갈 때 경고한다', async () => {
    await host.openFile(file())
    const ev1 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev1)
    expect(ev1.defaultPrevented).toBe(false)
    client._emit('dirty', { dirty: true })
    const ev2 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(true)
  })

  it('저장 메뉴에 요구한 3개 항목이 있다', () => {
    const labels = [...document.querySelectorAll('#bar-menu [role=menuitem]')].map((b) => b.textContent)
    expect(labels).toEqual(expect.arrayContaining(['HWPX로 저장', 'HWP로 저장', '폰으로 보내기']))
  })
})
