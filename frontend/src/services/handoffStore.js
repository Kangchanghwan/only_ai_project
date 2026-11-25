/**
 * 도구 페이지(/tools/hwp/) → 메인 앱 "폰으로 보내기" 전달함.
 * 같은 출처 IndexedDB(DB 'cs-handoff', store 'files')에 { id, name, type, bytes, ts } 를 잠깐 둔다.
 * 파일은 서버를 거치지 않고, 메인 앱이 읽어 방에 올린 뒤 바로 지운다. 10분이 지난 항목은 읽을 때 모두 정리한다.
 * 이 모듈은 Vue 와 메인 번들에 의존하지 않는다 (도구 페이지에서도 쓴다).
 */
export const DB_NAME = 'cs-handoff'
export const STORE = 'files'
export const TTL_MS = 10 * 60 * 1000

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error || new Error('IDB_ERROR'))
})
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error || new Error('IDB_ERROR'))
  tx.onabort = () => reject(tx.error || new Error('IDB_ABORT'))
})

function newId() {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createHandoffStore({ idb = globalThis.indexedDB, now = () => Date.now(), ttl = TTL_MS } = {}) {
  let dbPromise = null
  const open = () => {
    if (!idb) return Promise.reject(new Error('NO_IDB'))
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error || new Error('IDB_OPEN'))
      }).catch((e) => { dbPromise = null; throw e })
    }
    return dbPromise
  }

  /** 파일 하나를 넣고 id 를 돌려준다. 10분 지난 옛 항목은 이때도 함께 지운다 */
  async function put({ name, type, bytes }) {
    const db = await open()
    const id = newId()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all = await wrap(store.getAll())
    for (const it of all) if (!isFresh(it)) store.delete(it.id)
    store.put({ id, name, type: type || 'application/octet-stream', bytes, ts: now() })
    await done(tx)
    return id
  }

  const isFresh = (it) => it && typeof it.ts === 'number' && now() - it.ts <= ttl && now() - it.ts >= -60000

  /** id 항목을 읽는다. 10분이 지난 항목은 (id 와 상관없이) 모두 지운다. 없거나 만료면 null */
  async function read(id) {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all = await wrap(store.getAll())
    let found = null
    for (const it of all) {
      if (!isFresh(it)) store.delete(it.id)
      else if (it.id === id) found = it
    }
    await done(tx)
    return found
  }

  async function remove(id) {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await done(tx)
  }

  return { put, read, remove }
}

let shared = null
export const handoffStore = () => (shared ||= createHandoffStore())
