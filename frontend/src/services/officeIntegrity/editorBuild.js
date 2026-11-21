/**
 * 편집기 빌드 확인. 무결성 규칙과 fixture 는 아래 편집기 빌드로 시험했다.
 * 편집기 쪽 <origin>/build-identity.json 의 revision 과 csBuild 가 둘 다 맞아야 "시험한 빌드" 로 본다.
 * 목록에 없어도 편집은 막지 않는다 (읽기 전용으로 바꾸지 않는다). 짧은 안내만 띄우고, 저장 뒤 남은 차이 보고는 그대로 한다.
 */
export const TESTED_EDITOR_BUILDS = [
  // office-editor v0.0.9 기반, 2026-11-21 office.clipboardapp.org 배포본
  { revision: 'cf4e9a7f10fd8581740f453c33c01900e94dbfdf', csBuild: '944cf8d2650616d811c56143fa518ee2a38b4fe7' },
]

export const EDITOR_BUILD_NOTICE = '편집기 버전이 바뀌어 일부 서식이 달라질 수 있어요. 저장 뒤 남은 차이를 알려 드려요.'

const HEX40 = /^[0-9a-f]{40}$/

/**
 * @param {unknown} identity build-identity.json 내용 (못 받았으면 null)
 * @returns {'tested' | 'untested' | 'unknown'} unknown: 받지 못했거나 형식을 알 수 없음
 */
export function editorBuildStatus(identity, tested = TESTED_EDITOR_BUILDS) {
  if (!identity || typeof identity !== 'object' || identity.schema !== 1) return 'unknown'
  const revision = String(identity.revision || '').toLowerCase()
  const csBuild = String(identity.csBuild || '').toLowerCase()
  if (!HEX40.test(revision) || !HEX40.test(csBuild)) return 'unknown'
  return tested.some((t) => t.revision === revision && t.csBuild === csBuild) ? 'tested' : 'untested'
}

/** 안내 문구: 목록에 없는 빌드일 때만. 확인하지 못한 경우(unknown)는 바뀌었다고 말할 근거가 없어 띄우지 않는다. */
export function editorBuildNotice(status) {
  return status === 'untested' ? EDITOR_BUILD_NOTICE : ''
}

/** <origin>/build-identity.json 을 받아 상태를 돌려준다. 네트워크·CORS·형식 오류는 모두 unknown. */
export async function checkEditorBuild(origin, { fetchImpl = globalThis.fetch, timeout = 8000 } = {}) {
  let identity = null
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null
  try {
    const res = await fetchImpl(origin + '/build-identity.json', { cache: 'no-store', credentials: 'omit', signal: ctrl?.signal })
    if (res?.ok) identity = await res.json()
  } catch { /* unknown */ } finally {
    if (timer) clearTimeout(timer)
  }
  const status = editorBuildStatus(identity)
  return { status, identity, notice: editorBuildNotice(status) }
}
