/**
 * @file concurrency.js
 * @description 동시 실행 수를 제한한 채 여러 작업을 실행하는 유틸리티.
 */

/**
 * items를 최대 limit개까지 동시에 worker로 처리하고, 입력 순서대로
 * Promise.allSettled와 같은 형태의 결과를 반환합니다.
 *
 * @template T, R
 * @param {T[]} items - 처리할 항목
 * @param {number} limit - 동시 실행 상한 (1 이상)
 * @param {(item: T, index: number) => Promise<R>} worker - 항목별 작업
 * @returns {Promise<Array<{status: 'fulfilled', value: R} | {status: 'rejected', reason: any}>>}
 */
export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  const laneCount = Math.max(1, Math.min(Number(limit) || 1, items.length))
  let nextIndex = 0

  async function lane() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: laneCount }, () => lane()))
  return results
}
