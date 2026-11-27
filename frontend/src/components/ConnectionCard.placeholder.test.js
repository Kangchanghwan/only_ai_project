import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'
import { nextTick } from 'vue'
import { saveDeviceHint, readDeviceHint, resetLayoutHintCache } from '../utils/layoutHint'

const fox = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: Date.now() - 60_000 })
const global = { plugins: [i18n] }
const flush = async () => { for (let i = 0; i < 4; i++) await nextTick() }

beforeEach(() => {
  localStorage.clear()
  resetLayoutHintCache()
})

describe('ConnectionCard 기기 카드 줄 자리표시', () => {
  it('devices가 비어 있으면 자리표시가 있고, 표시 전용 속성은 없다', () => {
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false }, global })
    const ph = w.find('[data-testid="device-cards-placeholder"]')
    expect(ph.exists()).toBe(true)
    expect(ph.attributes('aria-hidden')).toBe('true')
    expect(ph.attributes('data-prerender-strip')).toBeUndefined()
    expect(ph.attributes('role')).toBeUndefined()
    expect(w.find('[data-testid="device-cards"]').exists()).toBe(false)
  })
  it('기기가 있으면 자리표시가 없다', () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox, wide: false }, global })
    expect(w.find('[data-testid="device-cards-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="device-cards"]').exists()).toBe(true)
  })
  it('wide에서는 자리표시가 없다', () => {
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: true }, global })
    expect(w.find('[data-testid="device-cards-placeholder"]').exists()).toBe(false)
  })
})

describe('ConnectionCard 지난번 배치로 자리 잡기', () => {
  const ph = (w) => w.findAll('[data-testid="device-card-placeholder"]')
  it('기억이 없으면 자리 카드 하나, 다른 자리 블록은 없다', () => {
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false }, global })
    expect(ph(w)).toHaveLength(1)
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="empty-state-placeholder"]').exists()).toBe(false)
  })
  it('지난번 카드 수만큼 자리 카드를 그리고, 넓은 화면은 두 줄(176px)까지만 차지한다', () => {
    saveDeviceHint('ip', { cards: 9, otherNet: false, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false, scope: 'ip' }, global })
    expect(ph(w)).toHaveLength(9)
    expect(w.find('[data-testid="device-cards-placeholder"] ul').classes()).toContain('sm:max-h-[176px]')
    for (const li of ph(w)) expect(li.classes()).toContain('h-[85px]')
  })
  it('지난번에 다른 네트워크 기기 묶음이 있었으면 그 자리도 잡는다', () => {
    saveDeviceHint('ip', { cards: 3, otherNet: true, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false, scope: 'ip' }, global })
    const o = w.find('[data-testid="other-network-placeholder"]')
    expect(o.exists()).toBe(true)
    expect(o.attributes('aria-hidden')).toBe('true')
    expect(o.classes()).toContain('mt-2')
    expect(o.classes()).not.toContain('border-t')
  })
  it('지난번에 혼자였으면 안내 블록 높이만큼 자리를 잡는다', () => {
    saveDeviceHint('ip', { cards: 1, otherNet: false, soloHeight: 251 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false, scope: 'ip' }, global })
    const e = w.find('[data-testid="empty-state-placeholder"]')
    expect(e.exists()).toBe(true)
    expect(e.attributes('style')).toContain('height: 251px')
    expect(e.attributes('aria-hidden')).toBe('true')
  })
  it('범위별로 따로 기억한다', () => {
    saveDeviceHint('global', { cards: 8, otherNet: false, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false, scope: 'ip' }, global })
    expect(ph(w)).toHaveLength(1)
  })
  it('기기가 연결되면 자리 블록은 모두 사라진다', async () => {
    saveDeviceHint('ip', { cards: 4, otherNet: true, soloHeight: 251 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip' }, global })
    expect(w.find('[data-testid="empty-state-placeholder"]').exists()).toBe(true)
    await w.setProps({ devices: [dev('me', fox), dev('b', { adj: 2, animal: 2 })] })
    expect(w.find('[data-testid="device-cards-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="empty-state-placeholder"]').exists()).toBe(false)
  })
  it('연결된 뒤의 카드 수를 기억해 둔다', async () => {
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip' }, global })
    expect(readDeviceHint('ip')).toBeNull()
    await w.setProps({ devices: [dev('me', fox), dev('b', { adj: 2, animal: 2 }), dev('c', { adj: 3, animal: 3 })] })
    await flush()
    expect(readDeviceHint('ip')).toMatchObject({ cards: 3, soloHeight: 0 })
  })
  it('연결 전(빈 목록)에는 기억을 덮어쓰지 않는다', async () => {
    saveDeviceHint('ip', { cards: 6, otherNet: false, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: '', myIdentity: fox, wide: false, scope: 'ip' }, global })
    await w.setProps({ scope: 'global' })
    await w.setProps({ scope: 'ip' })
    await flush()
    expect(readDeviceHint('ip')?.cards).toBe(6)
  })
  it('혼자일 때 QR을 만드는 동안에도 같은 크기의 자리를 둔다', async () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip' }, global })
    await nextTick()
    const hasQr = w.find('[data-testid="empty-state-qr"]').exists()
    const hasBox = w.find('[data-testid="empty-state-qr-placeholder"]').exists()
    expect(hasQr || hasBox).toBe(true)
    expect(hasQr && hasBox).toBe(false)
    if (hasBox) expect(w.find('[data-testid="empty-state-qr-placeholder"]').classes()).toEqual(expect.arrayContaining(['w-[140px]', 'h-[140px]', 'mb-1']))
  })
})

