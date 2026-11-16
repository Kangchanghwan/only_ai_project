import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'

const fox = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: Date.now() - 60_000 })
const global = { plugins: [i18n] }

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
