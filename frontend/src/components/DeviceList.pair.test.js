import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DeviceList from './DeviceList.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext.js'

const me = { socketId: 'me', identity: { adj: 0, animal: 0 }, deviceType: 'desktop', browser: 'Chrome', os: 'mac', joinedAt: 1 }
const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'ios', joinedAt: 2 }

function build(states = {}, props = {}) {
  const ctx = { states: ref(states), invite: vi.fn(), cancel: vi.fn(), open: vi.fn() }
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
    expect(wrapper.find('[data-testid="pair-pending-text"]').text()).toContain('수락 기다리는 중')
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
})
