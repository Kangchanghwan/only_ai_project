import { describe, it, expect, beforeEach } from 'vitest'
import { useShareScope } from './useShareScope'

describe('useShareScope', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('기본 스코프는 ip(같은 네트워크)이다', () => {
    const { scope } = useShareScope()
    expect(scope.value).toBe('ip')
  })

  it('localStorage에 저장된 값을 초기값으로 복원한다', () => {
    localStorage.setItem('share-scope', 'global')
    const { scope } = useShareScope()
    expect(scope.value).toBe('global')
  })

  it('setScope는 값을 바꾸고 localStorage에 저장한다', () => {
    const { scope, setScope } = useShareScope()
    setScope('global')
    expect(scope.value).toBe('global')
    expect(localStorage.getItem('share-scope')).toBe('global')
  })

  it('유효하지 않은 값은 무시한다', () => {
    const { scope, setScope } = useShareScope()
    setScope('nonsense')
    expect(scope.value).toBe('ip')
  })

  it('getScope는 localStorage의 현재값을 반환한다', () => {
    const { setScope, getScope } = useShareScope()
    setScope('global')
    expect(getScope()).toBe('global')
  })

  it('getScope는 다른 인스턴스가 바꾼 값도 반영한다(localStorage 단일 출처)', () => {
    const a = useShareScope()
    const b = useShareScope()
    a.setScope('global')
    expect(b.getScope()).toBe('global')
  })
})

describe('useShareScope 비공개 스코프', () => {
  beforeEach(() => { localStorage.clear() })

  it('방이 있으면 prv 스코프를 설정하되 localStorage에는 저장하지 않는다', () => {
    localStorage.setItem('share-scope', 'global')
    const { scope, setScope, getScope } = useShareScope({ isValid: (id) => id === 'prv-1' })
    setScope('prv:prv-1')
    expect(scope.value).toBe('prv:prv-1')
    expect(getScope()).toBe('prv:prv-1')
    expect(localStorage.getItem('share-scope')).toBe('global')
  })

  it('없는 방·빈 id는 무시한다', () => {
    const { scope, setScope } = useShareScope({ isValid: () => false })
    setScope('prv:nope')
    setScope('prv:')
    expect(scope.value).toBe('ip')
  })

  it('방이 사라지면 저장된 스코프로 돌아간다', () => {
    let alive = true
    const { scope, setScope, getScope } = useShareScope({ isValid: () => alive })
    setScope('prv:prv-1')
    alive = false
    expect(getScope()).toBe('ip')
  })
})
