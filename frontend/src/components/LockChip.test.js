import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LockChip from './LockChip.vue'
import i18n from '../i18n/index.js'
import { useLockState } from '../composables/useLockState'

async function open() {
  const w = mount(LockChip, { props: { scope: 'ip' }, global: { plugins: [i18n] }, attachTo: document.body })
  await w.find('[data-testid="lock-start"]').trigger('click')
  return w
}

describe('LockChip 비밀번호 입력', () => {
  it('3자면 잠금 켜기 버튼이 disabled, 4자면 활성', async () => {
    const w = await open()
    const input = w.find('[data-testid="lock-password"]')
    await input.setValue('abc')
    expect(w.find('[data-testid="lock-apply"]').attributes('disabled')).toBeDefined()
    await input.setValue('abcd')
    expect(w.find('[data-testid="lock-apply"]').attributes('disabled')).toBeUndefined()
    w.unmount()
  })
  it('비밀번호 관리자 자동완성 방지 속성이 붙는다', async () => {
    const w = await open()
    const a = w.find('[data-testid="lock-password"]').attributes()
    expect(a.autocomplete).toBe('off')
    expect(a['data-1p-ignore']).toBeDefined()
    expect(a['data-lpignore']).toBe('true')
    expect(a['data-bwignore']).toBeDefined()
    w.unmount()
  })
})

describe('LockChip: 켜진 상태는 잠금 줄이 맡는다', () => {
  it('잠금이 켜지면 칩은 아무것도 그리지 않는다', async () => {
    const l = useLockState()
    l.resetLockState()
    await l.setLock('ip', 'abcd', { iterations: 1000 })
    const w = mount(LockChip, { props: { scope: 'ip' }, global: { plugins: [i18n] } })
    expect(w.find('[data-testid="lock-chip"]').exists()).toBe(false)
    expect(w.find('[data-testid="lock-off"]').exists()).toBe(false)
    expect(w.find('[data-testid="lock-off-narrow"]').exists()).toBe(false)
    l.resetLockState()
    await w.vm.$nextTick()
    expect(w.find('[data-testid="lock-start"]').exists()).toBe(true)
    w.unmount()
  })
  it('requestEdit 신호가 오면 비밀번호 입력창이 열리고 포커스가 간다', async () => {
    const l = useLockState()
    l.resetLockState()
    const w = mount(LockChip, { props: { scope: 'ip' }, global: { plugins: [i18n] }, attachTo: document.body })
    l.requestEdit('ip')
    await new Promise((r) => setTimeout(r, 0))
    const input = w.find('[data-testid="lock-password"]')
    expect(input.exists()).toBe(true)
    expect(document.activeElement).toBe(input.element)
    w.unmount()
  })
})
