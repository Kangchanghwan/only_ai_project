import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import ConnectedDevices from './ConnectedDevices.vue'

function makeDevice(socketId, overrides = {}) {
  return {
    socketId,
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'Windows',
    ...overrides
  }
}

describe('ConnectedDevices.vue', () => {
  it('devices가 비어있으면 아무것도 렌더링하지 않는다', () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [] } })
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
  })

  it('devices가 5개 이하이면 모두 아바타로 렌더링하고 오버플로우 배지는 없다', () => {
    const devices = [makeDevice('a'), makeDevice('b'), makeDevice('c')]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const avatars = wrapper.findAll('[title]')
    expect(avatars).toHaveLength(3)
    expect(wrapper.text()).not.toContain('+')
  })

  it('두 번째 아바타부터 겹침을 위한 음수 마진 클래스를 가진다', () => {
    const devices = [makeDevice('a'), makeDevice('b')]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const avatars = wrapper.findAll('[title]')
    expect(avatars[0].classes()).not.toContain('-ml-2')
    expect(avatars[1].classes()).toContain('-ml-2')
  })

  it('devices가 5개를 초과하면 4개만 아바타로 표시하고 나머지는 +N 배지로 요약한다', () => {
    const devices = [
      makeDevice('a'), makeDevice('b'), makeDevice('c'),
      makeDevice('d'), makeDevice('e'), makeDevice('f'), makeDevice('g')
    ]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    // 4개 아바타 + 1개 오버플로우 배지 = title 속성을 가진 요소 5개
    const avatars = wrapper.findAll('[title]')
    expect(avatars).toHaveLength(5)
    expect(wrapper.text()).toContain('+3')
  })

  it('오버플로우 배지의 title은 초과된 기기들의 라벨을 포함한다', () => {
    const devices = [
      makeDevice('a'), makeDevice('b'), makeDevice('c'), makeDevice('d'),
      makeDevice('e', { browser: 'Safari', os: 'iOS' })
    ]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const badge = wrapper.findAll('[title]').at(-1)
    expect(badge.attributes('title')).toBe('Safari · iOS')
  })

  it('기기 타입에 맞는 아이콘을 렌더링한다', () => {
    const devices = [makeDevice('a', { deviceType: 'mobile' })]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    expect(wrapper.text()).toContain('📱')
  })

  it('아바타의 aria-label은 title과 동일하다 (터치/스크린리더 접근성)', () => {
    const devices = [makeDevice('a', { browser: 'Firefox', os: 'macOS' })]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const avatar = wrapper.find('[title]')
    expect(avatar.attributes('aria-label')).toBe(avatar.attributes('title'))
  })

  it('오버플로우 배지의 aria-label은 title과 동일하다 (터치/스크린리더 접근성)', () => {
    const devices = [
      makeDevice('a'), makeDevice('b'), makeDevice('c'), makeDevice('d'),
      makeDevice('e', { browser: 'Safari', os: 'iOS' })
    ]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const badge = wrapper.findAll('[title]').at(-1)
    expect(badge.attributes('aria-label')).toBe(badge.attributes('title'))
  })
})
