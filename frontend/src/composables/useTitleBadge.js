/**
 * 탭 제목 앞의 "(n) " 접두사를 한 곳에서 관리한다.
 * 여러 출처(1:1 요청, 도착 알림)가 각자 개수를 넣으면 합계 하나만 붙인다.
 * 원래 제목은 따로 보관하므로 접두사가 중복·누적되지 않는다.
 */
const counts = new Map()
let baseTitle = null
let lastApplied = null

function apply() {
  if (typeof document === 'undefined') return
  // 우리가 마지막으로 쓴 값과 다르면 다른 코드가 제목을 바꾼 것 → 그 값을 새 원래 제목으로 삼는다
  if (baseTitle === null || document.title !== lastApplied) baseTitle = document.title
  let sum = 0
  for (const n of counts.values()) sum += n
  const next = sum > 0 ? `(${sum}) ${baseTitle}` : baseTitle
  if (document.title !== next) document.title = next
  lastApplied = next
}

/** source별 개수를 지정한다(0이면 해당 출처 제거). */
export function setTitleBadge(source, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n > 0) counts.set(source, n)
  else counts.delete(source)
  apply()
}

export function getTitleBadgeTotal() {
  let sum = 0
  for (const n of counts.values()) sum += n
  return sum
}

/** 테스트용 초기화 */
export function resetTitleBadge() {
  counts.clear()
  apply()
  baseTitle = null
  lastApplied = null
}
