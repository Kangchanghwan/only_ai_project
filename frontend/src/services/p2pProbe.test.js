import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  classifyCandidateTypes,
  isProbeEnabled,
  readSelectedPairTypes,
  createP2pProbe,
  SESSION_FLAG,
  PROBE_BYTES_LAN,
  PROBE_BYTES_NAT,
  CHUNK_BYTES,
  transferTimeoutFor,
  fillChunk,
  readChunkIndex,
} from './p2pProbe'
import { mbpsBucket } from '../utils/mbpsBucket'

const makeStats = (localType, remoteType) =>
  new Map([
    ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
    ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' }],
    ['L', { id: 'L', type: 'local-candidate', candidateType: localType }],
    ['R', { id: 'R', type: 'remote-candidate', candidateType: remoteType }],
  ])

function makeFakeRtc({ localType = 'host', remoteType = 'host', open = true, throwOnCreate = false, ackMode = 'good', closeAfter = 0, throwOnSend = false } = {}) {
  const instances = []
  class FakeRtc {
    constructor() {
      if (throwOnCreate) throw new Error('boom')
      this.closed = false
      this.sent = []
      instances.push(this)
    }
    createDataChannel() {
      const self = this
      this.dc = {
        bufferedAmount: 0,
        send(d) {
          if (throwOnSend && typeof d !== 'string') throw new Error('send fail')
          self.sent.push(d)
          const nChunks = self.sent.filter((x) => typeof x !== 'string').length
          if (closeAfter && nChunks === closeAfter) queueMicrotask(() => this.onclose?.())
          if (d === 'end') {
            const bytes = self.sent.reduce((a, x) => a + (typeof x === 'string' ? 0 : x.byteLength), 0)
            const msg = { good: `ack:${bytes}:ok`, legacy: 'ack', short: `ack:${bytes - 1}:ok`, bad: `ack:${bytes}:bad`, none: null }[ackMode]
            if (msg) queueMicrotask(() => this.onmessage?.({ data: msg }))
          }
        },
        close() {},
        addEventListener() {},
      }
      return this.dc
    }
    async createOffer() { return { type: 'offer', sdp: 'sdp' } }
    async setLocalDescription() {
      if (open) setTimeout(() => this.dc.onopen?.(), 0)
    }
    async getStats() { return makeStats(localType, remoteType) }
    close() { this.closed = true }
  }
  return { FakeRtc, instances }
}

function makeSvc(devices) {
  const socket = { id: 'me', emit: vi.fn(), on: vi.fn(), off: vi.fn() }
  return { socket, isConnected: ref(true), ipRoomDevices: ref(devices) }
}
const me = { socketId: 'me' }
const peer = { socketId: 'peer' }
const memStorage = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('classifyCandidateTypes', () => {
  it.each([
    ['host', 'host', 'direct_lan'],
    ['host', 'prflx', 'direct_lan'],
    ['prflx', 'prflx', 'direct_lan'],
    ['srflx', 'host', 'direct_nat'],
    ['host', 'srflx', 'direct_nat'],
    ['srflx', 'srflx', 'direct_nat'],
    ['relay', 'host', 'failed'],
    [null, 'host', 'failed'],
    ['weird', 'host', 'failed'],
  ])('%s + %s -> %s', (l, r, expected) => {
    expect(classifyCandidateTypes(l, r)).toBe(expected)
  })
})

describe('readSelectedPairTypes', () => {
  it('transport.selectedCandidatePairId 로 선택된 pair를 찾는다', async () => {
    const pc = { getStats: async () => makeStats('srflx', 'host') }
    expect(await readSelectedPairTypes(pc)).toEqual({ localType: 'srflx', remoteType: 'host' })
  })
  it('transport가 없으면 nominated succeeded pair로 폴백한다', async () => {
    const stats = makeStats('host', 'host')
    stats.delete('T')
    stats.set('P', { ...stats.get('P'), state: 'succeeded', nominated: true })
    expect(await readSelectedPairTypes({ getStats: async () => stats })).toEqual({ localType: 'host', remoteType: 'host' })
  })
  it('pair가 없으면 null', async () => {
    expect(await readSelectedPairTypes({ getStats: async () => new Map() })).toEqual({ localType: null, remoteType: null })
  })
})

