import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAgentClient, recordEdit, reviveError, collectTransfer, EDIT_STEP_METHODS } from './hwpAgentClient.js'
import { AGENT_METHODS } from './hwpAgentMethods.js'

const STUDIO = 'https://hwp.example.org'

/**
 * 가짜 studio 창: hwp-editor agent/bridge.js 처럼 요청을 받으면 ack 후 handlers[method](...args) 결과로 답한다.
 * 받은 요청은 seen 에 남는다.
 */
function fakeStudio({ origin = STUDIO, handlers = {}, ack = true } = {}) {
  const parent = new EventTarget()
  const seen = []
  const reply = (data) => setTimeout(() => {
    const ev = new Event('message')
    Object.assign(ev, { data: structuredClone(data), origin, source: frame })
    parent.dispatchEvent(ev)
  }, 0)
  const frame = {
    postMessage(data, targetOrigin) {
      const d = structuredClone(data)
      seen.push({ data: d, targetOrigin })
      if (!ack) return
      reply({ cbHwpAgent: 1, id: d.id, ack: true })
      Promise.resolve()
        .then(() => {
          const h = handlers[d.method]
          if (!h) throw Object.assign(new Error('부를 수 없는 함수입니다'), { code: 'UNKNOWN_METHOD' })
          return h(...d.args)
        })
        .then((result) => reply({ cbHwpAgent: 1, id: d.id, ok: true, result }),
          (e) => reply({ cbHwpAgent: 1, id: d.id, ok: false, error: { name: 'HwpAgentError', code: e.code, message: e.message, ...(e.extra || {}) } }))
    },
  }
  return { parent, frame, seen }
}

let st, client
beforeEach(() => {
  st = fakeStudio({ handlers: { outline: () => [{ i: 0, text: '가' }], dialogs: () => [], replaceParagraph: () => { throw Object.assign(new Error('다름'), { code: 'EXPECT_MISMATCH', extra: { expected: 'a', actual: 'b' } }) }, edit: (label, plan) => ({ label, plan }) } })
  client = createAgentClient({ getFrameWindow: () => st.frame, origin: STUDIO, methods: AGENT_METHODS, win: st.parent, ackTimeoutMs: 100 })
})
afterEach(() => client.dispose())

