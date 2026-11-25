// 시험용 아주 작은 IndexedDB 대역: open / createObjectStore / transaction / put·get·getAll·delete 만 흉내 낸다 (keyPath 'id')
export function createFakeIdb() {
  const stores = new Map()
  const asyncReq = (fn) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null }
    queueMicrotask(() => { req.result = fn(); req.onsuccess?.() })
    return req
  }
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n) => { stores.set(n, new Map()); return {} },
    transaction(n) {
      const m = stores.get(n)
      const tx = { oncomplete: null, onerror: null, onabort: null }
      let pending = 0
      const settle = () => { pending--; if (pending === 0) queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.())) }
      const track = (fn) => { pending++; const r = asyncReq(fn); const done = () => settle(); const orig = r; Object.defineProperty(orig, 'onsuccess', { set(f) { this._f = f }, get() { return () => { this._f?.(); done() } } }); return r }
      tx.objectStore = () => ({
        put: (v) => track(() => { m.set(v.id, structuredClone(v)); return v.id }),
        get: (k) => track(() => (m.has(k) ? structuredClone(m.get(k)) : undefined)),
        getAll: () => track(() => [...m.values()].map((v) => structuredClone(v))),
        delete: (k) => track(() => { m.delete(k) }),
      })
      return tx
    },
  }
  return {
    _stores: stores,
    open() {
      const req = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => { if (!stores.size) req.onupgradeneeded?.(); req.onsuccess?.() })
      return req
    },
  }
}
