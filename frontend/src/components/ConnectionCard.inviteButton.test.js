import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const dev = (socketId, a) => ({ socketId, identity: { adj: a, animal: a }, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: Date.now() - 60_000 })
const ctx = { states: ref({}), incoming: ref(null), invite() {}, cancel() {}, open() {}, confirm() {} }
const global = { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
const base = { scope: 'ip', devices: [dev('me', 1), dev('o', 2)], mySocketId: 'me', myIdentity: { adj: 1, animal: 1 }, wide: false }
const mk = (props = {}) => { i18n.global.locale.value = 'ko'; return mount(ConnectionCard, { props: { ...base, ...props }, global }) }

describe('ConnectionCard 휴대폰 초대 입구 (PC 제목 줄 버튼 / 좁은 화면 타일)', () => {
  it('다른 기기가 있으면 제목 줄 버튼(sm 이상)과 카드 줄 타일(sm 미만)이 둘 다 DOM에 있고 누르면 invite-phone', async () => {
    const w = mk()
    const btn = w.find('[data-testid="cards-header"] [data-testid="invite-phone-button"]')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline-flex', 'border-dashed', 'min-h-[36px]']))
    expect(btn.text()).toBe('휴대폰 초대')
    expect(w.find('[data-testid="invite-phone-card"]').exists()).toBe(true)
    await btn.trigger('click')
    await w.find('[data-testid="invite-phone-card"]').trigger('click')
    expect(w.emitted('invite-phone')).toHaveLength(2)
  })
  it('같은 네트워크 탭에서 혼자이거나 1:1 방이면 둘 다 없다', () => {
    for (const w of [mk({ devices: [dev('me', 1)] }), mk({ scope: 'prv:abc' })]) {
      expect(w.find('[data-testid="invite-phone-button"]').exists()).toBe(false)
      expect(w.find('[data-testid="invite-phone-card"]').exists()).toBe(false)
    }
  })
  it('전체 공유 탭은 기기 수와 상관없이 항상 "휴대폰에서 열기" 입구가 있고 scope를 실어 invite-phone을 낸다', async () => {
    for (const devices of [[dev('me', 1)], [dev('me', 1), dev('o', 2)]]) {
      const w = mk({ scope: 'global', devices })
      const btn = w.find('[data-testid="invite-phone-button"]')
      expect(btn.text()).toBe('휴대폰에서 열기')
      const tile = w.find('[data-testid="invite-phone-card"]')
      expect(tile.text()).toContain('휴대폰에서 열기')
      expect(tile.text()).toContain('사이트 주소')
      await btn.trigger('click')
      await tile.trigger('click')
      expect(w.emitted('invite-phone')).toEqual([['global'], ['global']])
    }
  })
  it('전체 공유 탭에는 빈 방 QR 안내(empty-state)가 없다', () => {
    expect(mk({ scope: 'global', devices: [dev('me', 1)] }).find('[data-testid="empty-state"]').exists()).toBe(false)
  })
})