describe('킬스위치', () => {
  it("'false' 일 때만 비활성", () => {
    expect(isProbeEnabled('false')).toBe(false)
    expect(isProbeEnabled(undefined)).toBe(true)
    expect(isProbeEnabled('true')).toBe(true)
  })
  it('비활성이면 시그널 구독도 전송도 하지 않는다', async () => {
    const track = vi.fn()
    const { FakeRtc, instances } = makeFakeRtc()
    const svc = makeSvc([me, peer])
    const probe = createP2pProbe({ env: 'false', track, getRtc: () => FakeRtc, storage: memStorage(), doc: null })
    probe.start(svc)
    await wait()
    expect(svc.socket.on).not.toHaveBeenCalled()
    expect(svc.socket.emit).not.toHaveBeenCalled()
    expect(instances).toHaveLength(0)
    expect(track).not.toHaveBeenCalled()
  })
})

describe('initiator', () => {
  let track
  beforeEach(() => { track = vi.fn() })

  it('새로 들어온 쪽(첫 관찰에 피어가 있음)이 연결·측정 후 p2p_probe를 1회 보내고 PC를 닫는다', async () => {
    const { FakeRtc, instances } = makeFakeRtc({ localType: 'host', remoteType: 'host' })
    const svc = makeSvc([peer, me])
    const storage = memStorage()
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage, doc: null })
    probe.start(svc)
    await wait(80)
    expect(track).toHaveBeenCalledTimes(1)
    const [name, params] = track.mock.calls[0]
    expect(name).toBe('p2p_probe')
    expect(params.result).toBe('direct_lan')
    expect(params.local_type).toBe('host')
    expect(params.remote_type).toBe('host')
    expect(params.peer_count).toBe(1)
    expect(typeof params.connect_ms).toBe('number')
    expect(params.throughput_mbps).toBeGreaterThan(0)
    // 식별자 미포함
    expect(Object.values(params)).not.toContain('peer')
    expect(Object.values(params)).not.toContain('me')
    expect(Object.keys(params).sort()).toEqual(['connect_ms', 'got_answer', 'is_mobile', 'local_type', 'mbps_bucket', 'peer_count', 'probe_bytes', 'probe_v', 'remote_type', 'result', 'throughput_mbps', 'transfer'])
    expect(params).toMatchObject({ probe_v: 2, probe_bytes: PROBE_BYTES_LAN, transfer: 'complete' })
    // LAN 8MB = 16KB x 512 청크 + start/end 제어 메시지
    const chunks = instances[0].sent.filter((d) => typeof d !== 'string')
    expect(chunks).toHaveLength(512)
    expect(chunks[0].byteLength).toBe(16384)
    expect(instances[0].closed).toBe(true)
    expect(storage.getItem(SESSION_FLAG)).toBe('1')
    // offer가 같은 룸의 피어에게 갔다
    expect(svc.socket.emit).toHaveBeenCalledWith('p2p:signal', { to: 'peer', data: { t: 'offer', sdp: 'sdp' } })

    // 이후 목록이 바뀌어도 다시 시도하지 않는다
    svc.ipRoomDevices.value = [peer, me, { socketId: 'x' }]
    probe.onDevices(svc.ipRoomDevices.value)
    await wait(40)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('srflx 포함이면 direct_nat', async () => {
    const { FakeRtc } = makeFakeRtc({ localType: 'srflx', remoteType: 'srflx' })
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null })
    probe.start(makeSvc([peer, me]))
    await wait(80)
    expect(track.mock.calls[0][1].result).toBe('direct_nat')
  })

  it('연결이 안 되면 타임아웃 후 failed', async () => {
    const { FakeRtc, instances } = makeFakeRtc({ open: false })
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null, connectTimeoutMs: 20 })
    probe.start(makeSvc([peer, me]))
    await wait(80)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0][1]).toMatchObject({ result: 'failed', got_answer: false })
    expect(instances[0].closed).toBe(true)
  })

  it('RTCPeerConnection이 없으면 unsupported', async () => {
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => null, storage: memStorage(), doc: null })
    probe.start(makeSvc([peer, me]))
    await wait()
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0][1].result).toBe('unsupported')
  })

  it('먼저 와 있던 쪽(첫 관찰에 혼자)은 initiator가 되지 않는다', async () => {
    const { FakeRtc, instances } = makeFakeRtc()
    const svc = makeSvc([me])
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null })
    probe.start(svc)
    svc.ipRoomDevices.value = [me, peer]
    probe.onDevices(svc.ipRoomDevices.value)
    await wait(50)
    expect(instances).toHaveLength(0)
    expect(track).not.toHaveBeenCalled()
  })

  it('세션 플래그가 이미 있으면 시도하지 않는다', async () => {
    const storage = memStorage()
    storage.setItem(SESSION_FLAG, '1')
    const { FakeRtc, instances } = makeFakeRtc()
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage, doc: null })
    probe.start(makeSvc([peer, me]))
    await wait(50)
    expect(instances).toHaveLength(0)
    expect(track).not.toHaveBeenCalled()
  })

  it('탭이 hidden이면 visible이 될 때까지 연기한다', async () => {
    const listeners = []
    const doc = {
      visibilityState: 'hidden',
      addEventListener: (_e, h) => listeners.push(h),
      removeEventListener: () => {},
    }
    const { FakeRtc, instances } = makeFakeRtc()
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc })
    probe.start(makeSvc([peer, me]))
    await wait(30)
    expect(instances).toHaveLength(0)
    doc.visibilityState = 'visible'
    listeners.forEach((h) => h())
    await wait(80)
    expect(track).toHaveBeenCalledTimes(1)
  })
})

