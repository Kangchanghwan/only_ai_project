import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DeviceCards from './DeviceCards.vue'
import ConnectionCard from './ConnectionCard.vue'
import AnimalAvatar from './AnimalAvatar.vue'
import { scopeForPrivateRoom } from '../composables/useShareScope'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const NOW = Date.now()
const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: NOW - 600000 }
const a = { socketId: 'a', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: NOW - 5000 }
const b = { socketId: 'b', identity: { adj: 2, animal: 2 }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: NOW - 180000 }
const ctx = { states: ref({}), incoming: ref(null), invite: vi.fn(), cancel: vi.fn(), open: vi.fn(), confirm: vi.fn(), respond: vi.fn() }
const build = (devices, extra = {}, provide = true) => mount(DeviceCards, {
  props: { devices, mySocketId: 'me', myIdentity: me.identity, ...extra },
  global: { plugins: [i18n], provide: provide ? { [PAIR_CONTEXT_KEY]: ctx } : {} }
})
beforeEach(() => { ctx.states.value = {}; ctx.incoming.value = null; Object.values(ctx).forEach((f) => f.mockClear?.()) })

describe('DeviceCards', () => {
  it('나와 다른 기기가 카드로 나오고 나는 항상 첫 장, "나" 태그가 붙는다', () => {
    const w = build([a, b, me])
    const cards = w.findAll('[data-testid="device-card"]')
    expect(cards).toHaveLength(3)
    expect(cards[0].attributes('data-me')).toBe('true')
    expect(cards[0].find('[data-testid="me-badge"]').text()).toBe('나')
    expect(w.findAll('[data-testid="me-badge"]')).toHaveLength(1)
    expect(cards[0].classes()).toContain('border-ink')
  })

  it('접속 시각 딱지: 지금이면 초록, 아니면 회색', () => {
    const w = build([me, a, b])
    const tags = w.findAll('[data-testid="device-card-status"]')
    // 정렬: 나 → 최근 접속(a, 지금) → b(3분 전)
    expect(tags[1].text()).toBe('지금')
    expect(tags[1].classes()).toContain('bg-scope-global')
    expect(tags[2].text()).toBe('3분 전')
    expect(tags[2].classes()).toContain('bg-text-secondary')
    expect(tags[2].classes()).not.toContain('bg-scope-global')
  })

  it('연결 버튼은 invite를 부르고 aria-label에 이름이 들어간다', async () => {
    const w = build([me, a])
    const btn = w.find('[data-testid="pair-invite-button"]')
    expect(btn.text()).toBe('연결')
    expect(btn.attributes('aria-label')).toContain('방으로 연결')
    await btn.trigger('click')
    expect(ctx.invite).toHaveBeenCalledWith(a)
  })

  it('받은 요청은 카드에 상태만 보이고 수락·거절 버튼은 없다(그림 확인 창에서만 결정)', async () => {
    ctx.incoming.value = { sessionId: 's', state: 'incoming', peer: a }
    const w = build([me, a, b])
    const card = w.findAll('[data-testid="device-card"]')[1] // 요청 중인 기기는 나 바로 다음
    expect(card.attributes('data-incoming')).toBe('true')
    expect(card.classes()).toContain('bg-tint')
    expect(card.find('[data-testid="pair-invite-button"]').exists()).toBe(false)
    expect(card.find('[data-testid="card-incoming"]').exists()).toBe(true)
    expect(card.find('[data-testid="card-accept"]').exists()).toBe(false)
    expect(card.find('[data-testid="card-decline"]').exists()).toBe(false)
    expect(ctx.respond).not.toHaveBeenCalled()
  })

  it('수락 대기 중이면 같은 줄에 대기 표시와 취소가 나온다', async () => {
    ctx.states.value = { a: { state: 'pending', sessionId: 's1', expiresAt: NOW + 20000 } }
    const w = build([me, a])
    expect(w.find('[data-testid="pair-pending-text"]').exists()).toBe(true)
    await w.find('[data-testid="card-cancel"]').trigger('click')
    expect(ctx.cancel).toHaveBeenCalledWith('s1')
  })

  it('다시 뽑기는 내 카드에만 있고 쿨다운이면 비활성', async () => {
    const w = build([me, a])
    expect(w.findAll('[data-testid="reroll-button"]')).toHaveLength(1)
    await w.find('[data-testid="reroll-button"]').trigger('click')
    expect(w.emitted('reroll')).toHaveLength(1)
    const cool = build([me, a], { rerollAvailableAt: Date.now() + 60000 })
    expect(cool.find('[data-testid="reroll-button"]').attributes('disabled')).toBeDefined()
  })

  it('1:1/그룹 방이거나 연결 기능이 없으면 다른 카드에 연결 버튼이 없다', () => {
    expect(build([me, a], { scope: scopeForPrivateRoom('r1') }).find('[data-testid="pair-invite-button"]').exists()).toBe(false)
    expect(build([me, a], {}, false).find('[data-testid="pair-invite-button"]').exists()).toBe(false)
    expect(build([me, a], {}, false).findAll('[data-testid="device-card"]')).toHaveLength(2)
  })

  it('이름·기기는 title에 전체가 들어간다', () => {
    const w = build([me, a])
    expect(w.findAll('[data-testid="device-card"]')[1].find('[data-testid="device-card-name"]').element.parentElement.parentElement.getAttribute('title')).toContain('사파리')
  })

  it('모바일 띠: 가로 스크롤 + 146px 카드, 숨은 카드 수 +N, 누르면 다음 카드로 스크롤', async () => {
    const w = build([me, a, b], {}, true)
    const strip = w.find('[data-testid="device-cards-strip"]')
    expect(strip.classes()).toContain('overflow-x-auto')
    expect(w.find('[data-testid="device-card"]').classes()).toContain('flex-[0_0_146px]')
    const el = strip.element
    Object.defineProperty(el, 'scrollWidth', { value: 450, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true })
    el.getBoundingClientRect = () => ({ right: 200, left: 0 })
    const cards = Array.from(el.querySelectorAll('[data-testid="device-card"]'))
    const scrolls = []
    cards.forEach((c, i) => { c.getBoundingClientRect = () => ({ right: 146 + i * 152 }); c.scrollIntoView = () => scrolls.push(i) })
    await strip.trigger('scroll')
    expect(w.find('[data-testid="cards-more-right"]').text()).toContain('+2')
    expect(w.find('[data-testid="cards-fade-right"]').exists()).toBe(true)
    await w.find('[data-testid="cards-more-right"]').trigger('click')
    expect(scrolls).toEqual([1])
  })

  it('네모 사진은 카드 안에서만, 다른 곳 아바타는 동그라미 그대로', () => {
    const w = build([me, a])
    expect(w.find('[data-testid="device-card-photo"]').classes()).toContain('rounded-none')
    expect(mount(AnimalAvatar, { props: { identity: a.identity } }).classes()).toContain('rounded-full')
  })
})

describe('ConnectionCard 헤더', () => {
  it('ip 범위에서만 ipNotice가 헤더에 같이 나온다', () => {
    const mk = (scope) => mount(ConnectionCard, { props: { devices: [me, a], mySocketId: 'me', myIdentity: me.identity, scope }, global: { plugins: [i18n] } })
    expect(mk('ip').find('[data-testid="cards-header"] [data-testid="ip-notice"]').exists()).toBe(true)
    expect(mk('global').find('[data-testid="ip-notice"]').exists()).toBe(false)
  })
})
