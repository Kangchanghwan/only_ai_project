import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const other2 = { socketId: 'p2', identity: { adj: 2, animal: 2 }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: 3 }
const other = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: 2 }
const ctx = { states: ref({}), invite: vi.fn(), cancel() {}, open() {}, confirm: vi.fn() }

const build = (devices, extra = {}) => mount(ConnectionCard, {
  props: { devices, mySocketId: 'me', myIdentity: me.identity, wide: false, ...extra },
  global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
})

describe('ConnectionCard 1:1 첫 안내(폰)', () => {
  beforeEach(() => localStorage.removeItem('pair-hint-dismissed'))

  it('다른 기기가 2대 이상이면 한 줄 안내, 닫으면 localStorage에 기록되고 사라진다', async () => {
    const w = build([me, other, other2])
    expect(w.find('[data-testid="pair-hint"]').text()).toContain('둘만 쓰는 1:1 방을 열 수 있어요')
    await w.find('[data-testid="pair-hint-close"]').trigger('click')
    expect(w.find('[data-testid="pair-hint"]').exists()).toBe(false)
    expect(localStorage.getItem('pair-hint-dismissed')).toBe('1')
    expect(build([me, other, other2]).find('[data-testid="pair-hint"]').exists()).toBe(false)
  })

  it('나 혼자거나 넓은 화면이면 안내가 없다', () => {
    expect(build([me]).find('[data-testid="pair-hint"]').exists()).toBe(false)
    expect(build([me, other], { wide: true }).find('[data-testid="pair-hint"]').exists()).toBe(false)
  })
})

describe('ConnectionCard 폰 바로가기', () => {
  beforeEach(() => { localStorage.removeItem('pair-hint-dismissed'); ctx.states.value = {}; ctx.invite.mockClear() })

  it('다른 기기가 정확히 1대면 "○○와 1:1" 44px 버튼을 바로 보여 주고 안내 문구는 숨긴다', async () => {
    const w = build([me, other])
    const btn = w.find('[data-testid="pair-shortcut"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/와 1:1$/)
    expect(btn.classes()).toContain('min-h-[44px]')
    expect(w.find('[data-testid="pair-hint"]').exists()).toBe(false)
    await btn.trigger('click')
    expect(ctx.invite).toHaveBeenCalledWith(other)
  })

  it('2대 이상, 나 혼자, 넓은 화면에서는 바로가기가 없다', () => {
    expect(build([me, other, other2]).find('[data-testid="pair-shortcut"]').exists()).toBe(false)
    expect(build([me]).find('[data-testid="pair-shortcut"]').exists()).toBe(false)
    expect(build([me, other], { wide: true }).find('[data-testid="pair-shortcut"]').exists()).toBe(false)
  })

  it('이미 연결 중/연결된 상대면 바로가기가 없다', () => {
    ctx.states.value = { p1: { state: 'paired', roomId: 'prv-1' } }
    expect(build([me, other]).find('[data-testid="pair-shortcut"]').exists()).toBe(false)
  })

  it('수락 대기 중이면 바로가기 자리에 그림 확인 행이 나오고 "같아요"가 confirm을 부른다', async () => {
    ctx.states.value = { p1: { state: 'pending', sessionId: 's1', expiresAt: Date.now() + 20000, sas: [1, 2, 3, 4], confirmed: false } }
    const w = build([me, other])
    expect(w.find('[data-testid="pair-shortcut"]').exists()).toBe(false)
    await w.find('[data-testid="pair-same-inline"]').trigger('click')
    expect(ctx.confirm).toHaveBeenCalledWith('s1')
  })
})
