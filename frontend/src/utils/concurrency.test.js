import { describe, it, expect } from 'vitest'
import { runWithConcurrency } from './concurrency'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('runWithConcurrency', () => {
  it('결과를 입력 순서대로 settled 형태로 반환한다', async () => {
    const results = await runWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise(resolve => setTimeout(resolve, n * 5))
      return n * 10
    })

    expect(results).toEqual([
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 }
    ])
  })

  it('동시에 실행되는 작업 수가 limit을 넘지 않는다', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()]
    let active = 0
    let maxActive = 0

    const run = runWithConcurrency(gates, 2, async (gate) => {
      active++
      maxActive = Math.max(maxActive, active)
      await gate.promise
      active--
    })

    // 두 개가 먼저 시작되고 나머지는 대기해야 한다
    await Promise.resolve()
    expect(active).toBe(2)

    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(active).toBe(2)

    gates[1].resolve(); gates[2].resolve(); gates[3].resolve()
    await run

    expect(maxActive).toBe(2)
  })

  it('한 작업이 실패해도 나머지는 계속 실행되고 실패는 rejected로 보고된다', async () => {
    const results = await runWithConcurrency(['a', 'boom', 'c'], 3, async (item) => {
      if (item === 'boom') throw new Error('failed: ' + item)
      return item.toUpperCase()
    })

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'A' })
    expect(results[1].status).toBe('rejected')
    expect(results[1].reason.message).toBe('failed: boom')
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'C' })
  })

  it('worker에 인덱스를 함께 전달한다', async () => {
    const results = await runWithConcurrency(['x', 'y'], 1, async (item, index) => `${index}:${item}`)
    expect(results.map(r => r.value)).toEqual(['0:x', '1:y'])
  })

  it('빈 입력이면 빈 배열을 반환한다', async () => {
    expect(await runWithConcurrency([], 3, async () => 1)).toEqual([])
  })
})
