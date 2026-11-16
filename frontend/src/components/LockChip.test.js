import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LockChip from './LockChip.vue'
import i18n from '../i18n/index.js'

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
