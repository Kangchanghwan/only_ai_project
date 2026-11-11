import { describe, it, expect, afterEach, vi } from 'vitest'
import { createCodeHost, createCodeJoiner } from './codeJoin.js'
import { b64u } from '../utils/lockCrypto.js'

/** 서버 역할을 최소로 흉내 내는 가짜 소켓 쌍 */
function createFakeServer({ ttlMs = 300_000, maxFails = 5 } = {}) {
  const codes = new Map() // routeKey → host socket
  const sessions = new Map() // sid → { host, joiner, state }
  const fails = new Map() // joiner id → count
  const log = []
  let nextSession = 1
  const tick = (fn) => setTimeout(fn, 0)

  const makeSocket = (id) => {
    const handlers = new Map()
    const sock = {
      id,
      deliver(event, payload) {
        tick(() => [...(handlers.get(event) ?? [])].forEach((h) => h(payload)))
      },
      on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn) },
      off(event, fn) { handlers.get(event)?.delete(fn) },
      emit(event, payload) {
        log.push({ from: id, event })
        return new Promise((resolve) => tick(() => resolve(handle(sock, event, payload))))
      }
    }
    return sock
  }

  const endSession = (sid, to, reason, extra = {}) => {
    sessions.delete(sid)
    to?.deliver('code:end', { sessionId: sid, reason, ...extra })
  }

  function handle(sock, event, p) {
    if (event === 'code:open') {
      const key = p.route.join('-')
      if (codes.has(key) && codes.get(key).sock !== sock) return { ok: false, error: 'ROUTE_TAKEN' }
      for (const [k, v] of codes) if (v.sock === sock) codes.delete(k)
      codes.set(key, { sock, roomId: p.roomId })
      return { ok: true, expiresAt: Date.now() + ttlMs }
    }
    if (event === 'code:close') {
      for (const [k, v] of codes) if (v.sock === sock) codes.delete(k)
      return { ok: true }
    }
    if (event === 'code:join') {
      if ((fails.get(sock.id) ?? 0) >= maxFails) return { ok: false, error: 'WAIT', retryAfterSec: 180 }
      const host = codes.get(p.route.join('-'))
      if (!host) {
        const n = (fails.get(sock.id) ?? 0) + 1
        fails.set(sock.id, n)
        return { ok: false, error: 'NOT_FOUND', ...(n >= 3 ? { warn: true } : {}) }
      }
      const sid = `S${nextSession++}`
      sessions.set(sid, { host: host.sock, joiner: sock, state: 'open' })
      host.sock.deliver('code:incoming', { sessionId: sid })
      return { ok: true, sessionId: sid }
    }
    const s = sessions.get(p?.sessionId)
    if (!s || (s.host !== sock && s.joiner !== sock)) return { ok: false, error: 'NOT_FOUND' }
    if (event === 'code:signal') {
      ;(sock === s.host ? s.joiner : s.host).deliver('code:signal', { sessionId: p.sessionId, data: p.data })
      if (sock === s.host && s.state === 'approved') sessions.delete(p.sessionId)
      return { ok: true }
    }
    if (event === 'code:confirmed') {
      s.state = 'confirmed'
      s.host.deliver('code:request', { sessionId: p.sessionId, from: { socketId: s.joiner.id, deviceType: 'mobile' } })
      return { ok: true }
    }
    if (event === 'code:fail') {
      const n = (fails.get(s.joiner.id) ?? 0) + 1
      fails.set(s.joiner.id, n)
      endSession(p.sessionId, s.joiner, 'wrong', n >= 3 ? { warn: true } : {})
      return { ok: true }
    }
    if (event === 'code:decide') {
      if (!p.accept) endSession(p.sessionId, s.joiner, 'declined')
      else s.state = 'approved'
      return { ok: true }
    }
    if (event === 'code:cancel') {
      endSession(p.sessionId, sock === s.host ? s.joiner : s.host, 'cancelled')
      return { ok: true }
    }
    return { ok: false }
  }
  return { makeSocket, log, codes, sessions, fails }
}

const secret = new Uint8Array(32).map((_, i) => i + 1)
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('until 시간 초과')
}

let hosts = []
afterEach(async () => {
  await Promise.all(hosts.map((h) => h.close()))
  hosts = []
  vi.useRealTimers()
})

const setup = (opts = {}) => {
  const server = createFakeServer(opts.server)
  const hs = server.makeSocket('host')
  const host = createCodeHost({
    socket: hs,
    roomId: 'prv-g-' + 'a'.repeat(24),
    getInviteTicket: async () => 'pv1.ticket',
    getRoomSecret: () => secret,
    roomName: '교실',
    ...opts.host
  })
  hosts.push(host)
  const mkJoiner = (id = 'j1', o = {}) => createCodeJoiner({ socket: server.makeSocket(id), ...o })
  return { server, host, hs, mkJoiner }
}

