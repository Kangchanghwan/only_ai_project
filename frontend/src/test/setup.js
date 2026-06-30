// Vitest 전역 setup.
// 일부 happy-dom/Node 조합에서 localStorage 전역이 제공되지 않는데,
// i18n/index.js 등 일부 모듈이 import 시점에 localStorage에 접근하므로
// 테스트 수집(collect) 단계에서 크래시가 발생한다. 이를 막기 위해
// localStorage가 없으면 메모리 기반 폴리필을 주입한다.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size }
  }
}
