import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DeviceCards from './DeviceCards.vue'
import i18n from '../i18n/index.js'

const me = { adj: 1, animal: 1 }
const dev = (socketId, i) => ({ socketId, identity: { adj: i + 2, animal: i + 2 }, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: 1000 - i })
const devices = [dev('me', -2), dev('a', 1), dev('b', 2)]
const mk = (props = {}) => mount(DeviceCards, { props: { devices, mySocketId: 'me', myIdentity: { adj: 0, animal: 0 }, scope: 'ip', ...props }, global: { plugins: [i18n] } })
const strip = (w) => Array.from(w.find('[data-testid="device-cards-strip"]').element.children)

describe('DeviceCards 휴대폰 초대 카드', () => {
  it('기본은 없다', () => {
    i18n.global.locale.value = 'ko'
    expect(mk().find('[data-testid="invite-phone-card"]').exists()).toBe(false)
  })
  it('켜면 나 카드 바로 뒤(2번째)에 점선 타일, 글·휴대폰 아이콘, 누르면 invite-phone', async () => {
    i18n.global.locale.value = 'ko'
    const w = mk({ inviteCard: true })
    const kids = strip(w)
    expect(kids).toHaveLength(4)
    const tile = w.find('[data-testid="invite-phone-card"]')
    expect(kids[1].contains(tile.element)).toBe(true)
    expect(tile.classes()).toContain('border-dashed')
    expect(tile.classes()).toContain('h-[85px]')
    expect(tile.text()).toContain('휴대폰 초대')
    expect(tile.text()).toContain('이 네트워크로')
    expect(tile.find('svg').exists()).toBe(true)
    await tile.trigger('click')
    expect(w.emitted('invite-phone')).toHaveLength(1)
  })

  it('초대 타일은 좁은 화면 전용(sm:hidden)이라 PC 2줄 용량을 줄이지 않는다: 5칸이면 카드 9장 + "+N" 타일', async () => {
    i18n.global.locale.value = 'ko'
    let roCb
    globalThis.ResizeObserver = class { constructor(cb) { roCb = cb } observe() {} disconnect() {} }
    const many = [dev('me', -2), ...Array.from({ length: 11 }, (_, i) => dev(`d${i}`, i))]
    const w = mk({ inviteCard: true, devices: many })
    Object.defineProperty(w.find('[data-testid="device-cards-strip"]').element, 'clientWidth', { value: 774, configurable: true })
    roCb([])
    await w.vm.$nextTick()
    expect(w.findAll('[data-testid="device-card"]')).toHaveLength(9)
    expect(w.find('[data-testid="invite-phone-card"]').element.parentElement.className).toContain('sm:hidden')
    expect(w.find('[data-testid="cards-more-tile"]').exists()).toBe(true)
  })
  afterEach(() => { delete globalThis.ResizeObserver })
})
