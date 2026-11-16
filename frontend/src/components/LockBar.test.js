import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LockBar from './LockBar.vue'
import i18n from '../i18n/index.js'
import { useLockState } from '../composables/useLockState'

const ls = useLockState()
const FAST = { iterations: 1000 }
const mk = (scope = 'ip') => mount(LockBar, { props: { scope }, global: { plugins: [i18n] }, attachTo: document.body })
const bar = (w) => w.find('[data-testid="lock-bar"]')

beforeEach(() => {
  ls.resetLockState()
})

describe('LockBar 상태', () => {
  it('잠금도 lapsed도 없으면 아무것도 그리지 않는다', () => {
    const w = mk()
    expect(bar(w).exists()).toBe(false)
    expect(w.find('[role="status"]').exists()).toBe(true)
    w.unmount()
  })

  it('on: 잠금이 켜지면 남색 줄과 풀기 버튼', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    const w = mk()
    expect(bar(w).attributes('data-state')).toBe('on')
    expect(bar(w).classes()).toContain('bg-ink')
    expect(w.find('[data-testid="lock-off"]').exists()).toBe(true)
    w.unmount()
  })

  it('lock-off를 눌러도 바로 풀리지 않고 confirm으로 간다', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    const w = mk()
    await w.find('[data-testid="lock-off"]').trigger('click')
    expect(ls.isLocked('ip')).toBe(true)
    expect(bar(w).attributes('data-state')).toBe('confirm')
    expect(document.activeElement).toBe(w.find('[data-testid="lock-off-cancel"]').element)
    w.unmount()
  })

  it('confirm 확인을 누르면 풀린다', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    const w = mk()
    await w.find('[data-testid="lock-off"]').trigger('click')
    await w.find('[data-testid="lock-off-confirm"]').trigger('click')
    expect(ls.isLocked('ip')).toBe(false)
    expect(bar(w).exists()).toBe(false)
    w.unmount()
  })

  it('취소와 Esc는 잠금을 유지하고 on으로 돌아간다', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    const w = mk()
    await w.find('[data-testid="lock-off"]').trigger('click')
    await w.find('[data-testid="lock-off-cancel"]').trigger('click')
    expect(ls.isLocked('ip')).toBe(true)
    expect(bar(w).attributes('data-state')).toBe('on')
    expect(document.activeElement).toBe(w.find('[data-testid="lock-off"]').element)
    await w.find('[data-testid="lock-off"]').trigger('click')
    await bar(w).trigger('keydown', { key: 'Escape' })
    expect(ls.isLocked('ip')).toBe(true)
    expect(bar(w).attributes('data-state')).toBe('on')
    w.unmount()
  })

  it('범위가 바뀌면 확인 상태가 풀린다', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    await ls.setLock('global', 'abcd', FAST)
    const w = mk('ip')
    await w.find('[data-testid="lock-off"]').trigger('click')
    await w.setProps({ scope: 'global' })
    expect(bar(w).attributes('data-state')).toBe('on')
    w.unmount()
  })
})

describe('LockBar lapsed', () => {
  it('setLock은 표시를 남기고 clearLock·dismiss는 지운다 (비밀번호는 저장하지 않는다)', async () => {
    await ls.setLock('ip', 'abcd', FAST)
    expect(sessionStorage.getItem('lock-was-on:ip')).toBe('1')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('abcd')
    ls.clearLock('ip')
    expect(sessionStorage.getItem('lock-was-on:ip')).toBeNull()
    sessionStorage.setItem('lock-was-on:global', '1')
    ls.lapsed.global = true
    ls.dismissLapsed('global')
    expect(sessionStorage.getItem('lock-was-on:global')).toBeNull()
    expect(ls.lapsed.global).toBe(false)
  })

  it('새로고침 흉내: 표시가 있으면 lapsed가 true로 시작하고 막대가 보인다', async () => {
    sessionStorage.setItem('lock-was-on:ip', '1')
    vi.resetModules()
    const fresh = await import('../composables/useLockState')
    const f = fresh.useLockState()
    expect(f.lapsed.ip).toBe(true)
    expect(f.lapsed.global).toBe(false)
    expect(f.isLocked('ip')).toBe(false)
    f.resetLockState()
  })

  it('lapsed 막대: 다시 잠그기는 입력 신호를, X는 닫기를 한다', async () => {
    ls.lapsed.ip = true
    const w = mk()
    expect(bar(w).attributes('data-state')).toBe('lapsed')
    const before = ls.editRequest.ip
    await w.find('[data-testid="lock-relock"]').trigger('click')
    expect(ls.editRequest.ip).toBe(before + 1)
    await w.find('[data-testid="lock-lapsed-dismiss"]').trigger('click')
    expect(bar(w).exists()).toBe(false)
    w.unmount()
  })

  it('잠금을 다시 켜면 lapsed가 사라진다', async () => {
    ls.lapsed.ip = true
    await ls.setLock('ip', 'abcd', FAST)
    expect(ls.lapsed.ip).toBe(false)
  })
})

describe('LockBar 설명 글', () => {
  it('텍스트도 잠길 때만 "파일과 텍스트" 설명을 보여 준다 (텍스트 보관 미지원 백엔드에서는 숨김)', async () => {
    await ls.setLock('ip', 'test1234', FAST)
    const on = mk()
    expect(on.find('[data-testid="lock-bar-desc"]').exists()).toBe(true)
    on.unmount()
    const filesOnly = mount(LockBar, { props: { scope: 'ip', textLocked: false }, global: { plugins: [i18n] } })
    expect(filesOnly.find('[data-testid="lock-bar"]').attributes('data-state')).toBe('on')
    expect(filesOnly.find('[data-testid="lock-bar-desc"]').exists()).toBe(false)
    expect(filesOnly.find('[data-testid="lock-off"]').exists()).toBe(true)
    filesOnly.unmount()
  })
})
