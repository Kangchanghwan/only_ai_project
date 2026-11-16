import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] }, attachTo: document.body }

describe('ShareScopeTabs (범위 드롭다운)', () => {
  it('닫혀 있을 때는 현재 범위 이름만 보이고 메뉴는 없다', () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'ip' } })
    expect(wrapper.find('[data-testid="scope-current"]').text()).toBe('같은 네트워크')
    expect(wrapper.find('[data-testid="scope-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="scope-trigger"]').attributes('aria-expanded')).toBe('false')
  })

  it('열면 role=listbox에 같은 네트워크/전체 공유 option 2개', async () => {
    const wrapper = mount(ShareScopeTabs, mountOptions)
    await wrapper.find('[data-testid="scope-trigger"]').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2)
  })

  it('scope가 ip/global이면 해당 option이 aria-selected + ink 채움', async () => {
    for (const [scope, idx] of [['ip', 0], ['global', 1]]) {
      const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope } })
      await wrapper.find('[data-testid="scope-trigger"]').trigger('click')
      const opts = wrapper.findAll('[role="option"]')
      expect(opts[idx].attributes('aria-selected')).toBe('true')
      expect(opts[idx].classes()).toContain('bg-ink')
      expect(opts[1 - idx].attributes('aria-selected')).toBe('false')
    }
  })

  it('전체 공유 option 클릭 시 select(global)을 올리고 메뉴가 닫힌다', async () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'ip' } })
    await wrapper.find('[data-testid="scope-trigger"]').trigger('click')
    await wrapper.find('[data-testid="scope-option-global"]').trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual(['global'])
    expect(wrapper.find('[data-testid="scope-menu"]').exists()).toBe(false)
  })

  it('scope가 global이면 트리거에 "전체 공유"가 보인다', () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'global' } })
    expect(wrapper.find('[data-testid="scope-current"]').text()).toBe('전체 공유')
  })

  it('Esc와 바깥 클릭으로 닫힌다', async () => {
    const wrapper = mount(ShareScopeTabs, mountOptions)
    await wrapper.find('[data-testid="scope-trigger"]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="scope-menu"]').exists()).toBe(false)
    await wrapper.find('[data-testid="scope-trigger"]').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="scope-menu"]').exists()).toBe(false)
  })

  it('ConnectedDevices는 렌더링하지 않는다', () => {
    const wrapper = mount(ShareScopeTabs, mountOptions)
    expect(wrapper.findAllComponents({ name: 'ConnectedDevices' })).toHaveLength(0)
  })
})
