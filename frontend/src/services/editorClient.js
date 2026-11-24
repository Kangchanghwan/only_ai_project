/**
 * 편집기 iframe 과 대화하는 부모 쪽 창구 (cbEdit v1 규약).
 *  요청 { cbEdit:1, id, method, args } → 응답 { cbEdit:1, id, ok, result | error:{code,message} }, 이벤트 { cbEdit:1, event, ... }
 * 받는 쪽 검사: event.origin === 편집기 출처 && event.source === iframe.contentWindow 일 때만 받는다.
 * 바이트(ArrayBuffer)는 transfer 목록으로 넘긴다.
 */
export const TIMEOUTS = { ready: 120000, open: 120000, export: 60000, other: 10000 }

export class EditorError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'EditorError'
    this.code = code
  }
}

export function createEditorClient({ getWindow, origin, timeouts = {}, win = window }) {
  const T = { ...TIMEOUTS, ...timeouts }
  const targetOrigin = new URL(origin).origin
  const pending = new Map()
  const handlers = new Map() // event -> Set<fn>
  let seq = 0
  let destroyed = false
  let readyInfo = null
  let readyWaiters = []

  function emitEvent(name, data) {
    for (const fn of handlers.get(name) || []) {
      try { fn(data) } catch { /* 구독자 오류는 창구를 멈추지 않는다 */ }
    }
  }

  function onMessage(ev) {
    if (destroyed) return
    if (ev.origin !== targetOrigin) return
    const frameWin = getWindow()
    if (!frameWin || ev.source !== frameWin) return
    const d = ev.data
    if (!d || typeof d !== 'object' || d.cbEdit !== 1) return
    if (typeof d.event === 'string') {
      if (d.event === 'ready') {
        readyInfo = d
        const ws = readyWaiters
        readyWaiters = []
        ws.forEach((w) => { clearTimeout(w.timer); w.resolve(d) })
      }
      emitEvent(d.event, d)
      return
    }
    if (typeof d.id === 'string' && pending.has(d.id)) {
      const p = pending.get(d.id)
      pending.delete(d.id)
      clearTimeout(p.timer)
      if (d.ok) p.resolve(d.result)
      else p.reject(new EditorError(d.error?.code || 'INTERNAL', d.error?.message))
    }
  }
  win.addEventListener('message', onMessage)

  /** ready 이벤트를 기다린다 (iframe load 뒤 최대 120초). 이미 왔으면 바로 돌려준다 */
  function whenReady(timeout = T.ready) {
    if (readyInfo) return Promise.resolve(readyInfo)
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null }
      w.timer = setTimeout(() => {
        readyWaiters = readyWaiters.filter((x) => x !== w)
        reject(new EditorError('TIMEOUT', 'ready timeout'))
      }, timeout)
      readyWaiters.push(w)
    })
  }

  function call(method, args = {}, { timeout, transfer } = {}) {
    if (destroyed) return Promise.reject(new EditorError('DESTROYED', 'client destroyed'))
    const frameWin = getWindow()
    if (!frameWin) return Promise.reject(new EditorError('NO_FRAME', 'no iframe window'))
    const id = `${Date.now().toString(36)}-${++seq}`
    const ms = timeout ?? (method === 'open' ? T.open : method === 'export' ? T.export : T.other)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new EditorError('TIMEOUT', `${method} timeout`))
      }, ms)
      pending.set(id, { resolve, reject, timer })
      try {
        frameWin.postMessage({ cbEdit: 1, id, method, args }, targetOrigin, transfer || [])
      } catch (e) {
        pending.delete(id)
        clearTimeout(timer)
        reject(new EditorError('POST_FAILED', e?.message))
      }
    })
  }

  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event).add(fn)
    return () => handlers.get(event)?.delete(fn)
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    win.removeEventListener('message', onMessage)
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new EditorError('DESTROYED', 'client destroyed')) }
    pending.clear()
    readyWaiters.forEach((w) => { clearTimeout(w.timer); w.reject(new EditorError('DESTROYED', 'client destroyed')) })
    readyWaiters = []
    handlers.clear()
  }

  return {
    whenReady,
    on,
    destroy,
    open: (name, buffer) => call('open', { name, bytes: buffer }, { transfer: [buffer] }),
    export: (format) => call('export', format ? { format } : {}),
    markSaved: () => call('markSaved'),
    state: () => call('state'),
    setTheme: (theme) => call('setTheme', { theme }),
  }
}
