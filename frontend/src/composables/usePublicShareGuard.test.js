import { describe, it, expect } from 'vitest'
import { usePublicShareGuard } from './usePublicShareGuard'

describe('usePublicShareGuard', () => {
  it('private(ip) scope는 묻지 않고 통과한다', async () => {
    const g = usePublicShareGuard()
    expect(await g.ensure('ip')).toBe(true)
    expect(g.isOpen.value).toBe(false)
  })

  it('global 첫 전송은 확인창을 열고, 취소하면 false (전송 0)', async () => {
    const g = usePublicShareGuard()
    const p = g.ensure('global')
    expect(g.isOpen.value).toBe(true)
    g.cancel()
    expect(await p).toBe(false)
    expect(g.isOpen.value).toBe(false)
    expect(g.isConfirmed()).toBe(false)
  })

  it('동의하면 true이고 같은 세션에서는 다시 묻지 않는다', async () => {
    const g = usePublicShareGuard()
    const p = g.ensure('global')
    g.accept()
    expect(await p).toBe(true)
    expect(await g.ensure('global')).toBe(true)
    expect(g.isOpen.value).toBe(false)
  })

  it('취소 후 다시 시도하면 다시 묻는다', async () => {
    const g = usePublicShareGuard()
    const p1 = g.ensure('global'); g.cancel(); await p1
    const p2 = g.ensure('global')
    expect(g.isOpen.value).toBe(true)
    g.accept()
    expect(await p2).toBe(true)
  })

  it('확인창이 떠 있는 동안의 동시 요청은 같은 결과를 공유한다', async () => {
    const g = usePublicShareGuard()
    const a = g.ensure('global')
    const b = g.ensure('global')
    g.cancel()
    expect([await a, await b]).toEqual([false, false])
  })
})
