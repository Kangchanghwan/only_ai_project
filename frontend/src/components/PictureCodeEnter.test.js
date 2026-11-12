import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PictureCodeEnter from './PictureCodeEnter.vue'
import i18n from '../i18n/index.js'
import { PICTURE_IDS } from '../utils/pictureCode.js'

let wrapper
const mountEnter = (props = {}) => {
  wrapper = mount(PictureCodeEnter, { props, global: { plugins: [i18n] } })
  return wrapper
}
const tile = (i) => wrapper.get(`[data-testid="picture-tile-${i}"]`)
const slots = () => wrapper.findAll('[data-testid="picture-enter-slot"]')
const filled = () => slots().filter((s) => s.find('img').exists()).length
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })

describe('PictureCodeEnter', () => {
  it('그림판 24개 타일이 있고 각각 aria-label이 그림 이름이다', () => {
    mountEnter()
    const tiles = wrapper.findAll('[data-testid^="picture-tile-"]')
    expect(tiles).toHaveLength(24)
    expect(PICTURE_IDS).toHaveLength(24)
    expect(tile(0).attributes('aria-label')).toBe('바나나')
    expect(tile(23).attributes('aria-label')).toBe('당근')
    for (const t of tiles) expect(t.attributes('aria-label').length).toBeGreaterThan(0)
  })

  it('폰은 6열, PC는 8열 그리드이고 타일은 최소 44px', () => {
    mountEnter()
    const grid = wrapper.get('[data-testid="picture-enter-palette"]')
    expect(grid.classes()).toContain('grid-cols-6')
    expect(grid.classes()).toContain('sm:grid-cols-8')
    expect(tile(0).classes()).toContain('min-w-[44px]')
    expect(tile(0).classes()).toContain('min-h-[44px]')
  })

  it('칸은 4개, 그림을 누르면 순서대로 채워지고 4개가 차면 더 안 들어간다', async () => {
    mountEnter()
    expect(slots()).toHaveLength(4)
    for (const i of [3, 3, 7, 1]) await tile(i).trigger('click')
    expect(filled()).toBe(4)
    expect(slots().map((s) => s.attributes('aria-label'))[0]).toContain('우산')
    expect(tile(5).attributes('disabled')).toBeDefined()
  })

  it('확인은 4개가 찼을 때만 켜지고, 누르면 그림 인덱스 4개를 낸다', async () => {
    mountEnter()
    const confirm = () => wrapper.get('[data-testid="picture-enter-confirm"]')
    expect(confirm().attributes('disabled')).toBeDefined()
    for (const i of [3, 3, 7]) await tile(i).trigger('click')
    expect(confirm().attributes('disabled')).toBeDefined()
    await tile(1).trigger('click')
    expect(confirm().attributes('disabled')).toBeUndefined()
    await confirm().trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[[3, 3, 7, 1]]])
  })

  it('지우기는 마지막 하나를 지우고, 칸을 누르면 그 칸부터 다시 고른다', async () => {
    mountEnter()
    for (const i of [1, 2, 3, 4]) await tile(i).trigger('click')
    await wrapper.get('[data-testid="picture-enter-clear"]').trigger('click')
    expect(filled()).toBe(3)
    await slots()[1].trigger('click')
    expect(filled()).toBe(1)
    await tile(9).trigger('click')
    expect(filled()).toBe(2)
  })

  it('틀린 뒤에는 칸을 비우고 문구를 보여 주며, 경고 플래그가 있으면 경고 줄도 보인다', async () => {
    mountEnter()
    for (const i of [1, 2, 3, 4]) await tile(i).trigger('click')
    await wrapper.setProps({ status: 'wrong', warn: true })
    expect(filled()).toBe(0)
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toBe('그림이 맞지 않아요. 다시 눌러 주세요')
    expect(wrapper.get('[data-testid="picture-enter-warn"]').text()).toContain('여러 번 틀렸어요')
  })

  it('notFound도 틀린 것과 같은 문구라 코드 존재 여부가 드러나지 않는다', async () => {
    mountEnter({ status: 'notFound' })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toBe('그림이 맞지 않아요. 다시 눌러 주세요')
  })

  it('기다리는 중에는 그림판이 잠기고 취소 버튼이 나온다', async () => {
    mountEnter({ status: 'waiting' })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toContain('기다리고 있어요')
    expect(tile(0).attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="picture-enter-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.find('[data-testid="picture-enter-confirm"]').exists()).toBe(false)
  })

  it('거절·응답 없음·잠시 뒤에 문구', async () => {
    mountEnter({ status: 'declined' })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toBe('방에서 거절했어요')
    await wrapper.setProps({ status: 'timeout' })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toBe('방에서 응답이 없어요')
    await wrapper.setProps({ status: 'busy' })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toBe('잠시 뒤에 다시 해 주세요')
  })

  it('잠시 기다리라는 응답이면 남은 초를 세고, 그동안 확인이 잠긴다', async () => {
    vi.useFakeTimers()
    mountEnter()
    for (const i of [1, 2, 3, 4]) await tile(i).trigger('click')
    await wrapper.setProps({ status: 'wait', retryAfterSec: 3 })
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toContain('3초')
    expect(wrapper.get('[data-testid="picture-enter-confirm"]').attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(3000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="picture-enter-message"]').text()).toContain('0초')
    expect(wrapper.get('[data-testid="picture-enter-confirm"]').attributes('disabled')).toBeUndefined()
  })
})
