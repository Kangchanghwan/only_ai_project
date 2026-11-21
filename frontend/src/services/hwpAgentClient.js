/**
 * 부모 페이지 쪽 에이전트 창구 (studio 를 다른 출처 iframe 으로 임베드한 페이지에서 쓴다).
 * studio 안의 agent/bridge.js 로 postMessage 요청을 보내고 응답을 기다린다.
 * 원본: github.com/Kangchanghwan/hwp-editor 의 agent/client.js (e88b17b). 고칠 때는 두 곳을 같이 고친다.
 * 실제 편집 함수(hwpAgent)는 편집기 쪽(hwp.clipboardapp.org)에 있고, 이 파일은 같은 이름·인자로 대신 전하는 창구다.
 *
 *   const agent = createAgentClient({ getFrameWindow: () => iframe.contentWindow, origin: 'https://hwp.clipboardapp.org', methods: AGENT_METHODS })
 *   await agent.outline()
 *
 * 함수 이름·인자·결과는 원래 hwpAgent 와 같다. 함수를 넘기는 두 가지만 이쪽에서 처리한다.
 *  - guard(factory, { timeout }): factory 는 이 페이지에서 돌리고, 그동안 studio 의 dialogs() 를 물어 대화상자가 뜨면
 *    DIALOG_BLOCKED, 시간이 지나면 TIMEOUT 으로 끝낸다.
 *  - edit(label, a => { ... }): fn 을 이 페이지에서 기록 모드로 한 번 돌려 호출 목록(계획)을 만들고, studio 가 그 목록을
 *    한 트랜잭션(undo 한 단계)으로 실행한다. 앞 호출의 결과는 그대로 다음 호출의 인자로 넘길 수 있다
 *    (예: const p = a.insertParagraphAfter(3, '가'); a.insertParagraphAfter(p.i, '나')). 결과로 계산·비교·분기는 할 수 없다
 *    (EDIT_REF). 읽은 값에 따라 달라지는 편집은 edit 전에 읽어서 정한다.
 */

export const EDIT_STEP_METHODS = ['outline', 'find', 'getTable', 'listObjects',
  'replaceParagraph', 'insertParagraphAfter', 'deleteParagraphs', 'setParaShape', 'setCharShape', 'insertTable', 'deleteObject']

/** 에이전트 오류 (studio 에서 온 오류도 같은 모양으로 되살린다) */
export class HwpAgentError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'HwpAgentError'
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}

export function reviveError(e) {
  const err = new HwpAgentError(e && e.code, String((e && e.message) || 'studio 오류'))
  if (e && e.name && e.name !== 'HwpAgentError') err.name = e.name
  for (const [k, v] of Object.entries(e || {})) if (!['name', 'message', 'code'].includes(k)) err[k] = v
  return err
}

const isPlain = (v) => {
  if (!v || typeof v !== 'object') return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}

/**
 * fn 을 기록 모드로 돌려 { steps, ret } 를 만든다. fn 이 던지면 그대로 던진다(아무 것도 보내지 않음).
 */
export function recordEdit(fn) {
  if (typeof fn !== 'function') throw new HwpAgentError('INVALID_ARG', 'edit: 함수가 필요합니다')
  const steps = []
  const refs = new WeakMap()
  const noUse = () => { throw new HwpAgentError('EDIT_REF', 'edit 안에서는 앞 결과로 계산·비교를 할 수 없습니다. 결과는 그대로 다음 호출의 인자로만 넘기세요') }
  const makeRef = (k, path) => {
    const p = new Proxy(function ref() {}, {
      get(_, key) {
        if (key === Symbol.toPrimitive || key === 'valueOf' || key === 'toString' || key === 'toJSON') return noUse
        if (typeof key === 'symbol' || key === 'then') return undefined
        return makeRef(k, [...path, key])
      },
      apply: noUse,
      has: noUse,
      ownKeys: noUse,
      set: noUse,
    })
    refs.set(p, { $cbRef: k, path })
    return p
  }
  const unref = (v) => {
    if (refs.has(v)) return refs.get(v)
    if (Array.isArray(v)) return v.map(unref)
    if (typeof v === 'function') throw new HwpAgentError('INVALID_ARG', 'edit: 함수는 인자로 넘길 수 없습니다')
    if (isPlain(v)) { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = unref(x); return o }
    return v
  }
  const a = {}
  for (const name of EDIT_STEP_METHODS) {
    a[name] = (...args) => { const k = steps.length; steps.push({ method: name, args: unref(args) }); return makeRef(k, []) }
  }
  const r = fn(a)
  if (r && !refs.has(r) && typeof r.then === 'function') throw new HwpAgentError('EDIT_ASYNC', 'edit 의 함수는 동기여야 합니다 (await 를 쓰지 마세요)')
  return { steps, ret: r === undefined ? null : unref(r) }
}

