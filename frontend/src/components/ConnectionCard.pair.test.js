import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const other = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: 2 }
const ctx = { states: ref({}), invite() {}, cancel() {}, open() {} }

const build = (devices, extra = {}) => mount(ConnectionCard, {
  props: { devices, mySocketId: 'me', myIdentity: me.identity, wide: false, ...extra },
  global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
})

describe('ConnectionCard 1:1 첫 안내(폰)', () => {
  beforeEach(() => localStorage.removeItem('pair-hint-dismissed'))

  it('다른 기기가 1대 이상이면 한 줄 안내, 닫으면 localStorage에 기록되고 사라진다', async () => {
    const w = build([me, other])
    expect(w.find('[data-testid="pair-hint"]').text()).toContain('둘만 쓰는 1:1 방을 열 수 있어요')
    await w.find('[data-testid="pair-hint-close"]').trigger('click')
    expect(w.find('[data-testid="pair-hint"]').exists()).toBe(false)
    expect(localStorage.getItem('pair-hint-dismissed')).toBe('1')
    expect(build([me, other]).find('[data-testid="pair-hint"]').exists()).toBe(false)
  })

  it('나 혼자거나 넓은 화면이면 안내가 없다', () => {
    expect(build([me]).find('[data-testid="pair-hint"]').exists()).toBe(false)
    expect(build([me, other], { wide: true }).find('[data-testid="pair-hint"]').exists()).toBe(false)
  })
})
