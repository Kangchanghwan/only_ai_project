import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import i18n from '../i18n/index.js'
import ConnectedDevices from './ConnectedDevices.vue'
import SenderLabel from './SenderLabel.vue'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const global = { plugins: [i18n] }
const fox = { adj: 1, animal: 1 }
const panda = { adj: 0, animal: 0 }
const owl = { adj: 2, animal: 10 }

const dev = (socketId, identity, extra = {}) => ({
  socketId, identity, deviceType: 'desktop', browser: 'Chrome', os: 'macOS', deviceLabel: 'mac', joinedAt: Date.now() - 3 * 60_000, ...extra
})

afterEach(() => { i18n.global.locale.value = 'ko' })

describe('ConnectedDevices (정체성 표시)', () => {
  it('identity가 있으면 이모지 아이콘 대신 동물 아바타를 그린다', () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [dev('a', panda), dev('b', fox)] }, global })
    expect(wrapper.findAll('[data-testid="animal-avatar"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('💻')
  })

  it('identity가 없는 구버전 백엔드 데이터는 기존 아이콘으로 폴백한다', () => {
    const legacy = { socketId: 'a', deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
    const wrapper = mount(ConnectedDevices, { props: { devices: [legacy] }, global })
    expect(wrapper.find('[data-testid="animal-avatar"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('📱')
    expect(wrapper.find('[title]').attributes('title')).toBe('Safari · iOS')
  })

  it('아바타를 누르면 목록이 열리고 이름/기기·브라우저/접속 시점이 보인다', async () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [dev('a', panda)], scope: 'ip' }, global, attachTo: document.body })
    expect(wrapper.find('[data-testid="devices-popover"]').exists()).toBe(false)
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    const row = wrapper.find('[data-testid="device-row"]')
    expect(row.text()).toContain('졸린 판다')
    expect(row.text()).toContain('Mac 크롬')
    expect(row.text()).toContain('3분 전')
    expect(wrapper.find('[data-testid="devices-popover"]').text()).toContain('연결된 거예요')
    wrapper.unmount()
  })

  it('내 기기는 "나" 배지와 함께 맨 위에 온다', async () => {
    const devices = [dev('a', panda, { joinedAt: 1 }), dev('me', fox, { joinedAt: 999 })]
    const wrapper = mount(ConnectedDevices, { props: { devices, mySocketId: 'me', myIdentity: fox }, global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="device-row"]')
    expect(rows[0].text()).toContain('용감한 여우')
    expect(rows[0].find('[data-testid="me-badge"]').text()).toBe('나')
    expect(rows[1].find('[data-testid="me-badge"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('전체 공유 방은 안내 문구가 다르다', async () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [dev('a', panda)], scope: 'global' }, global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    expect(wrapper.find('[data-testid="devices-popover"]').text()).toContain('모르는 사람도 볼 수 있어요')
    wrapper.unmount()
  })

  it('Escape로 닫힌다', async () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [dev('a', panda)] }, global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="devices-popover"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('내 정보는 펼친 목록에서만 보인다 (MyIdentity 제거)', () => {
  const props = (extra = {}) => ({ devices: [dev('me', panda), dev('o', fox)], mySocketId: 'me', myIdentity: panda, ...extra })

  it('접힌 상태에서는 "나: ... (이 기기)" 이름표와 다시 뽑기 버튼이 없다', () => {
    const wrapper = mount(ConnectedDevices, { props: props(), global })
    expect(wrapper.text()).not.toContain('이 기기')
    expect(wrapper.find('[data-testid="my-identity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reroll-button"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="animal-avatar"]').length).toBeGreaterThan(0)
  })

  it('펼치면 내 행에 "나" 배지와 다시 뽑기가 있다 (남의 행에는 없다)', async () => {
    const wrapper = mount(ConnectedDevices, { props: props(), global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="device-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('[data-testid="me-badge"]').text()).toBe('나')
    expect(rows[0].find('[data-testid="reroll-button"]').exists()).toBe(true)
    expect(rows[1].find('[data-testid="me-badge"]').exists()).toBe(false)
    expect(rows[1].find('[data-testid="reroll-button"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('다시 뽑기 클릭 시 reroll 이벤트가 올라온다', async () => {
    const wrapper = mount(ConnectedDevices, { props: props(), global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    await wrapper.find('[data-testid="reroll-button"]').trigger('click')
    expect(wrapper.emitted('reroll')).toHaveLength(1)
    wrapper.unmount()
  })

  it('쿨다운 중에는 다시 뽑기 버튼이 비활성화된다', async () => {
    const wrapper = mount(ConnectedDevices, { props: props({ rerollAvailableAt: Date.now() + 5000 }), global, attachTo: document.body })
    await wrapper.find('[data-testid="devices-trigger"]').trigger('click')
    expect(wrapper.find('[data-testid="reroll-button"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('SenderLabel (보낸 사람 표시)', () => {
  const provide = (extra = {}) => ({
    [SENDER_CONTEXT_KEY]: {
      mySocketId: ref('me'),
      myIdentity: ref(fox),
      devices: ref([dev('me', fox), dev('o', owl)]),
      ...extra
    }
  })
  const time = Date.now() - 3 * 60_000

  it('내 것은 "나 · 3분 전"', () => {
    const wrapper = mount(SenderLabel, { props: { sender: dev('me', fox), time }, global: { ...global, provide: provide() } })
    expect(wrapper.text()).toBe('나 · 3분 전')
    expect(wrapper.attributes('data-state')).toBe('me')
  })

  it('타인은 "졸린 판다 · 3분 전" 식으로 이름을 보여준다', () => {
    const wrapper = mount(SenderLabel, { props: { sender: dev('o', owl), time }, global: { ...global, provide: provide() } })
    expect(wrapper.text()).toBe('행복한 부엉이 · 3분 전')
    expect(wrapper.attributes('data-state')).toBe('present')
  })

  it('지금 방에 없는 기기는 "나간 기기"로 표시하고 동물을 회색 처리한다', () => {
    const wrapper = mount(SenderLabel, { props: { sender: dev('gone', panda), time }, global: { ...global, provide: provide() } })
    expect(wrapper.text()).toContain('졸린 판다')
    expect(wrapper.text()).toContain('나간 기기')
    expect(wrapper.attributes('data-state')).toBe('left')
    expect(wrapper.find('[data-testid="animal-avatar"]').classes()).toContain('grayscale')
  })

  it('sender 정보가 없으면 아무것도 그리지 않는다', () => {
    const wrapper = mount(SenderLabel, { props: { sender: null, time }, global: { ...global, provide: provide() } })
    expect(wrapper.find('[data-testid="sender-label"]').exists()).toBe(false)
  })

  it('영어 UI에서는 영어 이름/상대시간', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(SenderLabel, { props: { sender: dev('o', owl), time }, global: { ...global, provide: provide() } })
    expect(wrapper.text()).toBe('Happy Owl · 3 minutes ago')
  })
})
