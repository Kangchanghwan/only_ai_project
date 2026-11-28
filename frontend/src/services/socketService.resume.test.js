import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { socketService } from './socketService'
import { io } from 'socket.io-client'
import * as analytics from '../utils/analytics.js'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), once: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }))
}))

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('SocketService - 앱 복귀 즉시 재연결', () => {
  let track
  beforeEach(() => {
    socketService.disconnect()
    socketService._wasConnected = true
    socketService._hiddenAt = 0
    socketService._resumeStartedAt = 0
    socketService._rttSampled = false
    track = vi.spyOn(analytics, 'trackEvent').mockReturnValue(true)
  })
  afterEach(() => {
    track.mockRestore()
    socketService._wasConnected = false
    socketService.socket = null
    setVisibility('visible')
  })

  it('화면이 돌아왔을 때 끊겨 있으면 같은 소켓을 바로 다시 연다 (백오프 건너뜀)', () => {
    const connect = vi.fn()
    socketService.socket = { connected: false, connect }
    expect(socketService.resumeNow('visible')).toBe('reconnecting')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(socketService._resumeStartedAt).toBeGreaterThan(0)
  })

  it('visibilitychange(visible)가 resumeNow를 부른다', () => {
    const connect = vi.fn()
    socketService.socket = { connected: false, connect }
    setVisibility('hidden')
    setVisibility('visible')
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('온라인 복귀도 같은 소켓을 다시 연다', () => {
    const connect = vi.fn()
    socketService.socket = { connected: false, connect }
    window.dispatchEvent(new Event('online'))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('붙어 있고 잠깐만 가려졌다면 아무것도 하지 않는다', () => {
    const emit = vi.fn()
    socketService.socket = { connected: true, connect: vi.fn(), timeout: () => ({ emit }) }
    socketService._hiddenAt = Date.now() - 1000
    expect(socketService.resumeNow('visible')).toBe('idle')
    expect(emit).not.toHaveBeenCalled()
  })

  it('오래 가려졌다 돌아오면 하트비트를 보내고, 응답이 없으면 전송을 닫고 다시 연다', async () => {
    vi.useFakeTimers()
    try {
      const connect = vi.fn()
      let ackCb
      const engine = { close: vi.fn(() => { sock.connected = false }) }
      const sock = { connected: true, connect, io: { engine }, timeout: () => ({ emit: (ev, cb) => { ackCb = cb } }) }
      socketService.socket = sock
      socketService._hiddenAt = Date.now() - 30000
      expect(socketService.resumeNow('visible')).toBe('checking')
      ackCb(new Error('timeout'))
      expect(engine.close).toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(connect).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('하트비트 응답이 오면 연결을 건드리지 않는다', () => {
    const engine = { close: vi.fn() }
    let ackCb
    socketService.socket = { connected: true, connect: vi.fn(), io: { engine }, timeout: () => ({ emit: (ev, cb) => { ackCb = cb } }) }
    socketService._hiddenAt = Date.now() - 30000
    socketService.resumeNow('visible')
    ackCb(null, {})
    expect(engine.close).not.toHaveBeenCalled()
    expect(socketService._resumeStartedAt).toBe(0)
  })

  it('의도적으로 끊었거나 접속한 적이 없으면 복귀해도 연결하지 않는다', () => {
    const connect = vi.fn()
    socketService.socket = { connected: false, connect }
    socketService._wasConnected = false
    expect(socketService.resumeNow('visible')).toBe('idle')
    expect(connect).not.toHaveBeenCalled()
  })

  it('pagehide(bfcache 진입, persisted)는 소켓을 끊지 않는다', () => {
    const disconnect = vi.fn()
    socketService.socket = { connected: true, disconnect }
    const ev = new Event('pagehide'); ev.persisted = true
    window.dispatchEvent(ev)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('복귀로 시작한 재연결이 끝나면 socket_reconnect 이벤트를 한 번 보낸다 (내용 없이 시간·복구 여부만)', () => {
    socketService._resumeStartedAt = Date.now() - 1234
    socketService._emitReconnected(true)
    socketService._emitReconnected(true)
    const calls = track.mock.calls.filter((c) => c[0] === 'socket_reconnect')
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0][1]).sort()).toEqual(['reconnect_ms', 'recovered'])
    expect(calls[0][1].reconnect_ms).toBeGreaterThanOrEqual(1200)
    expect(calls[0][1].recovered).toBe(true)
  })

  it('재연결 콜백에 recovered 여부를 넘긴다', () => {
    const cb = vi.fn()
    socketService.onReconnected(cb)
    socketService._emitReconnected(true)
    expect(cb).toHaveBeenCalledWith({ recovered: true })
    socketService._onReconnectedCallbacks = []
  })
})

describe('SocketService - 측정 이벤트', () => {
  it('첫 연결에 socket_connect(connect_ms)를 한 번만 보낸다', () => {
    const track = vi.spyOn(analytics, 'trackEvent').mockReturnValue(true)
    socketService.disconnect()
    socketService.connect().catch(() => {})
    const sock = io.mock.results.at(-1).value
    const onConnect = sock.on.mock.calls.find((c) => c[0] === 'connect')[1]
    sock.id = 'abc'
    onConnect()
    onConnect()
    const calls = track.mock.calls.filter((c) => c[0] === 'socket_connect')
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0][1])).toEqual(['connect_ms'])
    expect(calls[0][1].connect_ms).toBeGreaterThanOrEqual(0)
    track.mockRestore()
    socketService.disconnect()
  })

  it('publishWithAck: ack 왕복(msg_rtt_ms)을 세션당 한 번만 보낸다', async () => {
    const track = vi.spyOn(analytics, 'trackEvent').mockReturnValue(true)
    socketService._rttSampled = false
    socketService.socket = { connected: true, timeout: () => ({ emit: (ev, m, t, cb) => cb(null, null, { success: true }) }) }
    await socketService.publishWithAck({ type: 'x' }, 'ip')
    await socketService.publishWithAck({ type: 'x' }, 'ip')
    const calls = track.mock.calls.filter((c) => c[0] === 'msg_rtt')
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0][1])).toEqual(['msg_rtt_ms'])
    track.mockRestore()
    socketService.socket = null
  })

  it('ack가 시간 초과면 msg_rtt를 보내지 않는다', async () => {
    const track = vi.spyOn(analytics, 'trackEvent').mockReturnValue(true)
    socketService._rttSampled = false
    socketService.socket = { connected: true, timeout: () => ({ emit: (ev, m, t, cb) => cb(new Error('timeout')) }) }
    const res = await socketService.publishWithAck({ type: 'x' }, 'ip')
    expect(res.timeout).toBe(true)
    expect(track.mock.calls.filter((c) => c[0] === 'msg_rtt')).toHaveLength(0)
    track.mockRestore()
    socketService.socket = null
  })

  it('applyJoinedEntry: 승인 신호에 실린 입장 결과로 방 토큰·기기 목록을 반영한다', () => {
    socketService.privateRoomDevices.value = {}
    const entry = { roomId: 'prv-g-1', ticket: 'pv1.prv-g-1.1.x', roomToken: 'tok', roomTokenTtlSec: 100, devices: [{ socketId: 'a' }] }
    expect(socketService.applyJoinedEntry(entry)).toEqual({ roomId: 'prv-g-1', ticket: 'pv1.prv-g-1.1.x', devices: [{ socketId: 'a' }] })
    expect(socketService.privateRoomDevices.value['prv-g-1']).toEqual([{ socketId: 'a' }])
    expect(socketService.applyJoinedEntry({ roomId: 1 })).toBeNull()
    expect(socketService.applyJoinedEntry(null)).toBeNull()
    socketService.privateRoomDevices.value = {}
  })
})
