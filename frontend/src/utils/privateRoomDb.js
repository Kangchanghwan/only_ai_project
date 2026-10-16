/**
 * 1:1 방 저장소 (IndexedDB). privateRoomStore 인터페이스:
 *   save(rec) | load() → rec[] (만료 항목은 지우고 제외) | remove(roomId) | updateTicket(roomId, ticket) | clear()
 * 레코드: { roomId, ticket, secretKey(HKDF CryptoKey, 비추출), peer, createdAt, lastUsedAt, expiresAt }
 * 입장권은 쓸 때마다 갱신돼 30일이 슬라이딩된다.
 * IndexedDB를 못 쓰거나 예외가 나면 조용히 메모리 저장소로 넘어간다(이번 접속만 유지).
 */
export const DB_NAME = 'cs-private-rooms'
export const STORE_NAME = 'rooms'
export const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function createMemoryPrivateRoomStore() {
  const m = new Map()
  return {
    kind: 'memory',
    save: async (rec) => { m.set(rec.roomId, { ...rec }) },
    load: async () => {
      const now = Date.now()
      for (const [id, r] of [...m]) if (r.expiresAt <= now) m.delete(id)
      return [...m.values()].map((r) => ({ ...r }))
    },
    remove: async (id) => { m.delete(id) },
    updateTicket: async (id, ticket) => {
      const r = m.get(id)
      if (!r) return
      const now = Date.now()
      m.set(id, { ...r, ticket, lastUsedAt: now, expiresAt: now + ROOM_TTL_MS })
    },
    clear: async () => m.clear()
  }
}

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error || new Error('IDB_REQUEST_FAILED'))
})
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error || new Error('IDB_TX_FAILED'))
  tx.onabort = () => reject(tx.error || new Error('IDB_TX_ABORTED'))
})

/** @param {IDBFactory} idb */
export function createIdbPrivateRoomStore(idb) {
  let dbPromise = null
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const r = idb.open(DB_NAME, 1)
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE_NAME)) r.result.createObjectStore(STORE_NAME, { keyPath: 'roomId' })
        }
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error || new Error('IDB_OPEN_FAILED'))
        r.onblocked = () => reject(new Error('IDB_BLOCKED'))
      })
    }
    return dbPromise
  }
  const store = async (mode) => (await open()).transaction(STORE_NAME, mode)
  return {
    kind: 'idb',
    async save(rec) {
      const tx = await store('readwrite')
      tx.objectStore(STORE_NAME).put(rec)
      await done(tx)
    },
    async load() {
      const tx = await store('readwrite')
      const os = tx.objectStore(STORE_NAME)
      const all = await req(os.getAll())
      const now = Date.now()
      const alive = []
      for (const r of all) {
        if (!r || r.expiresAt <= now) os.delete(r?.roomId)
        else alive.push(r)
      }
      await done(tx)
      return alive
    },
    async remove(roomId) {
      const tx = await store('readwrite')
      tx.objectStore(STORE_NAME).delete(roomId)
      await done(tx)
    },
    async updateTicket(roomId, ticket) {
      const tx = await store('readwrite')
      const os = tx.objectStore(STORE_NAME)
      const r = await req(os.get(roomId))
      if (r) {
        const now = Date.now()
        os.put({ ...r, ticket, lastUsedAt: now, expiresAt: now + ROOM_TTL_MS })
      }
      await done(tx)
    },
    async clear() {
      const tx = await store('readwrite')
      tx.objectStore(STORE_NAME).clear()
      await done(tx)
    }
  }
}

/**
 * 기본 저장소: IndexedDB가 있으면 쓰고, 어느 호출이든 실패하면 그 뒤로는 메모리 저장소만 쓴다(안내 없음).
 * @param {IDBFactory|null|undefined} idb 기본값 globalThis.indexedDB
 */
export function createPrivateRoomStore(idb = globalThis.indexedDB) {
  const memory = createMemoryPrivateRoomStore()
  let primary = null
  try { primary = idb ? createIdbPrivateRoomStore(idb) : null } catch { primary = null }
  const call = async (op, ...args) => {
    if (primary) {
      try { return await primary[op](...args) } catch { primary = null }
    }
    return memory[op](...args)
  }
  return {
    get kind() { return primary ? 'idb' : 'memory' },
    save: (rec) => call('save', rec),
    load: () => call('load'),
    remove: (id) => call('remove', id),
    updateTicket: (id, ticket) => call('updateTicket', id, ticket),
    clear: () => call('clear')
  }
}
