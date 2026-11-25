// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createPairing } from './pairing.js'
import { useQrHost } from '../composables/useQrHost.js'
import { parseQrLink, QR_ROTATE_MS, QR_MAX_AGE_MS } from '../utils/qrLink.js'
import { generateEphemeral } from '../utils/pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle() { for (let i = 0; i < 40; i++) await tick() }

/** 계약대로 동작하는 가짜 중계 서버 */
function makeRelay({ tamper, tamperInvitePk, stripPk = false } = {}) {
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
          const pk = tamperInvitePk ? tamperInvitePk(p.pk) : p.pk
          send(p.to, 'pair:incoming', { sessionId: sid, from: { socketId: id }, sameNetwork: false, expiresAt: 1, ...(stripPk || !pk ? {} : { pk }) })
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


/** A = 휴대폰(QR을 찍음), B = PC(QR을 띄움). PC는 useQrHost로 회차를 만들고 확인한다 */
async function setup(opts = {}) {
  const relay = makeRelay(opts)
  let clock = 1_000_000
  const host = useQrHost({ getSocketId: () => 'B', getIdentityKey: () => '1-2-0', now: () => clock, setTimer: () => 0, clearTimer: () => {}, isVisible: () => true })
  await host.start()
  const paired = { A: null, B: null }
  const A = createPairing({ socket: relay.connect('A'), onPaired: (i) => { paired.A = i } })
  const B = createPairing({ socket: relay.connect('B'), onPaired: (i) => { paired.B = i }, qrVerify: (p) => host.verify(p) })
  const link = () => { const l = parseQrLink('#' + host.qrUrl.value.split('#')[1]); return { g: l.g, x: l.x, f: l.f } }
  return { A, B, host, paired, relay, link, advance: (ms) => { clock += ms } }
}

describe('QR 연결 (그림 비교 없음)', () => {
  it('QR 요청 → PC 수락 1번 → 방. 휴대폰은 저절로 같아요를 보낸다', async () => {
    const { A, B, paired, link, relay } = await setup()
    const inv = await A.invite('B', { qr: link() })
    expect(inv.ok).toBe(true)
    expect(relay.invites[0].pk.split('~')).toHaveLength(3)
    await settle()
    const sa = A.getSessions()[0]; const sb = B.getSessions()[0]
    expect(sb.state).toBe('incoming')
    expect(sb.viaQr).toBe(true)
    expect(sa.viaQr).toBe(true)
    expect(sa.confirmed).toBe(true) // 휴대폰은 사람 조작 없이 확인
    expect(sb.sas).toHaveLength(4)
    await B.respond(sb.sessionId, true, { same: true })
    await settle()
    expect(paired.A?.roomId).toBeTruthy()
    expect(paired.B?.roomId).toBe(paired.A.roomId)
    expect(paired.A.roomSecret).toEqual(paired.B.roomSecret)
  })

  it('직전 회차는 받고, 그보다 오래된 회차는 expired로 거절한다', async () => {
    const s = await setup()
    const old = s.link()
    s.advance(QR_ROTATE_MS); await s.host.rotate()
    expect((await s.A.invite('B', { qr: old })).ok).toBe(true)
    await settle()
    expect(s.B.getSessions()[0].state).toBe('incoming')

    const s2 = await setup()
    const older = s2.link()
    s2.advance(QR_ROTATE_MS); await s2.host.rotate()
    s2.advance(QR_ROTATE_MS); await s2.host.rotate()
    await s2.A.invite('B', { qr: older })
    await settle()
    expect(s2.A.getSessions()[0]).toMatchObject({ state: 'ended', reason: 'qr-expired' })
    expect(s2.B.getSessions().some((x) => x.state === 'incoming')).toBe(false) // 요청 창이 뜨지 않는다
  })

  it('10분이 지난 회차는 expired', async () => {
    const s = await setup()
    const l = s.link()
    s.advance(QR_MAX_AGE_MS + 1)
    await s.A.invite('B', { qr: l })
    await settle()
    expect(s.A.getSessions()[0].reason).toBe('qr-expired')
  })

  it('비밀이 틀리면 invalid로 거절(휴대폰 문구는 expired와 같다)', async () => {
    const s = await setup()
    const l = s.link()
    await s.A.invite('B', { qr: { ...l, x: new Uint8Array(16) } })
    await settle()
    expect(s.A.getSessions()[0].reason).toBe('qr-invalid')
  })

  it('서버가 휴대폰 키를 바꾸면 증명이 맞지 않아 PC가 거절한다', async () => {
    const fake = await generateEphemeral()
    const s = await setup({ tamperInvitePk: (pk) => { const [, g, proof] = pk.split('~'); return `${fake.publicRaw}~${g}~${proof}` } })
    await s.A.invite('B', { qr: s.link() })
    await settle()
    expect(s.A.getSessions()[0].reason).toBe('qr-invalid')
  })

  it('서버가 PC 키를 바꾸면 휴대폰이 지문으로 알아채고 취소한다', async () => {
    const fake = await generateEphemeral()
    const s = await setup({ tamper: (from, data) => (from === 'B' && data.t === 'pk' ? { ...data, pk: fake.publicRaw } : data) })
    await s.A.invite('B', { qr: s.link() })
    await settle()
    const sa = s.A.getSessions()[0]
    expect(sa.state).toBe('ended')
    expect(sa.reason).toBe('qr-mismatch')
    expect(sa.confirmed).toBe(false)
  })

  it('PC에 대기 중인 QR 요청이 3개면 4번째는 busy', async () => {
    const relay = makeRelay()
    const host = useQrHost({ getSocketId: () => 'B', now: () => 1, setTimer: () => 0, clearTimer: () => {}, isVisible: () => true })
    await host.start()
    const l = parseQrLink('#' + host.qrUrl.value.split('#')[1])
    const B = createPairing({ socket: relay.connect('B'), qrVerify: (p) => host.verify(p) })
    const phones = ['P1', 'P2', 'P3', 'P4'].map((id) => createPairing({ socket: relay.connect(id) }))
    for (const p of phones) { await p.invite('B', { qr: l }); await settle() }
    expect(B.getSessions().filter((x) => x.state === 'incoming')).toHaveLength(3)
    expect(phones[3].getSessions()[0].reason).toBe('qr-busy')
  })

  it('QR 증명이 없는 보통 요청은 지금처럼 그림 비교 흐름이다', async () => {
    const s = await setup()
    await s.A.invite('B')
    await settle()
    const sb = s.B.getSessions()[0]
    expect(sb.viaQr).toBe(false)
    expect(s.A.getSessions()[0].confirmed).toBe(false)
  })
})
