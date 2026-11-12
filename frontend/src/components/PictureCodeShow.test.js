import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PictureCodeShow from './PictureCodeShow.vue'
import i18n from '../i18n/index.js'

let wrapper
const mountShow = (props = {}) => {
  wrapper = mount(PictureCodeShow, { props: { code: [0, 2, 3, 4], expiresAt: Date.now() + 125_000, ...props }, global: { plugins: [i18n] } })
  return wrapper
}
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })

describe('PictureCodeShow', () => {
  it('그림 4개 타일(aria-label=이름)과 이름 줄을 보여 준다', () => {
    mountShow()
    const tiles = wrapper.findAll('[data-testid="picture-code-tile"]')
    expect(tiles).toHaveLength(4)
    expect(tiles.map((t) => t.attributes('aria-label'))).toEqual(['바나나', '로켓', '우산', '열쇠'])
    expect(wrapper.get('[data-testid="picture-code-names"]').text()).toBe('바나나 · 로켓 · 우산 · 열쇠')
    expect(wrapper.get('[data-testid="picture-code-tile"] img').attributes('src')).toBeTruthy()
    expect(wrapper.get('[data-testid="picture-code-title"]').text()).toContain('순서대로')
  })

  it('남은 시간을 분·초로 보여 주고 1초마다 줄어든다', async () => {
    vi.useFakeTimers()
    mountShow({ expiresAt: Date.now() + 125_000 })
    expect(wrapper.get('[data-testid="picture-code-left"]').text()).toBe('2분 5초 남음')
    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="picture-code-left"]').text()).toBe('2분 0초 남음')
  })

  it('코드가 아직 없으면 빈 타일(스켈레톤)을 보여 준다', () => {
    mountShow({ code: null })
    expect(wrapper.find('[data-testid="picture-code-skeleton"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="picture-code-tile"]')).toHaveLength(0)
  })

  it('새 코드 버튼이 renew를 낸다', async () => {
    mountShow()
    await wrapper.get('[data-testid="picture-code-renew"]').trigger('click')
    expect(wrapper.emitted('renew')).toHaveLength(1)
  })

  it('승인 요청이 없으면 카드를 그리지 않고, 있으면 기기 이름·종류와 들이기/거절을 보여 준다', async () => {
    mountShow()
    expect(wrapper.find('[data-testid="picture-code-request"]').exists()).toBe(false)
    await wrapper.setProps({
      request: { sessionId: 's1', from: { deviceType: 'mobile', deviceLabel: 'iphone', browser: 'Safari', os: 'iOS', identity: { adj: 1, animal: 1 } } }
    })
    expect(wrapper.get('[data-testid="picture-code-request-title"]').text()).toMatch(/들어오려고 해요/)
    expect(wrapper.get('[data-testid="picture-code-request-device"]').text().length).toBeGreaterThan(0)
    await wrapper.get('[data-testid="picture-code-approve"]').trigger('click')
    await wrapper.get('[data-testid="picture-code-reject"]').trigger('click')
    expect(wrapper.emitted('decide')).toEqual([[true], [false]])
  })

  it('이름표가 없는 기기도 요청 카드가 깨지지 않는다', () => {
    mountShow({ request: { sessionId: 's1', from: { deviceType: 'desktop', deviceLabel: 'windows_pc', browser: 'Chrome' } } })
    expect(wrapper.get('[data-testid="picture-code-request-title"]').text()).toContain('알 수 없는 기기')
  })
})
