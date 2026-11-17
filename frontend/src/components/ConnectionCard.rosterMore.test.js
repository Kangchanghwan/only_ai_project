import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionCard from './ConnectionCard.vue'
import { ref } from 'vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const fox = { adj: 1, animal: 1 }
const cat = { adj: 2, animal: 2 }
const dev = (socketId, identity) => ({ socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', joinedAt: Date.now() - 60_000 })
const ctx = { states: ref({}), incoming: ref(null), invite() {}, cancel() {}, open() {}, confirm() {} }
const global = { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
const base = { scope: 'ip', devices: [dev('me', fox)], mySocketId: 'me', myIdentity: fox, wide: false, otherNetworkDevices: [dev('x', cat)] }

describe('다른 네트워크 묶음: 기준 인원 초과 시 이름으로 찾기 한 줄', () => {
  it('otherNetworkMore가 0이면 지금과 같은 펼치기 버튼만 있다', () => {
    i18n.global.locale.value = 'ko'
    const w = mount(ConnectionCard, { props: base, global })
    expect(w.find('[data-testid="other-network-toggle"]').exists()).toBe(true)
    expect(w.find('[data-testid="other-network-row"]').exists()).toBe(false)
    expect(w.find('[data-testid="roster-go-find"]').exists()).toBe(false)
  })

  it('otherNetworkMore가 있으면 펼치기와 찾기 링크가 한 줄에 있고, 누르면 go-find', async () => {
    i18n.global.locale.value = 'ko'
    const w = mount(ConnectionCard, { props: { ...base, otherNetworkMore: 41 }, global })
    const row = w.find('[data-testid="other-network-row"]')
    expect(row.exists()).toBe(true)
    expect(row.find('[data-testid="other-network-toggle"]').text()).toContain('1')
    expect(row.find('[data-testid="roster-go-find"]').text()).toBe('41대 더는 이름으로 찾기')
    await row.find('[data-testid="roster-go-find"]').trigger('click')
    expect(w.emitted('go-find')).toHaveLength(1)
  })

  it('보이는 다른 네트워크 기기가 없어도 찾기 링크는 보인다', () => {
    i18n.global.locale.value = 'ko'
    const w = mount(ConnectionCard, { props: { ...base, otherNetworkDevices: [], otherNetworkMore: 5 }, global })
    expect(w.find('[data-testid="other-network-toggle"]').exists()).toBe(false)
    expect(w.find('[data-testid="roster-go-find"]').text()).toBe('5대 더는 이름으로 찾기')
  })
})
