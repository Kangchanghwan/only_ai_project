// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createIdbPrivateRoomStore, createPrivateRoomStore, createMemoryPrivateRoomStore, DB_NAME, STORE_NAME, ROOM_TTL_MS } from './privateRoomDb.js'
import { deriveRoomLock, importRoomSecretKey, newRoomSecret } from './pairCrypto.js'

beforeAll(() => { if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto })

/** fake-indexeddb가 설치돼 있지 않아, 코드가 쓰는 IDB 표면(open/transaction/objectStore/put/get/getAll/delete/clear)만 흉내 낸다 */
function makeFakeIdb({ failOpen = false } = {}) {
  const rows = new Map()
  const opened = []
  const req = (fn) => {
    const r = {}
    setTimeout(() => { try { r.result = fn(); r.onsuccess?.() } catch (e) { r.error = e; r.onerror?.() } }, 0)
    return r
  }
  const os = {
    put: (v) => req(() => { rows.set(v.roomId, v) }),
    get: (k) => req(() => rows.get(k)),
    getAll: () => req(() => [...rows.values()]),
    delete: (k) => req(() => { rows.delete(k) }),
    clear: () => req(() => { rows.clear() })
  }
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: (name, opts) => { opened.push({ name, opts }) },
    transaction: () => {
      const t = { objectStore: () => os }
      setTimeout(() => t.oncomplete?.(), 10)
      return t
    }
  }
  const idb = {
    open: (name) => {
      const r = {}
      setTimeout(() => {
        if (failOpen) { r.error = new Error('denied'); r.onerror?.(); return }
        r.result = db
        r.onupgradeneeded?.()
        r.onsuccess?.()
      }, 0)
      opened.push({ openName: name })
      return r
    }
  }
  return { idb, rows, opened }
}

const rec = async (roomId, over = {}) => {
  const now = Date.now()
  return { roomId, ticket: 'pv1.t', secretKey: await importRoomSecretKey(newRoomSecret()), peer: { name: 'x' }, createdAt: now, lastUsedAt: now, expiresAt: now + ROOM_TTL_MS, ...over }
}

describe('privateRoomDb (IndexedDB 저장소)', () => {
  it('DB cs-private-rooms / store rooms(keyPath roomId)를 만들고 저장·불러오기·삭제한다', async () => {
    const { idb, rows, opened } = makeFakeIdb()
    const store = createIdbPrivateRoomStore(idb)
    const a = await rec('prv-a'); const b = await rec('prv-b')
    await store.save(a); await store.save(b)
    expect(opened).toContainEqual({ openName: DB_NAME })
    expect(opened).toContainEqual({ name: STORE_NAME, opts: { keyPath: 'roomId' } })
    expect((await store.load()).map((r) => r.roomId).sort()).toEqual(['prv-a', 'prv-b'])
    await store.remove('prv-a')
    expect(rows.has('prv-a')).toBe(false)
    expect((await store.load()).map((r) => r.roomId)).toEqual(['prv-b'])
  })

  it('만료된 항목은 load에서 지우고 제외한다', async () => {
    const { idb, rows } = makeFakeIdb()
    const store = createIdbPrivateRoomStore(idb)
    await store.save(await rec('prv-old', { expiresAt: Date.now() - 1 }))
    await store.save(await rec('prv-new'))
    expect((await store.load()).map((r) => r.roomId)).toEqual(['prv-new'])
    expect(rows.has('prv-old')).toBe(false)
  })

  it('updateTicket은 입장권을 바꾸고 만료를 지금+30일로 미룬다', async () => {
    const { idb } = makeFakeIdb()
    const store = createIdbPrivateRoomStore(idb)
    const soon = Date.now() + 1000
    await store.save(await rec('prv-a', { expiresAt: soon, lastUsedAt: 1 }))
    await store.updateTicket('prv-a', 'pv1.new')
    const [r] = await store.load()
    expect(r.ticket).toBe('pv1.new')
    expect(r.expiresAt).toBeGreaterThan(Date.now() + ROOM_TTL_MS - 5000)
    expect(r.lastUsedAt).toBeGreaterThan(1)
  })

  it('IndexedDB가 막히면 조용히 메모리 저장소로 넘어간다', async () => {
    const { idb } = makeFakeIdb({ failOpen: true })
    const store = createPrivateRoomStore(idb)
    expect(store.kind).toBe('idb')
    await expect(store.save(await rec('prv-a'))).resolves.toBeUndefined()
    expect(store.kind).toBe('memory')
    expect((await store.load()).map((r) => r.roomId)).toEqual(['prv-a'])
    expect((await createPrivateRoomStore(null).load())).toEqual([])
  })

  it('메모리 저장소도 같은 인터페이스(만료 제외, 입장권 갱신)를 따른다', async () => {
    const m = createMemoryPrivateRoomStore()
    await m.save(await rec('prv-x', { expiresAt: Date.now() - 1 }))
    await m.save(await rec('prv-y'))
    expect((await m.load()).map((r) => r.roomId)).toEqual(['prv-y'])
    await m.updateTicket('prv-y', 'pv1.z')
    expect((await m.load())[0].ticket).toBe('pv1.z')
  })

  it('deriveRoomLock은 바이트와 HKDF CryptoKey에서 같은 잠금을 만든다', async () => {
    const bytes = newRoomSecret()
    const key = await importRoomSecretKey(bytes)
    expect(key.extractable).toBe(false)
    const a = await deriveRoomLock(bytes, 'prv-1')
    const b = await deriveRoomLock(key, 'prv-1')
    expect(b.salt).toBe(a.salt)
    expect(b.vh).toBe(a.vh)
    expect(b.verifier).toBe(a.verifier)
  })
})
