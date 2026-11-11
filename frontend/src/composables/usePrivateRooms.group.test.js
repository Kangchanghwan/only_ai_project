// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { usePrivateRooms } from './usePrivateRooms.js'
import { useLockState } from './useLockState.js'
import { newRoomSecret } from '../utils/pairCrypto.js'
import { createMemoryPrivateRoomStore, createPrivateRoomStore } from '../utils/privateRoomDb.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

const G = 'prv-g-' + 'ab12'.repeat(6)
const ONE = 'prv-' + 'cd34'.repeat(6)

describe('usePrivateRooms 그룹 방', () => {
  const pr = usePrivateRooms()
  let store
  beforeEach(() => { store = createMemoryPrivateRoomStore(); pr.setStore(store); pr.resetPrivateRooms(); useLockState().resetLockState() })

  it('그룹 방은 peer 없이 name과 함께 저장되고 inviteSecret 원본이 저장소에만 남는다', async () => {
    const secret = newRoomSecret()
    const rec = await pr.addRoom({ roomId: G, roomSecret: secret, ticket: 'pv1.t', name: '우리 방' })
    expect(rec.peer).toBeNull()
    expect(rec.name).toBe('우리 방')
    expect(rec.inviteSecret).toBeUndefined() // 메모리 목록에는 비밀 원본이 없다
    const [saved] = await store.load()
    expect(saved.name).toBe('우리 방')
    expect(Array.from(saved.inviteSecret)).toEqual(Array.from(secret))
    expect(saved.secretKey.extractable).toBe(false)
    expect(Array.from(await pr.inviteSecretFor(G))).toEqual(Array.from(secret))
  })

  it('호출자가 비밀 버퍼를 지워도 저장된 값은 영향이 없다', async () => {
    const secret = newRoomSecret()
    const copy = Array.from(secret)
    await pr.addRoom({ roomId: G, roomSecret: secret, ticket: 't', name: 'a' })
    secret.fill(0)
    expect(Array.from(await pr.inviteSecretFor(G))).toEqual(copy)
  })

  it('hydrate는 name을 복원하고 peer는 null, 상태는 connecting', async () => {
    await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), ticket: 'pv1.t', name: '복원 방' })
    pr.rooms.splice(0, pr.rooms.length)
    useLockState().resetLockState()
    await pr.hydrate(true)
    expect(pr.rooms[0]).toMatchObject({ roomId: G, name: '복원 방', peer: null, status: 'connecting', ticket: 'pv1.t' })
    expect(pr.peerFor(G)).toBeNull()
  })

  it('입장권 갱신(updateTicket)이 inviteSecret·name을 지우지 않는다', async () => {
    const secret = newRoomSecret()
    await pr.addRoom({ roomId: G, roomSecret: secret, ticket: 'old', name: '방' })
    pr.setTicket(G, 'new')
    await new Promise((r) => setTimeout(r, 10))
    const [saved] = await store.load()
    expect(saved.ticket).toBe('new')
    expect(saved.name).toBe('방')
    expect(Array.from(saved.inviteSecret)).toEqual(Array.from(secret))
  })

  it('1:1 방은 지금처럼 비추출 키만 저장하고 inviteSecret이 없다 (회귀 없음)', async () => {
    const rec = await pr.addRoom({ roomId: ONE, peer: { socketId: 'B' }, roomSecret: newRoomSecret(), ticket: 'T' })
    expect(rec.peer).toEqual({ socketId: 'B' })
    expect(rec.name).toBeUndefined()
    const [saved] = await store.load()
    expect(saved.inviteSecret).toBeUndefined()
    expect(saved.name).toBeUndefined()
    expect(await pr.inviteSecretFor(ONE)).toBeNull()
  })

  it('방 이름은 정리해서 저장한다(제어문자 제거, 20자)', async () => {
    const rec = await pr.addRoom({ roomId: G, roomSecret: newRoomSecret(), name: 'a\u0000' + 'b'.repeat(40) })
    expect(rec.name).toBe('a' + 'b'.repeat(19))
  })

  it('같은 비밀로 두 "기기"가 같은 vh(잠금 규격)를 얻고 서로의 텍스트를 풀 수 있다', async () => {
    const secret = newRoomSecret()
    const a = await pr.addRoom({ roomId: G, roomSecret: secret, ticket: 'a', name: 'x' })
    const vhA = a.lock.vh
    const enc = await pr.encryptFor(G, '안녕 그룹')
    // 다른 기기: 같은 비밀을 초대 링크로 받아 새로 등록
    pr.resetPrivateRooms()
    useLockState().resetLockState()
    pr.setStore(createMemoryPrivateRoomStore())
    const b = await pr.addRoom({ roomId: G, roomSecret: new Uint8Array(secret), ticket: 'b', name: 'x' })
    expect(b.lock.vh).toBe(vhA)
    expect(b.lock.salt).toBe(a.lock.salt)
    expect(await pr.decryptFor(G, enc)).toBe('안녕 그룹')
  })

  it('다른 방 ID면 같은 비밀이라도 vh가 다르다', async () => {
    const secret = newRoomSecret()
    const a = await pr.addRoom({ roomId: G, roomSecret: secret })
    const b = await pr.addRoom({ roomId: 'prv-g-' + 'ef56'.repeat(6), roomSecret: secret })
    expect(a.lock.vh).not.toBe(b.lock.vh)
  })

  it('저장소가 get을 지원하지 않아도(옛 저장소) load로 찾는다', async () => {
    const inner = createMemoryPrivateRoomStore()
    pr.setStore({ save: inner.save, load: inner.load, remove: inner.remove, updateTicket: inner.updateTicket, clear: inner.clear })
    const secret = newRoomSecret()
    await pr.addRoom({ roomId: G, roomSecret: secret, name: 'n' })
    expect(Array.from(await pr.inviteSecretFor(G))).toEqual(Array.from(secret))
  })

  it('기본 저장소 래퍼(createPrivateRoomStore)도 get을 제공한다', async () => {
    const s = createPrivateRoomStore(null)
    await s.save({ roomId: G, ticket: 't', inviteSecret: new Uint8Array(32), expiresAt: Date.now() + 1000 })
    expect((await s.get(G)).roomId).toBe(G)
    expect(await s.get('nope')).toBeNull()
  })
})