describe('ConnectionCard 다른 네트워크 묶음 자리: 전체 공유 목록을 기다리는 동안', () => {
  const others = [dev('b', { adj: 2, animal: 2 })]
  const far = [dev('z', { adj: 9, animal: 9 })]
  it('같은 네트워크 목록만 먼저 와도 자리는 유지된다 (접혔다 펴지지 않는다)', async () => {
    saveDeviceHint('ip', { cards: 2, otherNet: true, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip', otherNetworkPending: true }, global })
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(true)
    await w.setProps({ devices: [dev('me', fox), ...others] })
    expect(w.find('[data-testid="device-cards"]').exists()).toBe(true)
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(true)
    await w.setProps({ otherNetworkPending: false })
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(false)
  })
  it('기다리는 동안에는 "묶음 없음"으로 기억을 덮어쓰지 않는다', async () => {
    saveDeviceHint('ip', { cards: 2, otherNet: true, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip', otherNetworkPending: true }, global })
    await w.setProps({ devices: [dev('me', fox), ...others] })
    await flush()
    expect(readDeviceHint('ip')).toMatchObject({ cards: 2, otherNet: true })
    await w.setProps({ otherNetworkPending: false, otherNetworkDevices: [] })
    await flush()
    expect(readDeviceHint('ip')).toMatchObject({ cards: 2, otherNet: false })
  })
  it('기억에 묶음이 없었으면 기다리는 동안에도 자리를 잡지 않는다', async () => {
    saveDeviceHint('ip', { cards: 2, otherNet: false, soloHeight: 0 })
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox), ...others], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip', otherNetworkPending: true }, global })
    expect(w.find('[data-testid="other-network-placeholder"]').exists()).toBe(false)
  })
  it('연결된 뒤에는 혼자일 때 자리 블록을 다시 그리지 않는다', async () => {
    saveDeviceHint('ip', { cards: 1, otherNet: true, soloHeight: 251 })
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox), ...others], mySocketId: 'me', myIdentity: fox, wide: false, scope: 'ip', otherNetworkPending: true, otherNetworkDevices: far }, global })
    expect(w.find('[data-testid="empty-state-placeholder"]').exists()).toBe(false)
  })
})
