import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'
import { loadAllSas } from '../test/sasLoad.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const other2 = { socketId: 'p2', identity: { adj: 2, animal: 2 }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: 3 }
const other = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: 2 }
const ctx = { states: ref({}), invite: vi.fn(), cancel() {}, open() {}, confirm: vi.fn() }

const build = (devices, extra = {}) => mount(ConnectionCard, {
  props: { devices, mySocketId: 'me', myIdentity: me.identity, wide: false, ...extra },
  global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
})

describe('ConnectionCard 안내 제거', () => {
  it('첫 안내 문구·바로가기 버튼은 더 이상 없고 카드의 연결 버튼이 대신한다', () => {
    const w = build([me, other, other2])
    expect(w.find('[data-testid="pair-hint"]').exists()).toBe(false)
    expect(w.find('[data-testid="pair-shortcut"]').exists()).toBe(false)
    expect(w.findAll('[data-testid="pair-invite-button"]')).toHaveLength(2)
  })
})

describe('ConnectionCard 연결 진행', () => {
  beforeEach(() => { localStorage.removeItem('pair-hint-dismissed'); ctx.states.value = {}; ctx.invite.mockClear() })

  it('다른 기기 카드의 연결 버튼이 invite를 부른다', async () => {
    const w = build([me, other])
    await w.find('[data-testid="pair-invite-button"]').trigger('click')
    expect(ctx.invite).toHaveBeenCalledWith(other)
  })

  it('수락 대기 중이면 바로가기 자리에 그림 확인 행이 나오고 "같아요"가 confirm을 부른다', async () => {
    ctx.states.value = { p1: { state: 'pending', sessionId: 's1', expiresAt: Date.now() + 20000, sas: [1, 2, 3, 4], confirmed: false } }
    const w = build([me, other])
    expect(w.find('[data-testid="pair-invite-button"]').exists()).toBe(false)
    await loadAllSas(w.element)
    await w.find('[data-testid="pair-same-inline"]').trigger('click')
    expect(ctx.confirm).toHaveBeenCalledWith('s1')
  })
})
