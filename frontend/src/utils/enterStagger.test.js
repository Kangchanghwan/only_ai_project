import { describe, it, expect, vi, afterEach } from 'vitest'
import { createEnterStagger } from './enterStagger'

describe('createEnterStagger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('같은 배치 안에서 호출할 때마다 80ms씩 지연을 늘린다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    expect(next()).toBe(0)
    expect(next()).toBe(80)
    expect(next()).toBe(160)
  })

  it('지연은 400ms를 넘지 않는다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    for (let i = 0; i < 5; i++) next()
    expect(next()).toBe(400)
    expect(next()).toBe(400)
  })

  it('유휴 시간(50ms)이 지나면 다음 배치는 다시 0부터 시작한다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    next()
    next()
    vi.advanceTimersByTime(50)

    expect(next()).toBe(0)
  })
})
