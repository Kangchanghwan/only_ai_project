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

// 기존 테스트는 한국어 문구를 기준으로 작성되어 있으므로 기본 UI 언어를 ko로 고정한다.
// (i18n/index.js가 저장된 'user-locale'을 최우선으로 사용한다. 다른 언어 검증은 각 테스트에서 locale을 바꾼다.)
globalThis.localStorage.setItem('user-locale', 'ko')