describe('hwpAgentClient (편집기 쪽 에이전트로 가는 창구)', () => {
  it('공개 함수 이름이 PR #112 의 cbHwp 에이전트 함수와 같다', () => {
    expect(AGENT_METHODS).toEqual([
      'outline', 'find', 'getTable', 'listObjects', 'check',
      'replaceParagraph', 'insertParagraphAfter', 'deleteParagraphs', 'setParaShape', 'setCharShape',
      'insertTable', 'deleteObject', 'edit', 'undo', 'redo', 'status', 'dismissRecovery', 'dismissDialogs', 'dialogs', 'guard',
    ])
    expect(Object.keys(client).filter((k) => k !== 'dispose').sort()).toEqual([...AGENT_METHODS].sort())
  })

  it('요청 형식과 대상 출처', async () => {
    expect(await client.outline({ from: 0 })).toEqual([{ i: 0, text: '가' }])
    expect(st.seen[0].data).toMatchObject({ cbHwpAgent: 1, method: 'outline', args: [{ from: 0 }] })
    expect(typeof st.seen[0].data.id).toBe('string')
    expect(st.seen[0].targetOrigin).toBe(STUDIO)
  })

  it('studio 오류는 code 와 추가 값이 든 Error 로 돌려받는다', async () => {
    const e = await client.replaceParagraph(1, 'x', { expect: 'a' }).catch((x) => x)
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({ name: 'HwpAgentError', code: 'EXPECT_MISMATCH', expected: 'a', actual: 'b' })
  })

  it('창구가 없는 편집기(예전 같은 출처 빌드 등)면 NO_AGENT', async () => {
    const dead = fakeStudio({ ack: false })
    const c = createAgentClient({ getFrameWindow: () => dead.frame, origin: STUDIO, methods: AGENT_METHODS, win: dead.parent, ackTimeoutMs: 50 })
    await expect(c.status()).rejects.toMatchObject({ code: 'NO_AGENT' })
    c.dispose()
  })

  it('편집기가 없으면 NO_EDITOR', async () => {
    const c = createAgentClient({ getFrameWindow: () => null, origin: STUDIO, methods: AGENT_METHODS, win: st.parent })
    await expect(c.outline()).rejects.toMatchObject({ code: 'NO_EDITOR' })
    c.dispose()
  })

  it('편집기 출처가 아닌 곳에서 온 응답은 무시한다', async () => {
    const other = fakeStudio({ origin: 'https://evil.example', handlers: { outline: () => ['가짜'] } })
    const c = createAgentClient({ getFrameWindow: () => other.frame, origin: STUDIO, methods: AGENT_METHODS, win: other.parent, ackTimeoutMs: 50 })
    await expect(c.outline()).rejects.toMatchObject({ code: 'NO_AGENT' })
    c.dispose()
  })

  it('edit 은 함수를 기록한 계획을 보낸다 (앞 결과는 자리표로)', async () => {
    const r = await client.edit('묶음', (a) => { const p = a.insertParagraphAfter(2, '가'); a.insertParagraphAfter(p.i, '나') })
    expect(r).toEqual({ label: '묶음', plan: { steps: [{ method: 'insertParagraphAfter', args: [2, '가'] }, { method: 'insertParagraphAfter', args: [{ $cbRef: 0, path: ['i'] }, '나'] }], ret: null } })
  })

  it('edit 안에서 결과로 계산하면 보내기 전에 EDIT_REF, async 함수면 EDIT_ASYNC', async () => {
    const n = st.seen.length
    await expect(client.edit('x', (a) => { const p = a.insertParagraphAfter(2, '가'); a.insertParagraphAfter(p.i + 1, '나') })).rejects.toMatchObject({ code: 'EDIT_REF' })
    await expect(client.edit('x', async () => {})).rejects.toMatchObject({ code: 'EDIT_ASYNC' })
    expect(st.seen.length).toBe(n)
  })

  it('guard 는 이 페이지 작업을 돌리며 studio 대화상자를 묻는다', async () => {
    expect(await client.guard(async () => 3)).toBe(3)
    const blocked = fakeStudio({ handlers: { dialogs: () => ['저장 확인'] } })
    const c = createAgentClient({ getFrameWindow: () => blocked.frame, origin: STUDIO, methods: AGENT_METHODS, win: blocked.parent })
    await expect(c.guard(() => new Promise(() => {}), { timeout: 5000 })).rejects.toMatchObject({ code: 'DIALOG_BLOCKED', dialogs: ['저장 확인'] })
    await expect(client.guard(() => new Promise(() => {}), { timeout: 300 })).rejects.toMatchObject({ code: 'TIMEOUT' })
    c.dispose()
  })

  it('dispose 는 기다리던 요청을 끝낸다', async () => {
    const slow = fakeStudio({ handlers: { outline: () => new Promise(() => {}) } })
    const c = createAgentClient({ getFrameWindow: () => slow.frame, origin: STUDIO, methods: AGENT_METHODS, win: slow.parent })
    const p = c.outline()
    await new Promise((r) => setTimeout(r, 10))
    c.dispose()
    await expect(p).rejects.toMatchObject({ code: 'DISPOSED' })
  })

  it('도우미', () => {
    expect(EDIT_STEP_METHODS).toContain('insertTable')
    expect(EDIT_STEP_METHODS).not.toContain('undo')
    expect(recordEdit((a) => a.outline()).ret).toEqual({ $cbRef: 0, path: [] })
    expect(() => recordEdit((a) => a.find(() => 1))).toThrow()
    expect(reviveError({ code: 'RANGE', message: 'm', count: 2 })).toMatchObject({ code: 'RANGE', count: 2 })
    const u = new Uint8Array(2)
    expect(collectTransfer([u])).toEqual([u.buffer])
  })
})
