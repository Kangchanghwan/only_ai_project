/**
 * 같은 렌더 플러시 안에서 연속으로 진입하는 항목들에 순서대로 스태거 지연을 부여한다.
 * 짧은 유휴 시간(resetDelayMs) 뒤에는 순번이 초기화되어, 다음 배치는 다시 0부터 시작한다 —
 * 그래야 전체 목록에서의 절대 위치가 아니라 "이번에 도착한 묶음" 안에서만 순번이 매겨진다.
 */
export function createEnterStagger(staggerMs = 80, capMs = 400, resetDelayMs = 50) {
  let order = 0
  let resetTimer = null

  return function next() {
    const delay = Math.min(order * staggerMs, capMs)
    order += 1
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      order = 0
    }, resetDelayMs)
    return delay
  }
}
