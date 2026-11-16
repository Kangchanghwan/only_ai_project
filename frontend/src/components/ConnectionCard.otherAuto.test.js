import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const far = { socketId: 'f1', identity: { adj: 2, animal: 2 }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: 3 }
const ctx = { states: ref({}), incoming: ref(null), invite: vi.fn(), cancel() {}, open() {}, confirm: vi.fn() }
const build = () => mount(ConnectionCard, {
  props: { devices: [me], mySocketId: 'me', myIdentity: me.identity, wide: false, scope: 'ip', otherNetworkDevices: [far] },
  global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
})

describe('다른 네트워크 기기 묶음 자동 펼침', () => {
  beforeEach(() => { ctx.states.value = {} })

  it('묶음 안 기기에 요청이 진행 중이면 접혀 있어도 펼쳐지고, 직접 접어도 유지된다', async () => {
    const w = build()
    expect(w.find('[data-testid="other-network-list"]').exists()).toBe(false)
    ctx.states.value = { f1: { state: 'pending', sessionId: 's1', expiresAt: Date.now() + 20000, sas: [1, 2, 3, 4], confirmed: false } }
    await w.vm.$nextTick()
    expect(w.find('[data-testid="other-network-list"]').exists()).toBe(true)
    expect(w.find('[data-testid="other-network-toggle"]').attributes('aria-expanded')).toBe('true')
    await w.find('[data-testid="other-network-toggle"]').trigger('click')
    await w.find('[data-testid="other-network-toggle"]').trigger('click')
    expect(w.find('[data-testid="other-network-list"]').exists()).toBe(true)
  })

  it('connecting도 펼치고, 요청이 없으면 접힌 채다', async () => {
    const w = build()
    ctx.states.value = { f1: { state: 'connecting' } }
    await w.vm.$nextTick()
    expect(w.find('[data-testid="other-network-list"]').exists()).toBe(true)
    ctx.states.value = {}
    await w.vm.$nextTick()
    expect(w.find('[data-testid="other-network-list"]').exists()).toBe(false)
  })
})