/** 보낼 값에 든 바이트 버퍼 */
export function collectTransfer(v, out = new Set(), depth = 0) {
  if (depth > 6 || v === null || typeof v !== 'object') return [...out]
  if (v instanceof ArrayBuffer) out.add(v)
  else if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer) out.add(v.buffer) }
  else if (Array.isArray(v)) v.forEach((x) => collectTransfer(x, out, depth + 1))
  else if (isPlain(v)) Object.values(v).forEach((x) => collectTransfer(x, out, depth + 1))
  return [...out]
}

let seq = 0

/**
 * @param {{
 *   getFrameWindow: () => (Window | null | undefined),
 *   origin: string,                 studio 출처 (예: https://hwp.clipboardapp.org)
 *   methods: string[],              공개 함수 이름 (hwpAgentMethods.js)
 *   win?: Window,                   응답을 받을 이 페이지의 window
 *   ackTimeoutMs?: number,          요청을 받았다는 답이 이 시간 안에 없으면 NO_AGENT (기본 5000)
 *   timeoutMs?: number,             응답 전체 제한 (기본 120000)
 * }} o
 */
export function createAgentClient({ getFrameWindow, origin, methods, win = globalThis.window, ackTimeoutMs = 5000, timeoutMs = 120000 }) {
  const pending = new Map()

  const settle = (id, fn, v) => {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.ackTimer)
    clearTimeout(p.timer)
    fn === 'resolve' ? p.resolve(v) : p.reject(v)
  }

  const onMessage = (ev) => {
    const d = ev.data
    if (!d || d.cbHwpAgent !== 1 || !pending.has(d.id)) return
    if (ev.origin !== origin || ev.source !== getFrameWindow()) return
    if (d.ack) { clearTimeout(pending.get(d.id).ackTimer); return }
    if (d.ok === true) settle(d.id, 'resolve', d.result)
    else if (d.ok === false) settle(d.id, 'reject', reviveError(d.error))
  }
  win.addEventListener('message', onMessage)

  function call(method, args) {
    return new Promise((resolve, reject) => {
      const frame = getFrameWindow()
      if (!frame) { reject(new HwpAgentError('NO_EDITOR', '편집기가 아직 없습니다')); return }
      const id = `cb${Date.now().toString(36)}-${++seq}`
      const entry = { resolve, reject }
      entry.ackTimer = setTimeout(() => settle(id, 'reject', new HwpAgentError('NO_AGENT', '편집기에 에이전트 창구가 없습니다 (편집기 배포 버전을 확인하세요)')), ackTimeoutMs)
      entry.timer = setTimeout(() => settle(id, 'reject', new HwpAgentError('TIMEOUT', `${method}: ${timeoutMs}ms 안에 응답이 없습니다`)), timeoutMs)
      pending.set(id, entry)
      try {
        frame.postMessage({ cbHwpAgent: 1, id, method, args }, origin)
      } catch (e) {
        settle(id, 'reject', new HwpAgentError('INVALID_ARG', `보낼 수 없는 인자입니다: ${e && e.message}`))
      }
    })
  }

  /** 이 페이지에서 factory 를 돌리며 studio 의 대화상자를 지켜본다 */
  function guard(factory, { timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      let done = false
      let timer = null
      const t0 = Date.now()
      const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v) }
      const tick = async () => {
        if (done) return
        let titles = []
        try { titles = await call('dialogs', []) } catch { /* 창구 없음: 시간 제한만 */ }
        if (done) return
        if (titles && titles.length) return finish(reject, new HwpAgentError('DIALOG_BLOCKED', `대화상자가 떠서 멈췄습니다: ${titles.join(', ')}`, { dialogs: titles }))
        if (Date.now() - t0 > timeout) return finish(reject, new HwpAgentError('TIMEOUT', `${timeout}ms 안에 끝나지 않았습니다`))
        timer = setTimeout(tick, 200)
      }
      timer = setTimeout(tick, 200)
      Promise.resolve().then(factory).then((v) => finish(resolve, v), (e) => finish(reject, e))
    })
  }

  const api = {}
  for (const name of methods) {
    if (name === 'guard') api.guard = guard
    else if (name === 'edit') api.edit = async (label, fn, o) => call('edit', [label, typeof fn === 'function' ? recordEdit(fn) : fn, o])
    else api[name] = (...args) => call(name, args)
  }
  api.dispose = () => {
    win.removeEventListener('message', onMessage)
    for (const id of [...pending.keys()]) settle(id, 'reject', new HwpAgentError('DISPOSED', '창구를 닫았습니다'))
  }
  return api
}
