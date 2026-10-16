// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createPairing } from './pairing.js'
import { deriveRoomLock } from '../utils/pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle() { for (let i = 0; i < 30; i++) await tick() }

/** 계약대로 동작하는 가짜 중계 서버 */
function makeRelay({ tamper, stripPk = false } = {}) {
  const socks = new Map()
  const sessions = new Map()
  let n = 0
  const invites = []
  const send = (id, ev, p) => { const s = socks.get(id); if (s) queueMicrotask(() => (s.handlers[ev] || []).forEach((f) => f(structuredClone(p)))) }
  const maybeDone = (sid, ss) => {
    if (!(ss.confirmed[ss.a] && ss.confirmed[ss.b]) || ss.done) return
    ss.done = true
    for (const [me, peer] of [[ss.a, ss.b], [ss.b, ss.a]]) {
      send(me, 'pair:done', { sessionId: sid, roomId: 'prv-' + 'ab'.repeat(12), peer: { socketId: peer }, roomToken: 'tok-' + me, roomTokenTtlSec: 3600, ticket: 'pv1.tk-' + me })
    }
  }
  const connect = (id) => {
    const s = { id, handlers: {} }
    socks.set(id, s)
    return {
      emit: async (ev, p) => {
        if (ev === 'pair:invite') {
          const sid = 'sess' + ++n
          sessions.set(sid, { a: id, b: p.to, confirmed: {} })
          invites.push(p)
          send(p.to, 'pair:incoming', { sessionId: sid, from: { socketId: id }, sameNetwork: false, expiresAt: 1, ...(stripPk || !p.pk ? {} : { pk: p.pk }) })
          return { ok: true, sessionId: sid, expiresAt: 1 }
        }
        const ss = sessions.get(p.sessionId)
        if (!ss) return { ok: false }
        const other = id === ss.a ? ss.b : ss.a
        if (ev === 'pair:respond') {
          if (!p.accept) { send(ss.a, 'pair:ended', { sessionId: p.sessionId, reason: 'declined' }); return { ok: true } }
          send(ss.a, 'pair:accepted', { sessionId: p.sessionId, role: 'initiator', peer: { socketId: ss.b } })
          send(ss.b, 'pair:accepted', { sessionId: p.sessionId, role: 'responder', peer: { socketId: ss.a } })
          if (p.same) { ss.confirmed[id] = true; maybeDone(p.sessionId, ss) }
          return { ok: true }
        }
        if (ev === 'pair:signal') {
          const data = tamper ? tamper(id, p.data) : p.data
          send(other, 'pair:signal', { sessionId: p.sessionId, data })
          return { ok: true }
        }
        if (ev === 'pair:confirm') {
          if (!p.same) { send(other, 'pair:ended', { sessionId: p.sessionId, reason: 'mismatch' }); return { ok: true } }
          ss.confirmed[id] = true
          maybeDone(p.sessionId, ss)
          return { ok: true }
        }
        if (ev === 'pair:cancel') { send(other, 'pair:ended', { sessionId: p.sessionId, reason: 'cancelled' }); return { ok: true } }
        return { ok: false }
      },
      on: (ev, fn) => { (s.handlers[ev] ||= []).push(fn) },
      off: (ev, fn) => { s.handlers[ev] = (s.handlers[ev] || []).filter((f) => f !== fn) },
      raw: (ev, p) => (s.handlers[ev] || []).forEach((f) => f(p))
    }
  }
  return { connect, invites }
}

function setup(opts) {
  const relay = makeRelay(opts)
  const paired = { A: null, B: null }
  const sockA = relay.connect('A'); const sockB = relay.connect('B')
  const A = createPairing({ socket: sockA, onPaired: (i) => { paired.A = i } })
  const B = createPairing({ socket: sockB, onPaired: (i) => { paired.B = i } })
  return { A, B, paired, sockA, sockB, relay }
}

