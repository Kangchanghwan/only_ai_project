/**
 * 한글 편집기(rhwp-studio) 연결 설정과 공용 도움 함수.
 * 편집기는 별도 출처(https://hwp.clipboardapp.org)에 따로 배포되어 있고, 이 사이트는 SDK(createStudio)의 postMessage로만 대화한다.
 * 그래서 iframe 문서를 직접 읽거나 localStorage를 함께 쓰는 방식(같은 출처 가정)은 쓰지 않는다.
 *  - 편집기 주소: 빌드 환경 변수 VITE_HWP_EDITOR_ORIGIN (기본은 운영 주소). localhost 에서만 ?hed= 로 바꿀 수 있다.
 *    ?hed=same 은 예전 같은 출처 빌드(/tools/hwp/studio/)를 쓴다(예비용, 기본으로는 쓰지 않음).
 *  - 테마: 이 사이트가 정하고, 편집기에는 커맨드(view:theme-*, view:skin-flat)로 알린다. 편집기는 자기 저장소에 기억한다.
 *  - 상단 바 색: 편집기 메뉴 줄 색을 읽을 수 없으므로 라이트/다크 x flat 조합별 고정 색표를 쓴다.
 *  - 변경 표시: onDocumentChanged 는 에이전트 적용/되돌리기에만 오므로, 편집 화면이 보일 때 getDocumentState()를 주기적으로 본다.
 */
export const DEFAULT_EDITOR_ORIGIN = 'https://hwp.clipboardapp.org'
export const LEGACY_STUDIO_PATH = '/tools/hwp/studio/'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** http(s) 주소면 출처(origin)를, 아니면 null */
export function toOrigin(v) {
  if (!v) return null
  try {
    const u = new URL(String(v))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

/**
 * 편집기 주소를 정한다.
 * @param {{ env?: string, location?: { hostname: string, search?: string, origin?: string } }} o
 * @returns {{ studioUrl: string, base: string, origin: string, crossOrigin: boolean }}
 *   studioUrl: createStudio 에 넘길 주소, base: manifest.json·fonts/ 의 기준 주소(끝이 /)
 */
export function resolveEditor({ env, location } = {}) {
  let origin = toOrigin(env) || DEFAULT_EDITOR_ORIGIN
  if (location && LOCAL_HOSTS.has(location.hostname)) {
    const hed = new URLSearchParams(location.search || '').get('hed')
    if (hed === 'same' && location.origin) {
      return { studioUrl: LEGACY_STUDIO_PATH, base: location.origin + LEGACY_STUDIO_PATH, origin: location.origin, crossOrigin: false }
    }
    if (hed) origin = toOrigin(hed) || origin
  }
  return { studioUrl: origin + '/', base: origin + '/', origin, crossOrigin: true }
}

let cachedConfig = null
export function editorConfig() {
  if (!cachedConfig) {
    cachedConfig = resolveEditor({ env: import.meta.env?.VITE_HWP_EDITOR_ORIGIN, location: globalThis.location })
  }
  return cachedConfig
}

// ---- 테마 ----

export const STUDIO_SKIN = 'flat'

/** 편집기 메뉴 줄 색 (rhwp-studio v0.9.1 flat 스킨에서 잰 값). 상단 바가 편집기와 이어져 보이게 한다 */
export const BAR_COLORS = Object.freeze({
  'light/flat': Object.freeze({ bg: '#ffffff', fg: '#333333', bd: '#e9ecf1', bdW: '1px' }),
  'dark/flat': Object.freeze({ bg: '#2f343c', fg: '#eef1f5', bd: '#454d58', bdW: '1px' }),
})
const BAR_VARS = ['--bar-bg', '--bar-fg', '--bar-bd', '--bar-bd-w']

/** 이 페이지의 실제 테마. data-theme 가 light 가 아니면 다크 */
export function hostTheme(doc = globalThis.document) {
  return doc?.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function barColors(mode, skin = STUDIO_SKIN) {
  return BAR_COLORS[`${mode}/${skin}`] || null
}

/** 상단 바에 색 변수를 넣는다. 색표에 없으면 변수를 지워 사이트 토큰 색으로 둔다 */
export function applyBarColors(el, mode, skin = STUDIO_SKIN) {
  if (!el) return false
  const c = barColors(mode, skin)
  if (!c) {
    for (const k of BAR_VARS) el.style.removeProperty(k)
    return false
  }
  el.style.setProperty('--bar-bg', c.bg)
  el.style.setProperty('--bar-fg', c.fg)
  el.style.setProperty('--bar-bd', c.bd)
  el.style.setProperty('--bar-bd-w', c.bdW)
  return true
}

/** 편집기에 테마·스킨을 알린다. 실패해도 던지지 않는다(편집기 기본 테마로 남음) */
export async function applyStudioTheme(studio, mode, skin = STUDIO_SKIN) {
  let ok = true
  for (const id of [`view:skin-${skin}`, `view:theme-${mode}`]) {
    try {
      const r = await studio.commands.execute(id)
      if (r && r.ok === false) ok = false
    } catch {
      ok = false
    }
  }
  return ok
}

/** 이 페이지의 테마가 바뀌면 cb(mode). 해제 함수를 돌려준다 */
export function watchHostTheme(cb, doc = globalThis.document) {
  if (!doc?.documentElement || typeof MutationObserver === 'undefined') return () => {}
  let last = hostTheme(doc)
  const mo = new MutationObserver(() => {
    const now = hostTheme(doc)
    if (now !== last) { last = now; cb(now) }
  })
  mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}

// ---- 변경 표시 ----

/**
 * 편집 중 변경 여부를 주기적으로 확인한다 (타이핑은 이벤트가 오지 않음).
 * reset() 은 문서를 열거나 저장한 뒤 부른다. active() 가 false 이거나 탭이 숨겨져 있으면 묻지 않는다.
 * @returns {{ reset: () => Promise<void>, check: () => Promise<boolean|null>, stop: () => void }}
 */
export function watchDirty(studio, onDirty, { intervalMs = 1500, active = () => true, doc = globalThis.document } = {}) {
  let base = null // { epoch, seq }
  let last = false
  let stopped = false
  let busy = false

  function report(v) {
    if (v !== last) { last = v; onDirty(v) }
  }
  async function reset() {
    base = null
    last = false
    try {
      const st = await studio.getDocumentState()
      base = { epoch: st.documentEpoch, seq: st.changeSeq }
    } catch { /* 다음 확인에서 다시 잡는다 */ }
  }
  async function check() {
    if (stopped || busy) return null
    if (!active() || doc?.visibilityState === 'hidden') return null
    busy = true
    try {
      const st = await studio.getDocumentState()
      if (!base || base.epoch !== st.documentEpoch) base = { epoch: st.documentEpoch, seq: st.changeSeq }
      const v = !!st.dirty || st.changeSeq !== base.seq
      report(v)
      return v
    } catch {
      return null
    } finally {
      busy = false
    }
  }
  const timer = setInterval(check, intervalMs)
  return {
    reset,
    check,
    stop() { stopped = true; clearInterval(timer) },
  }
}
