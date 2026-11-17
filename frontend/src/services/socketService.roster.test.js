import { describe, it, expect, beforeEach, vi } from 'vitest'
import { socketService, ROSTER_RECENT } from './socketService'
import { io } from 'socket.io-client'

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), once: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }))
}))

const dev = (id, joinedAt = 1) => ({ socketId: id, joinedAt, identity: { adj: 0, animal: 0 } })

describe('SocketService - 명단 증분', () => {
  beforeEach(() => {
    socketService.disconnect()
    socketService.globalRoomId.value = 'room-shared'
    socketService.ipRoomId.value = 'ip-1'
    socketService.mySocketId.value = 'me'
    socketService.socket = { connected: true, emit: vi.fn(), disconnect: vi.fn() }
  })

  it('접속 auth에 roster: 2를 담는다', async () => {
    socketService.socket = null
    socketService.connect().catch(() => {})
    const opts = io.mock.calls.at(-1)[1]
    const auth = await new Promise((resolve) => opts.auth(resolve))
    expect(auth.roster).toBe(2)
    expect(auth.clientId).toBeTruthy()
  })

  it('room-users: rev/total/truncated를 저장하고, 없으면 devices.length', () => {
    socketService._applyRoomUsers({ roomId: 'room-shared', devices: [dev('me'), dev('a')], rev: 3, total: 80, truncated: true })
    expect(socketService.globalRoomTotal.value).toBe(80)
    expect(socketService.globalRoomTruncated.value).toBe(true)
    socketService._applyRoomUsers({ roomId: 'room-shared', devices: [dev('me'), dev('a')] })
    expect(socketService.globalRoomTotal.value).toBe(2)
    expect(socketService.globalRoomTruncated.value).toBe(false)
  })

  it('delta에 truncated true가 오면 잘린 모드로 바꾸고 최근 기기만 남긴다 (나는 유지)', () => {
    const many = [dev('me', 0), ...Array.from({ length: 20 }, (_, i) => dev('d' + i, i + 1))]
    socketService._applyRoomUsers({ roomId: 'room-shared', devices: many, rev: 1, total: 21, truncated: false })
    expect(socketService.globalRoomTruncated.value).toBe(false)
    socketService._applyRoomDelta({ roomId: 'room-shared', rev: 2, total: 22, truncated: true, op: 'add', device: dev('new', 100) })
    expect(socketService.globalRoomTruncated.value).toBe(true)
    const ids = socketService.globalRoomDevices.value.map((d) => d.socketId)
    expect(ids.length).toBe(ROSTER_RECENT + 1)
    expect(ids).toContain('me')
    expect(ids).toContain('new')
    expect(ids).not.toContain('d0')
    expect(socketService.globalRoomTotal.value).toBe(22)
  })

  it('add / update / remove 를 순서대로 적용하고 total을 반영한다', () => {
    socketService._applyRoomUsers({ roomId: 'ip-1', devices: [dev('me')], rev: 1, total: 1 })
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 2, total: 2, op: 'add', device: dev('a') })
    expect(socketService.ipRoomDevices.value.map((d) => d.socketId)).toEqual(['me', 'a'])
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 3, total: 2, op: 'update', device: { ...dev('a'), identity: { adj: 5, animal: 5 } } })
    expect(socketService.ipRoomDevices.value[1].identity.adj).toBe(5)
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 4, total: 1, op: 'remove', socketId: 'a' })
    expect(socketService.ipRoomDevices.value.map((d) => d.socketId)).toEqual(['me'])
  })

  it('같은 socketId의 add는 교체한다', () => {
    socketService._applyRoomUsers({ roomId: 'ip-1', devices: [dev('me'), dev('a')], rev: 1, total: 2 })
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 2, total: 2, op: 'add', device: { ...dev('a'), joinedAt: 9 } })
    expect(socketService.ipRoomDevices.value).toHaveLength(2)
    expect(socketService.ipRoomDevices.value.find((d) => d.socketId === 'a').joinedAt).toBe(9)
  })

  it('오래된 rev는 무시한다', () => {
    socketService._applyRoomUsers({ roomId: 'ip-1', devices: [dev('me')], rev: 5, total: 1 })
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 5, total: 2, op: 'add', device: dev('a') })
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 2, total: 2, op: 'add', device: dev('b') })
    expect(socketService.ipRoomDevices.value).toHaveLength(1)
    expect(socketService.socket.emit).not.toHaveBeenCalled()
  })

  it('rev 구멍이면 room-snapshot을 요청하고 스냅샷으로 교체한다', () => {
    socketService._applyRoomUsers({ roomId: 'ip-1', devices: [dev('me')], rev: 1, total: 1 })
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 4, total: 3, op: 'add', device: dev('c') })
    expect(socketService.socket.emit).toHaveBeenCalledWith('room-snapshot', { roomId: 'ip-1' }, expect.any(Function))
    expect(socketService.ipRoomDevices.value).toHaveLength(1)
    const cb = socketService.socket.emit.mock.calls[0][2]
    cb({ ok: true, snapshot: { roomId: 'ip-1', rev: 4, total: 3, truncated: false, devices: [dev('me'), dev('b'), dev('c')] } })
    expect(socketService.ipRoomDevices.value).toHaveLength(3)
    socketService._applyRoomDelta({ roomId: 'ip-1', rev: 5, total: 4, op: 'add', device: dev('d') })
    expect(socketService.ipRoomDevices.value).toHaveLength(4)
  })

  it('truncated 전체 공유 방: add 뒤 최근 20대로 자르되 내 기기는 남긴다', () => {
    const list = Array.from({ length: ROSTER_RECENT }, (_, i) => dev(`d${i}`, 100 + i))
    list[0] = dev('me', 1) // 내 기기는 가장 오래됨
    socketService._applyRoomUsers({ roomId: 'room-shared', devices: list, rev: 1, total: 60, truncated: true })
    socketService._applyRoomDelta({ roomId: 'room-shared', rev: 2, total: 61, op: 'add', device: dev('new', 999) })
    const ids = socketService.globalRoomDevices.value.map((d) => d.socketId)
    expect(ids).toHaveLength(ROSTER_RECENT + 1)
    expect(ids).toContain('me')
    expect(ids).toContain('new')
    expect(ids).toContain('d1')
    expect(socketService.globalRoomTotal.value).toBe(61)
  })

  it('findDevice: ack 결과를 그대로 돌려주고 연결이 없으면 TIMEOUT', async () => {
    socketService.socket.emit = vi.fn((ev, payload, cb) => cb({ ok: true, device: dev('x') }))
    expect((await socketService.findDevice({ adj: 1, animal: 2, suffix: 3 })).device.socketId).toBe('x')
    expect(socketService.socket.emit).toHaveBeenCalledWith('devices:find', { adj: 1, animal: 2, suffix: 3 }, expect.any(Function))
    socketService.socket = null
    expect(await socketService.findDevice({ adj: 1, animal: 2 })).toEqual({ ok: false, code: 'TIMEOUT' })
  })

  it('연결을 끊으면 새 상태도 초기화한다', () => {
    socketService._applyRoomUsers({ roomId: 'room-shared', devices: [dev('me')], rev: 1, total: 60, truncated: true })
    socketService.disconnect()
    expect(socketService.globalRoomTotal.value).toBe(0)
    expect(socketService.globalRoomTruncated.value).toBe(false)
  })
})
