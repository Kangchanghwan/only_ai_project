import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DeviceList from './DeviceList.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: 2 }

function build(states = {}, props = {}) {
  const ctx = { states: ref(states), invite: vi.fn(), cancel: vi.fn(), open: vi.fn(), confirm: vi.fn() }
  const wrapper = mount(DeviceList, {
    props: { devices: [me, peer], mySocketId: 'me', myIdentity: me.identity, ...props },
    global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: ctx } }
  })
  return { wrapper, ctx }
}

describe('DeviceList 1:1 버튼', () => {
  it('컨텍스트가 없으면 버튼이 없다 (기존 동작)', () => {
    const wrapper = mount(DeviceList, { props: { devices: [me, peer], mySocketId: 'me', myIdentity: me.identity }, global: { plugins: [i18n] } })
    expect(wrapper.find('[data-testid="pair-invite-button"]').exists()).toBe(false)
  })

  it('내 행에는 없고 다른 기기 행에만 있으며 aria-label에 상대 이름이 들어간다', async () => {
    const { wrapper, ctx } = build()
    const buttons = wrapper.findAll('[data-testid="pair-invite-button"]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('aria-label')).toMatch(/둘만 쓰는 방 열기|private room/)
    expect(buttons[0].text()).toBe('1:1 연결')
    await buttons[0].trigger('click')
    expect(ctx.invite).toHaveBeenCalledWith(peer)
  })

  it('넓은 패널(wide)은 짧은 "1:1"', () => {
    const { wrapper } = build({}, { wide: true })
    expect(wrapper.find('[data-testid="pair-invite-button"]').text()).toBe('1:1')
  })

  it('수락 대기 중이면 안내 문구와 취소 버튼, 취소하면 cancel(sessionId)', async () => {
    const { wrapper, ctx } = build({ p1: { state: 'pending', sessionId: 's1', expiresAt: Date.now() + 30000 } })
    expect(wrapper.find('[data-testid="pair-invite-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pair-pending-text"]').text()).toMatch(/^확인 중 · \d+초$/)
    await wrapper.find('[data-testid="pair-cancel-button"]').trigger('click')
    expect(ctx.cancel).toHaveBeenCalledWith('s1')
    wrapper.unmount()
  })

  it('이미 연결된 상대는 채워진 "1:1 중"이고 누르면 그 방으로 이동', async () => {
    const { wrapper, ctx } = build({ p1: { state: 'paired', roomId: 'prv-abc' } })
    const btn = wrapper.find('[data-testid="pair-open-button"]')
    expect(btn.text()).toBe('1:1 중')
    expect(btn.classes()).toContain('bg-scope-private')
    await btn.trigger('click')
    expect(ctx.open).toHaveBeenCalledWith('prv-abc')
  })

  it('전체 공유 목록에서도 동일하게 동작한다', () => {
    const { wrapper } = build({}, { scope: 'global' })
    expect(wrapper.findAll('[data-testid="pair-invite-button"]')).toHaveLength(1)
  })

  describe('제자리 그림 확인 (보낸 쪽)', () => {
    const pending = (extra = {}) => ({ p1: { state: 'pending', sessionId: 's1', expiresAt: Date.now() + 30000, sas: [3, 9, 20, 41], confirmed: false, ...extra } })

    it('그림이 준비되기 전에는 같은 크기의 빈 타일 4개와 비활성 "같아요"', () => {
      const { wrapper } = build(pending({ sas: null }))
      expect(wrapper.find('[data-testid="pair-invite-button"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="pair-pending-panel"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-testid="pair-sas-skeleton-tile"]')).toHaveLength(4)
      expect(wrapper.find('[data-testid="pair-sas-image"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="pair-same-inline"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="pair-cancel-button"]').exists()).toBe(true)
    })

    it('헤더 아래 전체 너비 패널에 질문, 그림 4장, 전체 너비 "같아요"가 나오고 칩은 "확인 중 · n초"', async () => {
      const { wrapper, ctx } = build(pending(), { wide: true })
      const row = wrapper.findAll('[data-testid="device-row"]')[1]
      const header = row.find('[data-testid="device-row-header"]')
      const panel = row.find('[data-testid="pair-pending-panel"]')
      expect(row.element.lastElementChild).toBe(panel.element) // 헤더 아래 패널
      expect(header.element.contains(panel.element)).toBe(false)
      expect(header.find('[data-testid="pair-pending-text"]').text()).toMatch(/^확인 중 · \d+초$/)
      expect(header.find('[data-testid="pair-pending-text"]').classes()).toContain('whitespace-nowrap')
      expect(panel.text()).toContain('상대 화면의 그림과 같나요?')
      expect(panel.text()).toContain('상대가 수락하면 연결돼요')
      const imgs = panel.findAll('[data-testid="pair-sas-image"]')
      expect(imgs).toHaveLength(4)
      for (const img of imgs) expect(img.attributes('alt').length).toBeGreaterThan(0)
      const same = panel.find('[data-testid="pair-same-inline"]')
      expect(same.text()).toBe('같아요')
      expect(same.classes()).toContain('w-full')
      await same.trigger('click')
      expect(ctx.confirm).toHaveBeenCalledWith('s1')
    })

    it('좁은 화면은 [취소][같아요] 두 칸 버튼', async () => {
      const { wrapper, ctx } = build(pending())
      const panel = wrapper.find('[data-testid="pair-pending-panel"]')
      expect(panel.text()).not.toContain('상대가 수락하면 연결돼요')
      await panel.find('[data-testid="pair-cancel-button"]').trigger('click')
      expect(ctx.cancel).toHaveBeenCalledWith('s1')
      await panel.find('[data-testid="pair-same-inline"]').trigger('click')
      expect(ctx.confirm).toHaveBeenCalledWith('s1')
    })

    it('"같아요"를 누른 뒤에도 그림은 남고 상태 문구와 "상대 확인 중" 칩, 취소가 있다', async () => {
      const { wrapper, ctx } = build(pending({ confirmed: true }))
      expect(wrapper.find('[data-testid="pair-same-inline"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="pair-sas-image"]')).toHaveLength(4)
      expect(wrapper.find('[data-testid="pair-confirmed-text"]').text()).toBe('확인했어요 · 상대 수락 기다리는 중')
      expect(wrapper.find('[data-testid="pair-pending-text"]').text()).toMatch(/^상대 확인 중 · \d+초$/)
      await wrapper.find('[data-testid="pair-cancel-button"]').trigger('click')
      expect(ctx.cancel).toHaveBeenCalledWith('s1')
    })
  })

  describe('다른 네트워크 기기 묶음', () => {
    const far1 = { socketId: 'f1', identity: { adj: 2, animal: 2 }, deviceType: 'desktop', browser: 'Firefox', os: 'win', joinedAt: 3 }
    const far2 = { socketId: 'f2', identity: { adj: 3, animal: 3 }, deviceType: 'mobile', browser: 'Chrome', os: 'android', joinedAt: 4 }

    it('접힌 상태로 "n대"만 보이고 펼치면 각 행에 1:1 버튼이 있어 누르면 invite', async () => {
      const { wrapper, ctx } = build({}, { otherNetworkDevices: [far1, far2] })
      const toggle = wrapper.find('[data-testid="other-network-toggle"]')
      expect(toggle.text()).toContain('다른 네트워크 기기 2대')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[data-testid="other-network-list"]').exists()).toBe(false)
      await toggle.trigger('click')
      const list = wrapper.find('[data-testid="other-network-list"]')
      const buttons = list.findAll('[data-testid="pair-invite-button"]')
      expect(buttons).toHaveLength(2)
      await buttons[0].trigger('click')
      expect(ctx.invite).toHaveBeenCalledWith(far1)
    })

    it('0대이거나 전체 공유 목록이거나 1:1 컨텍스트가 없으면 숨긴다', () => {
      expect(build({}, { otherNetworkDevices: [] }).wrapper.find('[data-testid="other-network-group"]').exists()).toBe(false)
      expect(build({}, { otherNetworkDevices: [far1], scope: 'global' }).wrapper.find('[data-testid="other-network-group"]').exists()).toBe(false)
      const noCtx = mount(DeviceList, { props: { devices: [me, peer], mySocketId: 'me', myIdentity: me.identity, otherNetworkDevices: [far1] }, global: { plugins: [i18n] } })
      expect(noCtx.find('[data-testid="other-network-group"]').exists()).toBe(false)
    })
  })
})
