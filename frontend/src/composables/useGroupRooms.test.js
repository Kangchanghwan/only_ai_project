// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

const toDataURL = vi.fn(async () => 'data:image/png;base64,QR')
vi.mock('qrcode', () => ({ default: { toDataURL: (...a) => toDataURL(...a) } }))

import { useGroupRooms } from './useGroupRooms.js'
import { usePrivateRooms } from './usePrivateRooms.js'
import { useLockState } from './useLockState.js'
import { newRoomSecret } from '../utils/pairCrypto.js'
import { createMemoryPrivateRoomStore } from '../utils/privateRoomDb.js'
import { buildInviteUrl, parseInvite } from '../utils/groupInvite.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const G = 'prv-g-' + 'ab12'.repeat(6)
const G2 = 'prv-g-' + 'cd34'.repeat(6)
const t = (k, p) => (k === 'group.defaultName' ? `${p.name}의 방` : p ? `${k}:${Object.values(p).join(',')}` : k)
const hashOf = (url) => url.slice(url.indexOf('#'))

describe('useGroupRooms', () => {
  const pr = usePrivateRooms()
  let socket, notify, track, onRoomReady, onAlreadyIn, g, written

  const make = (extra = {}) => useGroupRooms({
    privateRooms: pr, socket, notify, track, t,
    getMyName: () => '분홍 고양이', waitRegistered: async () => true, getOrigin: () => 'https://app.test',
    onRoomReady, onAlreadyIn, ...extra
  })

  beforeEach(() => {
    pr.setStore(createMemoryPrivateRoomStore()); pr.resetPrivateRooms(); useLockState().resetLockState()
    toDataURL.mockClear()
    written = []
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: vi.fn(async (v) => { written.push(v) }) } }, configurable: true })
    socket = {
      createPrivate: vi.fn(async () => ({ ok: true, roomId: G, ticket: 'pv1.own', devices: [{ socketId: 'me' }] })),
      invitePrivate: vi.fn(async () => ({ ok: true, ticket: 'pv1.' + G + '.inv', expiresAt: Date.now() + 600000 })),
      joinPrivate: vi.fn(async () => ({ ok: true, rooms: [], invalid: [] }))
    }
    notify = { showInfo: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }
    track = vi.fn()
    onRoomReady = vi.fn(async () => {})
    onAlreadyIn = vi.fn()
    g = make()
  })

  describe('방 만들기', () => {
    it('방 비밀을 만들고 → 서버에 만들기 → 방 저장(이름 기본값) → 스코프 이동 → 초대 시트를 연다', async () => {
      const id = await g.createRoom()
      expect(id).toBe(G)
      expect(socket.createPrivate).toHaveBeenCalledTimes(1)
      expect(pr.rooms[0]).toMatchObject({ roomId: G, name: '분홍 고양이의 방', ticket: 'pv1.own', peer: null })
      expect(onRoomReady).toHaveBeenCalledWith(G)
      expect(socket.invitePrivate).toHaveBeenCalledWith(G)
      expect(g.inviteSheet.value).toMatchObject({ roomId: G, qrDataUrl: 'data:image/png;base64,QR', loading: false })
      expect(track).toHaveBeenCalledWith('group_create')
      expect(track).toHaveBeenCalledWith('group_invite_open')
    })

    it('서버가 방 수 상한이면 안내하고 방을 만들지 않는다', async () => {
      socket.createPrivate.mockResolvedValue({ ok: false, code: 'TOO_MANY_ROOMS' })
      expect(await g.createRoom()).toBeNull()
      expect(notify.showError).toHaveBeenCalledWith('group.tooMany')
      expect(pr.rooms).toHaveLength(0)
      expect(track).not.toHaveBeenCalledWith('group_create')
    })

    it('연결 실패면 일반 오류 안내', async () => {
      socket.createPrivate.mockResolvedValue({ ok: false, code: 'TIMEOUT' })
      await g.createRoom()
      expect(notify.showError).toHaveBeenCalledWith('group.failed')
    })

    it('분석 이벤트에 방 ID·입장권·키·이름이 들어가지 않는다', async () => {
      await g.createRoom()
      await g.copyInviteLink()
      const serialized = JSON.stringify(track.mock.calls)
      expect(serialized).not.toContain('prv-')
      expect(serialized).not.toContain('pv1')
      expect(serialized).not.toContain('분홍')
      for (const [, params] of track.mock.calls) expect(params).toBeUndefined()
    })
  })

  describe('초대 시트', () => {
    it('열 때마다 새 초대 입장권을 받고, QR에는 초대 링크(#/pv?)가 들어간다', async () => {
      await g.createRoom()
      socket.invitePrivate.mockResolvedValueOnce({ ok: true, ticket: 'pv1.' + G + '.second', expiresAt: 1 })
      await g.openInvite(G)
      expect(socket.invitePrivate).toHaveBeenCalledTimes(2)
      const url = toDataURL.mock.calls.at(-1)[0]
      expect(url.startsWith('https://app.test/#/pv?')).toBe(true)
      expect(g.inviteSheet.value.url).toBe(url)
      const parsed = parseInvite(hashOf(url))
      expect(parsed.roomId).toBe(G)
      expect(parsed.ticket).toBe('pv1.' + G + '.second')
      // 링크의 비밀은 저장된 방 비밀과 같다
      expect(Array.from(parsed.secret)).toEqual(Array.from(await pr.inviteSecretFor(G)))
    })

    it('링크 복사는 초대 링크를 클립보드에 쓰고 토스트와 이벤트를 남긴다', async () => {
      await g.createRoom()
      await g.copyInviteLink()
      expect(written).toEqual([g.inviteSheet.value.url])
      expect(notify.showSuccess).toHaveBeenCalledWith('group.inviteCopied')
      expect(track).toHaveBeenCalledWith('group_invite_copy')
    })

    it('멤버가 아니라 입장권을 못 받으면 시트를 닫고 오류 안내', async () => {
      await g.createRoom()
      g.closeInvite()
      socket.invitePrivate.mockResolvedValue({ ok: false, code: 'NOT_ALLOWED' })
      await g.openInvite(G)
      expect(g.inviteSheet.value).toBeNull()
      expect(notify.showError).toHaveBeenCalledWith('group.failed')
    })

    it('모르는 방이면 아무것도 하지 않는다', async () => {
      await g.openInvite(G2)
      expect(g.inviteSheet.value).toBeNull()
      expect(socket.invitePrivate).not.toHaveBeenCalled()
    })

    it('닫으면 링크가 메모리에서 사라진다', async () => {
      await g.createRoom()
      g.closeInvite()
      expect(g.inviteSheet.value).toBeNull()
    })
  })

  describe('초대로 들어오기 (자동 입장 금지)', () => {
    const invite = (over = {}) => ({ roomId: G2, ticket: 'pv1.inv', secret: newRoomSecret(), name: '친구 방', ...over })

    it('링크를 열기만 하면 확인 시트만 뜨고 join은 호출되지 않는다', async () => {
      await g.acceptInvite(invite())
      expect(g.joinSheet.value).toMatchObject({ roomId: G2, name: '친구 방', busy: false })
      expect(socket.joinPrivate).not.toHaveBeenCalled()
      expect(pr.has(G2)).toBe(false)
      expect(track).not.toHaveBeenCalled()
    })

    it('이름이 없으면 기본 표시 이름', async () => {
      await g.acceptInvite(invite({ name: '' }))
      expect(g.joinSheet.value.name).toBe('group.unnamed')
    })

    it('들어가기: 소켓 등록 대기 → join([초대 입장권]) → 새 30일 입장권으로 방 저장 → 스코프 이동 → 토스트', async () => {
      const order = []
      const wait = vi.fn(async () => { order.push('wait'); return true })
      g = make({ waitRegistered: wait })
      socket.joinPrivate.mockImplementation(async (tickets) => {
        order.push('join')
        expect(tickets).toEqual(['pv1.inv'])
        return { ok: true, rooms: [{ roomId: G2, ticket: 'pv1.long', devices: [] }], invalid: [] }
      })
      const sec = newRoomSecret()
      await g.acceptInvite(invite({ secret: sec }))
      await g.confirmJoin()
      expect(order).toEqual(['wait', 'join'])
      expect(pr.rooms.find((r) => r.roomId === G2)).toMatchObject({ name: '친구 방', ticket: 'pv1.long', peer: null })
      expect(Array.from(await pr.inviteSecretFor(G2))).toEqual(Array.from(sec))
      expect(onRoomReady).toHaveBeenCalledWith(G2)
      expect(notify.showSuccess).toHaveBeenCalledWith('group.joined:친구 방')
      expect(track).toHaveBeenCalledWith('group_join', { result: 'joined' })
      expect(g.joinSheet.value).toBeNull()
    })

    it('취소하면 join을 보내지 않고 cancel 이벤트', async () => {
      await g.acceptInvite(invite())
      g.cancelJoin()
      expect(g.joinSheet.value).toBeNull()
      expect(socket.joinPrivate).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'cancel' })
      await g.confirmJoin() // 취소 뒤에는 아무 일도 없다
      expect(socket.joinPrivate).not.toHaveBeenCalled()
    })

    it('이미 가진 방이면 시트 없이 스코프만 전환하고 alreadyIn 토스트', async () => {
      await pr.addRoom({ roomId: G2, roomSecret: newRoomSecret(), ticket: 'x', name: 'n' })
      await g.acceptInvite(invite())
      expect(g.joinSheet.value).toBeNull()
      expect(onAlreadyIn).toHaveBeenCalledWith(G2)
      expect(notify.showInfo).toHaveBeenCalledWith('group.alreadyIn')
      expect(socket.joinPrivate).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'already' })
    })

    it('앱 시작 직후(방 목록 복원 중)에도 저장된 방을 이미 가진 방으로 본다', async () => {
      const store = createMemoryPrivateRoomStore()
      pr.setStore(store); pr.resetPrivateRooms()
      await pr.addRoom({ roomId: G2, roomSecret: newRoomSecret(), ticket: 'x', name: 'n' })
      pr.rooms.splice(0, pr.rooms.length) // 새로 접속한 것처럼 메모리만 비움
      await g.acceptInvite(invite())
      expect(onAlreadyIn).toHaveBeenCalledWith(G2)
    })

    it('만료된 초대(invalid)는 inviteExpired', async () => {
      socket.joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: ['pv1.inv'] })
      await g.acceptInvite(invite())
      await g.confirmJoin()
      expect(notify.showError).toHaveBeenCalledWith('group.inviteExpired')
      expect(track).toHaveBeenCalledWith('group_join', { result: 'expired' })
      expect(pr.has(G2)).toBe(false)
      expect(g.joinSheet.value).toBeNull()
    })

    it('방이 가득 차면(full) group.full 이고 방을 저장하지 않는다', async () => {
      socket.joinPrivate.mockResolvedValue({ ok: true, rooms: [], invalid: [], full: [G2] })
      await g.acceptInvite(invite())
      await g.confirmJoin()
      expect(notify.showError).toHaveBeenCalledWith('group.full')
      expect(track).toHaveBeenCalledWith('group_join', { result: 'full' })
      expect(pr.has(G2)).toBe(false)
    })

    it('내 방이 이미 10개면 join을 보내지 않고 tooMany', async () => {
      for (let i = 0; i < 10; i++) await pr.addRoom({ roomId: 'prv-g-' + String(i).padStart(24, '0'), roomSecret: newRoomSecret(), name: 'n' })
      await g.acceptInvite(invite())
      await g.confirmJoin()
      expect(socket.joinPrivate).not.toHaveBeenCalled()
      expect(notify.showError).toHaveBeenCalledWith('group.tooMany')
    })

    it('소켓 등록을 못 기다리면 오류 안내, join 없음', async () => {
      g = make({ waitRegistered: async () => false })
      await g.acceptInvite(invite())
      await g.confirmJoin()
      expect(socket.joinPrivate).not.toHaveBeenCalled()
      expect(notify.showError).toHaveBeenCalledWith('pair.errors.TIMEOUT')
    })

    it('join 자체가 실패하면 일반 오류, 방은 저장되지 않는다', async () => {
      socket.joinPrivate.mockResolvedValue({ ok: false, code: 'TIMEOUT' })
      await g.acceptInvite(invite())
      await g.confirmJoin()
      expect(notify.showError).toHaveBeenCalledWith('group.failed')
      expect(pr.has(G2)).toBe(false)
    })

    it('들어가기를 두 번 눌러도 join은 한 번만', async () => {
      let release
      socket.joinPrivate.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true, rooms: [{ roomId: G2, ticket: 'L' }], invalid: [] }) }))
      await g.acceptInvite(invite())
      const p1 = g.confirmJoin()
      const p2 = g.confirmJoin()
      await new Promise((r) => setTimeout(r, 5))
      release()
      await Promise.all([p1, p2])
      expect(socket.joinPrivate).toHaveBeenCalledTimes(1)
    })

    it('잘못된 링크(null)는 inviteInvalid 안내만 하고 시트가 뜨지 않는다', async () => {
      await g.acceptInvite(null)
      expect(notify.showError).toHaveBeenCalledWith('group.inviteInvalid')
      expect(g.joinSheet.value).toBeNull()
      expect(track).toHaveBeenCalledWith('group_join', { result: 'invalid' })
    })

    it('초대 링크 왕복: 만든 쪽 링크를 파싱해 다른 기기가 같은 잠금으로 들어간다', async () => {
      await g.createRoom()
      const url = g.inviteSheet.value.url
      const parsed = parseInvite(hashOf(url))
      const aLock = pr.lockFor(G)
      pr.resetPrivateRooms(); useLockState().resetLockState(); pr.setStore(createMemoryPrivateRoomStore())
      socket.joinPrivate.mockResolvedValue({ ok: true, rooms: [{ roomId: G, ticket: 'pv1.b' }], invalid: [] })
      const b = make()
      await b.acceptInvite(parsed)
      await b.confirmJoin()
      expect(pr.lockFor(G).vh).toBe(aLock.vh)
    })
  })

  it('buildInviteUrl을 쓰지 않는 보조 확인: 링크에는 서버로 가는 쿼리가 없다', () => {
    const url = buildInviteUrl('https://app.test', { roomId: G, ticket: 'pv1.' + G + '.x', secret: newRoomSecret(), name: 'a' })
    expect(new URL(url).search).toBe('')
    expect(new URL(url).pathname).toBe('/')
  })

  describe('예전 방(prv-…) 초대 시도', () => {
    const LEGACY = 'prv-' + 'ef56'.repeat(6)
    it('초대 시트 대신 안내 시트를 열고 서버 invite를 부르지 않으며 room_legacy_invite만 기록한다', async () => {
      await pr.addRoom({ roomId: LEGACY, peer: { socketId: 'B' }, roomSecret: newRoomSecret(), ticket: 't' })
      await g.openInvite(LEGACY)
      expect(g.legacySheet.value).toEqual({ roomId: LEGACY })
      expect(g.inviteSheet.value).toBeNull()
      expect(socket.invitePrivate).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('room_legacy_invite')
      expect(JSON.stringify(track.mock.calls)).not.toContain(LEGACY)
    })
    it('"새 방 만들기"는 안내 시트를 닫고 기존 createRoom 으로 이어진다', async () => {
      await pr.addRoom({ roomId: LEGACY, peer: { socketId: 'B' }, roomSecret: newRoomSecret(), ticket: 't' })
      await g.openInvite(LEGACY)
      await g.createFromLegacy()
      expect(g.legacySheet.value).toBeNull()
      expect(socket.createPrivate).toHaveBeenCalledTimes(1)
      expect(pr.rooms.some((r) => r.roomId === G)).toBe(true)
    })
  })
})
