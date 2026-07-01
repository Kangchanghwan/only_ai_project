import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

describe('ShareScopeTabs', () => {
  it('role=tablist 컨테이너와 role=tab 버튼 2개를 렌더링한다', () => {
    const wrapper = mount(ShareScopeTabs, mountOptions)

    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
  })

  it('scope가 ip이면 첫 번째 탭이 활성(aria-selected=true, coral 배경)이다', () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'ip' } })
    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[0].classes()).toContain('bg-primary')
    expect(tabs[1].attributes('aria-selected')).toBe('false')
  })

  it('scope가 global이면 두 번째 탭이 활성(aria-selected=true, sage 배경)이다', () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'global' } })
    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[1].classes()).toContain('bg-scope-global')
    expect(tabs[0].attributes('aria-selected')).toBe('false')
  })

  it('두 번째 탭 클릭 시 select 이벤트가 global과 함께 발생한다', async () => {
    const wrapper = mount(ShareScopeTabs, { ...mountOptions, props: { scope: 'ip' } })
    const tabs = wrapper.findAll('[role="tab"]')

    await tabs[1].trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0]).toEqual(['global'])
  })

  it('ipDevices/globalDevices가 각 탭의 ConnectedDevices에 전달된다', () => {
    const ipDevices = [{ socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }]
    const globalDevices = [{ socketId: 'b', deviceType: 'mobile', browser: 'Safari', os: 'iOS' }]
    const wrapper = mount(ShareScopeTabs, {
      ...mountOptions,
      props: { scope: 'ip', ipDevices, globalDevices }
    })

    const connectedDevicesList = wrapper.findAllComponents({ name: 'ConnectedDevices' })
    expect(connectedDevicesList).toHaveLength(2)
    expect(connectedDevicesList[0].props('devices')).toEqual(ipDevices)
    expect(connectedDevicesList[1].props('devices')).toEqual(globalDevices)
  })
})
