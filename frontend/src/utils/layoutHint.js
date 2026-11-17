/**
 * 지난번 화면 배치 기억.
 * 새로 고침하거나 다시 연결할 때, 서버 응답이 오기 전의 자리 표시를 지난번과 같은 크기로 잡아
 * 목록과 입력 상자가 위아래로 움직이지 않게 한다.
 *
 * 저장하는 것은 개수와 높이 같은 숫자뿐이다. 기기 이름·파일 이름·텍스트 내용·주소는 저장하지 않는다.
 * 같은 네트워크(ip)와 전체 공유(global) 범위만 기억한다 (방 ID가 들어가는 1:1·그룹 범위는 저장하지 않는다).
 */
const KEY = 'layout-hint:v1'
const HOUR = 60 * 60 * 1000
/** 기기 배치는 하루, 파일은 보관 기간(약 하루), 텍스트는 보관 기간(10분) 동안만 믿는다 */
export const DEVICE_HINT_TTL = 24 * HOUR
export const FILE_HINT_TTL = 24 * HOUR
export const TEXT_HINT_TTL = 10 * 60 * 1000
/** 목록 자리 표시 줄 수 상한 */
export const MAX_HINT_ROWS = 3

let cache = null

const known = (scope) => scope === 'ip' || scope === 'global'
const int = (v, min, max) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}

function readAll() {
  if (cache) return cache
  let parsed = null
  try { parsed = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { parsed = null }
  cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  return cache
}

function writeAll() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* 저장 실패는 무시 (다음에 기본 배치로 보인다) */ }
}

/**
 * 기기 영역 배치를 기억한다.
 * @param {string} scope
 * @param {{ cards: number, otherNet: boolean, soloHeight: number }} v
 *   cards 카드 수(나 포함), otherNet "다른 네트워크 기기" 묶음이 있었는지, soloHeight 혼자일 때 안내 블록 높이(px, 없으면 0)
 */
export function saveDeviceHint(scope, v, now = Date.now()) {
  if (!known(scope)) return
  const all = readAll()
  all[scope] = { ...(all[scope] || {}), devices: { c: int(v?.cards, 1, 60), o: v?.otherNet ? 1 : 0, s: int(v?.soloHeight, 0, 600), t: now } }
  writeAll()
}

/** @returns {{ cards: number, otherNet: boolean, soloHeight: number } | null} */
export function readDeviceHint(scope, now = Date.now()) {
  if (!known(scope)) return null
  const d = readAll()[scope]?.devices
  if (!d || typeof d !== 'object' || !(now - Number(d.t) < DEVICE_HINT_TTL) || now < Number(d.t)) return null
  return { cards: int(d.c, 1, 60), otherNet: !!d.o, soloHeight: int(d.s, 0, 600) }
}

/**
 * 목록 배치를 기억한다.
 * @param {string} scope
 * @param {{ files: number, texts: number }} v 목록에 있던 파일 수와 텍스트 수
 */
export function saveListHint(scope, v, now = Date.now()) {
  if (!known(scope)) return
  const all = readAll()
  all[scope] = { ...(all[scope] || {}), list: { f: int(v?.files, 0, MAX_HINT_ROWS), x: int(v?.texts, 0, MAX_HINT_ROWS), t: now } }
  writeAll()
}

/**
 * @returns {{ rows: number, hasTexts: boolean } | null}
 *   rows 자리 표시 줄 수(0이면 지난번에 비어 있었음), hasTexts "모든 텍스트 삭제" 줄 자리가 필요한지
 */
export function readListHint(scope, now = Date.now()) {
  if (!known(scope)) return null
  const l = readAll()[scope]?.list
  if (!l || typeof l !== 'object' || now < Number(l.t)) return null
  const age = now - Number(l.t)
  if (!(age < FILE_HINT_TTL)) return null
  const files = int(l.f, 0, MAX_HINT_ROWS)
  const texts = age < TEXT_HINT_TTL ? int(l.x, 0, MAX_HINT_ROWS) : 0
  return { rows: Math.min(MAX_HINT_ROWS, files + texts), hasTexts: texts > 0 }
}

/** 테스트용: 메모리 캐시를 비운다 */
export function resetLayoutHintCache() {
  cache = null
}
