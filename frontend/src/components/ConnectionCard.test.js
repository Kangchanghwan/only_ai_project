import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import i18n from '../i18n/index.js'

const fox = { adj: 1, animal: 1 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: Date.now() - 60_000 })
const global = { plugins: [i18n] }

describe('ConnectionCard', () => {
  it('"다른 기기 N대"는 나를 제외한다', () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox), dev('a', { adj: 0, animal: 0 }), dev('b', { adj: 2, animal: 2 })], mySocketId: 'me', myIdentity: fox }, global })
    expect(w.find('[data-testid="other-count"]').text()).toContain('다른 기기 2대')
    expect(w.find('[data-testid="other-count"]').text()).not.toContain('연결 대기')
  })

  it('나 혼자면 "다른 기기 0대 · 연결 대기"', () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox }, global })
    expect(w.find('[data-testid="other-count"]').text()).toContain('다른 기기 0대')
    expect(w.find('[data-testid="other-count"]').text()).toContain('연결 대기')
  })

  it('좁은 화면: 펼침 트리거(ConnectedDevices)만 있고 옆 패널 목록은 없다', () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox), dev('a', { adj: 0, animal: 0 })], mySocketId: 'me', myIdentity: fox, wide: false }, global })
    expect(w.findComponent({ name: 'ConnectedDevices' }).exists()).toBe(true)
    expect(w.find('[data-testid="device-panel"]').exists()).toBe(false)
    expect(w.findAll('[data-testid="device-row"]')).toHaveLength(0)
  })

  it('넓은 화면: 목록이 항상 펼쳐져 있고 팝오버 트리거는 없다 (중복 목록 없음)', () => {
    const w = mount(ConnectionCard, { props: { devices: [dev('me', fox), dev('a', { adj: 0, animal: 0 })], mySocketId: 'me', myIdentity: fox, wide: true }, global })
    expect(w.find('[data-testid="device-panel"]').exists()).toBe(true)
    expect(w.findAll('[data-testid="device-row"]')).toHaveLength(2)
    expect(w.find('[data-testid="devices-trigger"]').exists()).toBe(false)
    expect(w.find('[data-testid="devices-popover"]').exists()).toBe(false)
  })

  it('두 모드 모두 같은 devices 하나에서 나온다 (wide 전환 시 열린 팝오버가 남지 않는다)', async () => {
    const props = { devices: [dev('me', fox), dev('a', { adj: 0, animal: 0 })], mySocketId: 'me', myIdentity: fox, wide: false }
    const w = mount(ConnectionCard, { props, global, attachTo: document.body })
    await w.find('[data-testid="devices-trigger"]').trigger('click')
    expect(w.find('[data-testid="devices-popover"]').exists()).toBe(true)
    await w.setProps({ wide: true })
    expect(w.find('[data-testid="devices-popover"]').exists()).toBe(false)
    expect(w.findAll('[data-testid="device-row"]')).toHaveLength(2)
    w.unmount()
  })

  it('"나: ... (이 기기)" 이름표 컴포넌트는 더 이상 없고, 넓은 화면 목록의 내 행에서 다시 뽑기가 emit 된다', async () => {
    const narrow = mount(ConnectionCard, { props: { devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox }, global })
    expect(narrow.text()).not.toContain('이 기기')
    expect(narrow.find('[data-testid="my-identity"]').exists()).toBe(false)
    const wide = mount(ConnectionCard, { props: { devices: [dev('me', fox), dev('a', { adj: 0, animal: 0 })], mySocketId: 'me', myIdentity: fox, wide: true }, global })
    await wide.find('[data-testid="reroll-button"]').trigger('click')
    expect(wide.emitted('reroll')).toHaveLength(1)
  })
})