describe('그림 코드 호스트·들어오는 쪽 왕복', () => {
  it('정상: 호스트가 코드를 열고, 그림 4개를 누른 기기가 승인 뒤 방 비밀·입장권을 받는다', async () => {
    const { host, mkJoiner, server } = setup()
    expect(await host.start()).toBe(true)
    expect(host.status.value).toBe('open')
    expect(host.code.value).toHaveLength(4)
    expect(server.codes.size).toBe(1)

    const joiner = mkJoiner()
    const p = joiner.join([...host.code.value])
    await until(() => host.pendingRequest.value)
    expect(host.pendingRequest.value.from.deviceType).toBe('mobile')
    expect(joiner.status.value).toBe('waiting')
    await host.decide(true)
    const res = await p
    expect(res.status).toBe('joined')
    expect(res.payload).toEqual({ secret: b64u(secret), ticket: 'pv1.ticket', name: '교실' })
    expect(host.pendingRequest.value).toBeNull()
  })

  it('앞 2개는 맞고 뒤 2개만 다르면 wrong, 호스트에는 요청이 뜨지 않고 서버에 fail이 간다', async () => {
    const { host, mkJoiner, server } = setup()
    await host.start()
    const wrong = [...host.code.value]
    wrong[3] = (wrong[3] + 1) % 24
    const joiner = mkJoiner()
    const res = await joiner.join(wrong)
    expect(res.status).toBe('wrong')
    expect(host.pendingRequest.value).toBeNull()
    expect(server.log.filter((l) => l.event === 'code:fail')).toHaveLength(1)
    expect(server.log.some((l) => l.event === 'code:confirmed')).toBe(false)
    expect(server.fails.get('j1')).toBe(1)
  })

  it('틀린 횟수가 쌓이면 warn 플래그가 따라온다', async () => {
    const { host, mkJoiner, server } = setup()
    await host.start()
    server.fails.set('j1', 2)
    const wrong = [...host.code.value]
    wrong[2] = (wrong[2] + 1) % 24
    const joiner = mkJoiner()
    const res = await joiner.join(wrong)
    expect(res).toMatchObject({ status: 'wrong', warn: true })
    expect(joiner.warn.value).toBe(true)
  })

  it('호스트가 거절하면 declined', async () => {
    const { host, mkJoiner } = setup()
    await host.start()
    const joiner = mkJoiner()
    const p = joiner.join([...host.code.value])
    await until(() => host.pendingRequest.value)
    await host.decide(false)
    expect((await p).status).toBe('declined')
  })

  it('호스트가 응답하지 않으면 들어오는 쪽은 timeout', async () => {
    const { host, mkJoiner } = setup()
    await host.start()
    const joiner = mkJoiner('j1', { timeoutMs: 80 })
    const res = await joiner.join([...host.code.value])
    expect(res.status).toBe('timeout')
  })

  it('호스트도 60초(주입값) 안에 응답이 없으면 요청을 내린다', async () => {
    const { host, mkJoiner } = setup({ host: { requestTimeoutMs: 60 } })
    await host.start()
    const joiner = mkJoiner('j1', { timeoutMs: 5000 })
    const p = joiner.join([...host.code.value])
    await until(() => host.pendingRequest.value)
    await until(() => !host.pendingRequest.value)
    expect((await p).status).toBe('timeout')
  })

  it('없는 코드는 notFound(warn 전달), 잠금 중이면 wait(retryAfterSec), 이미 진행 중이면 busy', async () => {
    const { host, mkJoiner, server } = setup()
    await host.start()
    const missing = [...host.code.value]
    missing[0] = (missing[0] + 1) % 24
    const j = mkJoiner()
    expect(await j.join(missing)).toMatchObject({ status: 'notFound' })
    server.fails.set('j1', 5)
    expect(await j.join(missing)).toEqual({ status: 'wait', retryAfterSec: 180 })
    expect(j.retryAfterSec.value).toBe(180)

    const j2 = mkJoiner('j2')
    const first = j2.join([...host.code.value])
    expect(await j2.join([...host.code.value])).toEqual({ status: 'busy' })
    j2.cancel()
    expect((await first).status).toBe('cancel')
  })

  it('같은 코드로 두 기기가 들어와도 승인 요청은 하나씩 큐로 나온다', async () => {
    const { host, mkJoiner } = setup()
    await host.start()
    const a = mkJoiner('a')
    const b = mkJoiner('b')
    const pa = a.join([...host.code.value])
    const pb = b.join([...host.code.value])
    await until(() => host.requestCount.value === 2)
    const firstSid = host.pendingRequest.value.sessionId
    await host.decide(true)
    expect(host.requestCount.value).toBe(1)
    expect(host.pendingRequest.value.sessionId).not.toBe(firstSid)
    await host.decide(false)
    const results = (await Promise.all([pa, pb])).map((r) => r.status).sort()
    expect(results).toEqual(['declined', 'joined'])
  })

  it('코드 시간이 지나면 새 코드로 바뀌고, 새 코드 버튼도 바꾼다', async () => {
    const { host, server } = setup({ server: { ttlMs: 40 } })
    await host.start()
    const first = [...host.code.value]
    await until(() => host.code.value.join() !== first.join(), 2000)
    expect(server.codes.size).toBe(1)
    const second = [...host.code.value]
    await host.renew()
    expect(host.code.value.join()).not.toBe(second.join())
  })

  it('close하면 서버에 code:close를 보내고 코드를 비운다', async () => {
    const { host, server } = setup()
    await host.start()
    await host.close()
    expect(host.code.value).toBeNull()
    expect(host.status.value).toBe('closed')
    expect(server.codes.size).toBe(0)
    expect(server.log.some((l) => l.event === 'code:close')).toBe(true)
  })

  it('ROUTE_TAKEN이면 다른 그림으로 다시 연다', async () => {
    const { host, hs } = setup()
    const realEmit = hs.emit
    let calls = 0
    hs.emit = (event, payload) => {
      if (event === 'code:open' && calls++ < 2) return Promise.resolve({ ok: false, error: 'ROUTE_TAKEN' })
      return realEmit(event, payload)
    }
    expect(await host.start()).toBe(true)
    expect(calls).toBe(3)
  })
})
