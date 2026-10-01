import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  classifyCandidateTypes,
  isProbeEnabled,
  readSelectedPairTypes,
  createP2pProbe,
  SESSION_FLAG,
} from './p2pProbe'

const makeStats = (localType, remoteType) =>
  new Map([
    ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
    ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' }],
    ['L', { id: 'L', type: 'local-candidate', candidateType: localType }],
    ['R', { id: 'R', type: 'remote-candidate', candidateType: remoteType }],
  ])

function makeFakeRtc({ localType = 'host', remoteType = 'host', open = true, throwOnCreate = false } = {}) {
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
          self.sent.push(d)
          if (d === 'end') queueMicrotask(() => this.onmessage?.({ data: 'ack' }))
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
    expect(Object.keys(params).sort()).toEqual(['connect_ms', 'got_answer', 'is_mobile', 'local_type', 'peer_count', 'remote_type', 'result', 'throughput_mbps'])
    // 1MB = 16KB x 64 청크 + start/end 제어 메시지
    const chunks = instances[0].sent.filter((d) => typeof d !== 'string')
    expect(chunks).toHaveLength(64)
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
