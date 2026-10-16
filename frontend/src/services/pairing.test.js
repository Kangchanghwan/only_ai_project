// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createPairing } from './pairing.js'
import { deriveRoomLock } from '../utils/pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle() { for (let i = 0; i < 30; i++) await tick() }

/** 계약대로 동작하는 가짜 중계 서버 */
function makeRelay({ tamper } = {}) {
  const socks = new Map()
  const sessions = new Map()
  let n = 0
  const send = (id, ev, p) => { const s = socks.get(id); if (s) queueMicrotask(() => (s.handlers[ev] || []).forEach((f) => f(structuredClone(p)))) }
  const connect = (id) => {
    const s = { id, handlers: {} }
    socks.set(id, s)
    return {
      emit: async (ev, p) => {
        if (ev === 'pair:invite') {
          const sid = 'sess' + ++n
          sessions.set(sid, { a: id, b: p.to, confirmed: {} })
          send(p.to, 'pair:incoming', { sessionId: sid, from: { socketId: id }, sameNetwork: false, expiresAt: 1 })
          return { ok: true, sessionId: sid, expiresAt: 1 }
        }
        const ss = sessions.get(p.sessionId)
        if (!ss) return { ok: false }
        const other = id === ss.a ? ss.b : ss.a
        if (ev === 'pair:respond') {
          if (!p.accept) { send(ss.a, 'pair:ended', { sessionId: p.sessionId, reason: 'declined' }); return { ok: true } }
          send(ss.a, 'pair:accepted', { sessionId: p.sessionId, role: 'initiator', peer: { socketId: ss.b } })
          send(ss.b, 'pair:accepted', { sessionId: p.sessionId, role: 'responder', peer: { socketId: ss.a } })
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
          if (ss.confirmed[ss.a] && ss.confirmed[ss.b]) {
            for (const [me, peer] of [[ss.a, ss.b], [ss.b, ss.a]]) {
              send(me, 'pair:done', { sessionId: p.sessionId, roomId: 'prv-' + 'ab'.repeat(12), peer: { socketId: peer }, roomToken: 'tok-' + me, roomTokenTtlSec: 3600 })
            }
          }
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
  return { connect }
}

function setup(opts) {
  const relay = makeRelay(opts)
  const paired = { A: null, B: null }
  const sockA = relay.connect('A'); const sockB = relay.connect('B')
  const A = createPairing({ socket: sockA, onPaired: (i) => { paired.A = i } })
  const B = createPairing({ socket: sockB, onPaired: (i) => { paired.B = i } })
  return { A, B, paired, sockA, sockB }
}

describe('pairing 컨트롤러', () => {
  it('양쪽이 같은 sas·같은 roomSecret에 도달하고 onPaired를 부른다', async () => {
    const { A, B, paired } = setup()
    const inv = await A.invite('B')
    expect(inv.ok).toBe(true)
    await settle()
    const sidB = B.getSessions()[0].sessionId
    expect(B.getSessions()[0].state).toBe('incoming')
    expect((await B.respond(sidB, true)).ok).toBe(true)
    await settle()
    const sa = A.getSessions()[0]; const sb = B.getSessions()[0]
    expect(sa.state).toBe('keyed'); expect(sb.state).toBe('keyed')
    expect(sa.sas).toEqual(sb.sas)
    expect(JSON.stringify(sa)).not.toMatch(/secret|kWrap/i)

    await A.confirm(sa.sessionId, true)
    expect(A.getSessions()[0].state).toBe('waiting-peer-confirm')
    await B.confirm(sb.sessionId, true)
    await settle()
    expect(A.getSessions()[0].state).toBe('done')
    expect(paired.A.roomSecret).toHaveLength(32)
    expect(paired.A.roomSecret).toEqual(paired.B.roomSecret)
    expect(paired.A.roomId).toBe(paired.B.roomId)
    expect(paired.A.roomToken).toBe('tok-A')
    expect(paired.A.peer.socketId).toBe('B')
    const la = await deriveRoomLock(paired.A.roomSecret, paired.A.roomId)
    const lb = await deriveRoomLock(paired.B.roomSecret, paired.B.roomId)
    expect(la.vh).toBe(lb.vh)
  })

  it('MITM(공개키 바꿔치기)이면 sas가 서로 다르다', async () => {
    const mitm = await (await import('../utils/pairCrypto.js')).generateEphemeral()
    const { A, B } = setup({ tamper: (from, d) => (d.t === 'pk' && from === 'A' ? { ...d, pk: mitm.publicRaw } : d) })
    await A.invite('B'); await settle()
    await B.respond(B.getSessions()[0].sessionId, true); await settle()
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