describe('pairing 컨트롤러', () => {
  it('v3: 수락 전에 키가 오가고(그림 준비), 보낸 쪽이 먼저 확인, 받는 쪽은 respond(same) 한 번에 끝난다', async () => {
    const { A, B, paired, relay } = setup()
    const inv = await A.invite('B')
    expect(inv.ok).toBe(true)
    expect(relay.invites[0].pk).toMatch(/^[A-Za-z0-9_-]{80,}$/) // invite에 pk가 실린다
    await settle()
    // 사람이 수락하기 전인데 양쪽에 그림이 있다
    let sa = A.getSessions()[0]; let sb = B.getSessions()[0]
    expect(sa.state).toBe('inviting'); expect(sb.state).toBe('incoming')
    expect(sa.sas).toHaveLength(4)
    expect(sa.sas).toEqual(sb.sas)
    expect(sb.legacy).toBe(false)
    expect(JSON.stringify(sa)).not.toMatch(/secret|kWrap/i)

    // 보낸 쪽이 먼저 "같아요": 상태는 상대 기다림
    expect((await A.confirm(sa.sessionId, true)).ok).toBe(true)
    expect(A.getSessions()[0].state).toBe('waiting-peer-confirm')
    expect(paired.A).toBeNull()
    // 받는 쪽: 수락 + 같아요 한 번
    expect((await B.respond(sb.sessionId, true, { same: true })).ok).toBe(true)
    await settle()

    expect(A.getSessions()[0].state).toBe('done')
    expect(B.getSessions()[0].state).toBe('done')
    expect(paired.A.roomSecret).toHaveLength(32)
    expect(paired.A.roomSecret).toEqual(paired.B.roomSecret)
    expect(paired.A.roomId).toBe(paired.B.roomId)
    expect(paired.A.roomToken).toBe('tok-A')
    expect(paired.A.ticket).toBe('pv1.tk-A')
    expect(paired.B.ticket).toBe('pv1.tk-B')
    expect(paired.A.peer.socketId).toBe('B')
    const la = await deriveRoomLock(paired.A.roomSecret, paired.A.roomId)
    const lb = await deriveRoomLock(paired.B.roomSecret, paired.B.roomId)
    expect(la.vh).toBe(lb.vh)
  })

  it('v3: 받는 쪽이 먼저 수락해도, 보낸 쪽이 나중에 확인하면 완료된다', async () => {
    const { A, B, paired } = setup()
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, true, { same: true }); await settle()
    expect(paired.B).toBeNull()
    await A.confirm(A.getSessions()[0].sessionId, true); await settle()
    expect(paired.A.roomSecret).toEqual(paired.B.roomSecret)
  })

  it('v3: 그림이 준비되기 전엔 수락(same)·확인을 거부한다', async () => {
    const { A, B } = setup({})
    // 상대가 답하지 않는 상황: B가 없는 소켓으로 초대
    const lone = createPairing({ socket: { emit: async () => ({ ok: true, sessionId: 's9', expiresAt: 1 }), on() {}, off() {} } })
    await lone.invite('x')
    expect((await lone.confirm('s9', true)).code).toBe('NOT_READY')
    // 받는 쪽: pk 없는 incoming(legacy)은 same 수락 불가
    const { sockB, B: B2 } = setup({ stripPk: true })
    sockB.raw('pair:incoming', { sessionId: 'z', from: { socketId: 'A' }, sameNetwork: false })
    expect(B2.getSessions()[0].legacy).toBe(true)
    expect((await B2.respond('z', true, { same: true })).code).toBe('NOT_READY')
    expect(A.getSessions()).toEqual([])
    expect(B.getSessions()).toEqual([])
  })

  it('옛 흐름(pk 없는 incoming): 수락 뒤에 키를 교환하고 keyed에서 확인한다', async () => {
    const { A, B, paired } = setup({ stripPk: true })
    await A.invite('B'); await settle()
    let sb = B.getSessions()[0]
    expect(sb.legacy).toBe(true); expect(sb.sas).toBeNull()
    await B.respond(sb.sessionId, true); await settle()
    const sa = A.getSessions()[0]; sb = B.getSessions()[0]
    expect(sb.state).toBe('keyed')
    expect(sa.sas).toEqual(sb.sas)
    expect(sa.sas).toHaveLength(4)
    await A.confirm(sa.sessionId, true)
    await B.confirm(sb.sessionId, true)
    await settle()
    expect(A.getSessions()[0].state).toBe('done')
    expect(paired.A.roomSecret).toEqual(paired.B.roomSecret)
    expect(paired.B.ticket).toBe('pv1.tk-B')
  })

  it('받는 쪽이 same 없이 수락하면 keyed가 되어 기존처럼 확인한다', async () => {
    const { A, B, paired } = setup()
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, true); await settle()
    expect(B.getSessions()[0].state).toBe('keyed')
    await B.confirm(B.getSessions()[0].sessionId, true)
    await A.confirm(A.getSessions()[0].sessionId, true)
    await settle()
    expect(paired.A.roomId).toBe(paired.B.roomId)
  })

  it('"달라요"(respond false + reason mismatch)는 mismatch로 끝나고 상대는 declined를 본다', async () => {
    const { A, B } = setup()
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, false, { reason: 'mismatch' }); await settle()
    expect(B.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'mismatch' })
    expect(A.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'declined' })
  })

  it('MITM(공개키 바꿔치기)이면 sas가 서로 다르다', async () => {
    const mitm = await (await import('../utils/pairCrypto.js')).generateEphemeral()
    const { A, B } = setup({ tamper: (from, d) => (d.t === 'pk' && from === 'B' ? { ...d, pk: mitm.publicRaw } : d) })
    await A.invite('B'); await settle()
    expect(A.getSessions()[0].sas).not.toEqual(B.getSessions()[0].sas)
  })

  it('거절·mismatch·cancel은 ended', async () => {
    let { A, B } = setup()
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, false, { block: true }); await settle()
    expect(A.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'declined' })

    ;({ A, B } = setup())
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, true); await settle()
    await A.confirm(A.getSessions()[0].sessionId, false)
    await settle()
    expect(A.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'mismatch' })
    expect(B.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'mismatch' })

    ;({ A, B } = setup())
    await A.invite('B'); await settle()
    await A.cancel(A.getSessions()[0].sessionId); await settle()
    expect(B.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'cancelled' })
  })

  it('잘못된 신호는 무시하고, 잘못된 pk는 세션을 종료한다', async () => {
    const { A, B, sockB } = setup()
    sockB.raw('pair:signal', null)
    sockB.raw('pair:signal', { sessionId: 'nope', data: { t: 'pk' } })
    sockB.raw('pair:accepted', { sessionId: 'x' })
    sockB.raw('pair:done', { sessionId: 'x', roomId: 'prv-1' })
    expect(B.getSessions()).toEqual([])
    await A.invite('B'); await settle()
    const sid = B.getSessions()[0].sessionId
    await B.respond(sid, true); await settle()
    sockB.raw('pair:signal', { sessionId: sid, data: { t: 'weird' } })
    expect(B.getSessions()[0].state).toBe('keyed')
  })

  it('invite 실패 코드를 돌려준다', async () => {
    const A = createPairing({ socket: { emit: async () => ({ ok: false, code: 'COOLDOWN' }), on() {}, off() {} } })
    expect(await A.invite('x')).toEqual({ ok: false, code: 'COOLDOWN' })
  })
})
