import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DeviceCards from './DeviceCards.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const NOW = Date.now()
const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: NOW - 900000 }
const others = (n) => Array.from({ length: n }, (_, i) => ({ socketId: `d${String(i).padStart(2, '0')}`, identity: { adj: 1 + (i % 10), animal: 1 + Math.floor(i / 10) }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: NOW - 1000 * (i + 1) }))
const ctx = { states: ref({}), incoming: ref(null), invite: vi.fn(), cancel: vi.fn(), open: vi.fn() }
let roCb = null

beforeEach(() => {
  ctx.states.value = {}
  roCb = null
  globalThis.ResizeObserver = class { constructor(cb) { roCb = cb } observe() {} disconnect() {} }
})
afterEach(() => { delete globalThis.ResizeObserver })

// 5칸 = 폭 5*150 + 4*6 = 774
async function build(count, width = 774) {
  const w = mount(DeviceCards, {
    props: { devices: [me, ...others(count - 1)], mySocketId: 'me', myIdentity: me.identity },
    global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
  })
  const ul = w.find('[data-testid="device-cards-strip"]').element
  Object.defineProperty(ul, 'clientWidth', { value: width, configurable: true })
  roCb([])
  await w.vm.$nextTick()
  return w
}
const cards = (w) => w.findAll('[data-testid="device-card"]')

describe('DeviceCards 최대 2줄 (PC)', () => {
  it('5칸에 11대면 카드 9장 + "+2대 더 보기", 누르면 11장 + "접기", 다시 누르면 접힌다', async () => {
    const w = await build(11)
    expect(cards(w)).toHaveLength(9)
    const tile = w.find('[data-testid="cards-more-tile"]')
    expect(tile.text()).toBe('+2대 더 보기')
    expect(tile.attributes('aria-expanded')).toBe('false')
    await tile.trigger('click')
    expect(cards(w)).toHaveLength(11)
    const fold = w.find('[data-testid="cards-more-tile"]')
    expect(fold.text()).toBe('접기')
    expect(fold.attributes('aria-expanded')).toBe('true')
    await fold.trigger('click')
    expect(cards(w)).toHaveLength(9)
  })

  it('10대 이하면 칸이 없다', async () => {
    const w = await build(10)
    expect(cards(w)).toHaveLength(10)
    expect(w.find('[data-testid="cards-more-tile"]').exists()).toBe(false)
  })

  it('요청 중인 기기는 정렬로 앞에 올라와 접힌 상태에서도 가려지지 않는다', async () => {
    const w = await build(11)
    ctx.states.value = { d09: { state: 'pending', sessionId: 's' } }
    await w.vm.$nextTick()
    expect(cards(w)).toHaveLength(9)
    expect(w.text()).toContain('+2대 더 보기')
    expect(cards(w)[1].find('[data-testid="pair-pending-text"]').exists()).toBe(true)
  })

  it('요청 중인 기기가 보이는 칸 수보다 많으면 자동으로 펼친다', async () => {
    const w = await build(11)
    ctx.states.value = Object.fromEntries(others(10).slice(0, 9).map((d) => [d.socketId, { state: 'pending', sessionId: 's' }]))
    await w.vm.$nextTick()
    expect(cards(w)).toHaveLength(11)
  })
})