describe('예외 시 무해', () => {
  it('RTCPeerConnection 생성이 던져도 throw하지 않고 failed 한 번 보고', async () => {
    const track = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { FakeRtc } = makeFakeRtc({ throwOnCreate: true })
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null })
    expect(() => probe.start(makeSvc([peer, me]))).not.toThrow()
    await wait(30)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0][1].result).toBe('failed')
    warn.mockRestore()
  })

  it('track이 던져도 삼킨다', async () => {
    const track = vi.fn(() => { throw new Error('ga down') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { FakeRtc } = makeFakeRtc()
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null })
    expect(() => probe.start(makeSvc([peer, me]))).not.toThrow()
    await wait(80)
    warn.mockRestore()
  })

  it('socketService가 깨져 있어도 start는 throw하지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const probe = createP2pProbe({ env: undefined, track: vi.fn(), getRtc: () => null, storage: memStorage(), doc: null })
    expect(() => probe.start({})).not.toThrow()
    warn.mockRestore()
  })
})

describe('v2 측정', () => {
  let track
  beforeEach(() => { track = vi.fn() })
  const run = async (opts, probeOpts = {}, waitMs = 150) => {
    const { FakeRtc, instances } = makeFakeRtc(opts)
    const probe = createP2pProbe({ env: undefined, track, getRtc: () => FakeRtc, storage: memStorage(), doc: null, ...probeOpts })
    probe.start(makeSvc([peer, me]))
    await wait(waitMs)
    return { params: track.mock.calls[0]?.[1], instances }
  }

  it('크기 상수와 타임아웃 식', () => {
    expect(PROBE_BYTES_LAN).toBe(8 * 1024 * 1024)
    expect(PROBE_BYTES_NAT).toBe(2 * 1024 * 1024)
    expect(transferTimeoutFor(PROBE_BYTES_NAT)).toBe(11185) // 2MiB*8/1.5Mbps
    expect(transferTimeoutFor(PROBE_BYTES_LAN)).toBe(30000) // 상한
    expect(transferTimeoutFor(1000)).toBe(8000) // 하한
  })

  it('direct_nat은 2MB(128청크)', async () => {
    const { params, instances } = await run({ localType: 'srflx', remoteType: 'host' })
    expect(params).toMatchObject({ result: 'direct_nat', probe_bytes: PROBE_BYTES_NAT, transfer: 'complete' })
    expect(instances[0].sent.filter((d) => typeof d !== 'string')).toHaveLength(128)
  })

  it('청크는 결정적 패턴(첫 4바이트=인덱스)', async () => {
    const { instances } = await run({})
    const chunks = instances[0].sent.filter((d) => typeof d !== 'string')
    expect([0, 1, 511].map((i) => readChunkIndex(chunks[i]))).toEqual([0, 1, 511])
    const u8 = new Uint8Array(chunks[3])
    expect(u8[10]).toBe((3 * 31 + 10) & 0xff)
    const buf = fillChunk(new ArrayBuffer(CHUNK_BYTES), 7)
    expect(readChunkIndex(buf)).toBe(7)
  })

  it('complete: bucket 포함', async () => {
    const { params } = await run({})
    expect(params.transfer).toBe('complete')
    expect(params.mbps_bucket).toBe(mbpsBucket(params.throughput_mbps))
  })

  it('mismatch: 바이트 불일치 / bad → throughput 없음', async () => {
    for (const ackMode of ['short', 'bad']) {
      track.mockClear()
      const { params } = await run({ ackMode })
      expect(params.transfer).toBe('mismatch')
      expect(params.throughput_mbps).toBeUndefined()
      expect(params.mbps_bucket).toBeUndefined()
    }
  })

  it('stalled: ack가 안 오면 타임아웃', async () => {
    const { params, instances } = await run({ ackMode: 'none' }, { transferTimeoutMs: 30 }, 120)
    expect(params).toMatchObject({ result: 'direct_lan', transfer: 'stalled', probe_v: 2 })
    expect(params.throughput_mbps).toBeUndefined()
    expect(instances[0].closed).toBe(true)
  })

  it('closed: 전송 중 채널 종료', async () => {
    const { params } = await run({ ackMode: 'none', closeAfter: 5 })
    expect(params.transfer).toBe('closed')
    expect(params.throughput_mbps).toBeUndefined()
  })

  it('error: send 예외', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { params } = await run({ throwOnSend: true })
    warn.mockRestore()
    expect(params.transfer).toBe('error')
  })

  it('complete_legacy: ack 단독 → throughput은 보고, bucket 없음', async () => {
    const { params } = await run({ ackMode: 'legacy' })
    expect(params.transfer).toBe('complete_legacy')
    expect(params.throughput_mbps).toBeGreaterThan(0)
    expect(params.mbps_bucket).toBeUndefined()
  })

  it('failed면 transfer 생략', async () => {
    const { params } = await run({ open: false }, { connectTimeoutMs: 20 }, 80)
    expect(params.result).toBe('failed')
    expect(params.transfer).toBeUndefined()
    expect(params.probe_v).toBeUndefined()
  })

  it.each([[0, '<5'], [4.9, '<5'], [5, '5-20'], [19.9, '5-20'], [20, '20-50'], [50, '50-100'], [99.9, '50-100'], [100, '100-300'], [299.9, '100-300'], [300, '300+'], [900, '300+']])('mbps_bucket %s -> %s', (v, b) => {
    expect(mbpsBucket(v)).toBe(b)
  })

  it('응답측: 순서·바이트 검증 후 ack:<bytes>:<ok|bad>', async () => {
    const mk = () => {
      const created = []
      class R {
        constructor() { this.closed = false; created.push(this) }
        async setRemoteDescription() {}
        async createAnswer() { return { type: 'answer', sdp: 'a' } }
        async setLocalDescription() {}
        close() {}
      }
      return { R, created }
    }
    const feed = async (idxs) => {
      const { R, created } = mk()
      const svc = makeSvc([me])
      const probe = createP2pProbe({ env: undefined, track, getRtc: () => R, storage: memStorage(), doc: null })
      probe.start(svc)
      const handler = svc.socket.on.mock.calls.find((c) => c[0] === 'p2p:signal')[1]
      handler({ from: 'peer', data: { t: 'offer', sdp: 'x' } })
      await wait(10)
      const sentMsgs = []
      const dc = { send: (m) => sentMsgs.push(m), close() {} }
      created[0].ondatachannel({ channel: dc })
      dc.onmessage({ data: 'start' })
      for (const i of idxs) dc.onmessage({ data: fillChunk(new ArrayBuffer(CHUNK_BYTES), i) })
      dc.onmessage({ data: 'end' })
      probe.stop()
      return sentMsgs
    }
    expect(await feed([0, 1, 2])).toEqual([`ack:${3 * CHUNK_BYTES}:ok`])
    expect(await feed([0, 2, 1])).toEqual([`ack:${3 * CHUNK_BYTES}:bad`])
  })
})
