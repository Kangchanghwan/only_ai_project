// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { usePrivateRooms } from './usePrivateRooms.js'
import { useLockState } from './useLockState.js'
import { newRoomSecret } from '../utils/pairCrypto.js'
import { createMemoryPrivateRoomStore } from '../utils/privateRoomDb.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

describe('usePrivateRooms', () => {
  const pr = usePrivateRooms()
  let store
  beforeEach(() => { store = createMemoryPrivateRoomStore(); pr.setStore(store); pr.resetPrivateRooms(); useLockState().resetLockState() })

  it('addRoom은 keyring에 등록하고 lock/peer/has를 제공한다', async () => {
    const rec = await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'B' }, roomSecret: newRoomSecret() })
    expect(pr.has('prv-1')).toBe(true)
    expect(pr.peerFor('prv-1')).toEqual({ socketId: 'B' })
    expect(pr.lockFor('prv-1').salt).toBe(rec.lock.salt)
    expect(useLockState().keyFor(rec.lock.salt)?.encKey).toBe(rec.lock.encKey)
    expect(pr.rooms[0].status).toBe('online')
    pr.setStatus('prv-1', 'left')
    expect(pr.rooms[0].status).toBe('left')
  })

  it('텍스트 암·복호화와 removeRoom', async () => {
    await pr.addRoom({ roomId: 'prv-1', peer: {}, roomSecret: newRoomSecret() })
    const e = await pr.encryptFor('prv-1', 'hello')
    expect(await pr.decryptFor('prv-1', e)).toBe('hello')
    pr.removeRoom('prv-1')
    expect(pr.has('prv-1')).toBe(false)
    expect(pr.lockFor('prv-1')).toBe(null)
    await expect(pr.encryptFor('prv-1', 'x')).rejects.toThrow()
  })

  it('addRoom은 입장권·비추출 키·상대 정보를 저장소에 30일 만료로 저장한다', async () => {
    await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'B', identity: { adj: 1, animal: 2 } }, roomSecret: newRoomSecret(), ticket: 'pv1.abc' })
    const [saved] = await store.load()
    expect(saved).toMatchObject({ roomId: 'prv-1', ticket: 'pv1.abc', peer: { socketId: 'B' } })
    expect(saved.secretKey.type).toBe('secret')
    expect(saved.secretKey.extractable).toBe(false)
    expect(saved.expiresAt - saved.lastUsedAt).toBe(30 * 24 * 3600 * 1000)
  })

  it('hydrate는 저장된 방을 "연결 중"으로 복원하고 같은 잠금으로 암·복호화된다', async () => {
    const rec = await pr.addRoom({ roomId: 'prv-1', peer: { socketId: 'B' }, roomSecret: newRoomSecret(), ticket: 'pv1.abc' })
    const vh = rec.lock.vh
    const enc = await pr.encryptFor('prv-1', '안녕')
    pr.rooms.splice(0, pr.rooms.length) // 새로 접속한 것처럼 메모리만 비움
    useLockState().resetLockState()
    const out = await pr.hydrate(true)
    expect(out).toHaveLength(1)
    expect(pr.rooms[0]).toMatchObject({ roomId: 'prv-1', status: 'connecting', ticket: 'pv1.abc' })
    expect(pr.lockFor('prv-1').vh).toBe(vh)
    expect(await pr.decryptFor('prv-1', enc)).toBe('안녕')
    expect(useLockState().keyFor(pr.lockFor('prv-1').salt)).toBeTruthy()
  })

  it('만료된 저장 항목은 복원하지 않는다', async () => {
    await pr.addRoom({ roomId: 'prv-1', peer: {}, roomSecret: newRoomSecret(), ticket: 't' })
    const [r] = await store.load()
    await store.save({ ...r, expiresAt: Date.now() - 1 })
    pr.rooms.splice(0, pr.rooms.length)
    expect(await pr.hydrate(true)).toEqual([])
    expect(pr.rooms).toHaveLength(0)
  })

  it('setTicket·removeRoom·status left는 저장소에 반영된다', async () => {
    await pr.addRoom({ roomId: 'prv-1', peer: {}, roomSecret: newRoomSecret(), ticket: 'old' })
    pr.setTicket('prv-1', 'new')
    await new Promise((r) => setTimeout(r, 0))
    expect((await store.load())[0].ticket).toBe('new')
    expect(pr.rooms[0].ticket).toBe('new')
    pr.setStatus('prv-1', 'offline'); expect(pr.rooms[0].status).toBe('offline')
    pr.setStatus('prv-1', 'bogus'); expect(pr.rooms[0].status).toBe('offline')
    pr.setStatus('prv-1', 'left')
    await new Promise((r) => setTimeout(r, 0))
    expect(await store.load()).toEqual([]) // 상대가 끊으면 내 저장소에서도 삭제
    expect(pr.has('prv-1')).toBe(true) // 화면 안내용으로는 남는다
    await pr.addRoom({ roomId: 'prv-2', peer: {}, roomSecret: newRoomSecret(), ticket: 't' })
    pr.removeRoom('prv-2')
    await new Promise((r) => setTimeout(r, 0))
    expect(await store.load()).toEqual([])
  })

  it('저장소가 예외를 던져도 메모리 목록은 정상 동작한다', async () => {
    pr.setStore({ save: async () => { throw new Error('boom') }, load: async () => { throw new Error('boom') }, remove: async () => { throw new Error('boom') }, updateTicket: async () => { throw new Error('boom') }, clear: async () => {} })
    await expect(pr.addRoom({ roomId: 'prv-1', peer: {}, roomSecret: newRoomSecret(), ticket: 't' })).resolves.toBeTruthy()
    expect(pr.has('prv-1')).toBe(true)
    expect(await pr.hydrate(true)).toEqual([])
  })
})
