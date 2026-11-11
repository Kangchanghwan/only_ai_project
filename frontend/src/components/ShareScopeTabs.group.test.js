import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const G = 'prv-g-' + 'ab12'.repeat(6)
const G2 = 'prv-g-' + 'cd34'.repeat(6)
const grp = (id = G, name = '우리 방') => ({ roomId: id, name, status: 'online', peer: null })
const one = (id = 'prv-' + 'a'.repeat(24)) => ({ roomId: id, status: 'online', peer: { socketId: id, identity: { adj: 1, animal: 1 } } })

describe('ShareScopeTabs 그룹 방', () => {
  it('groupCreate가 꺼져 있으면 "＋ 방" 버튼이 없다 (기존 화면 그대로)', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } })
    expect(w.find('[data-testid="group-create"]').exists()).toBe(false)
  })

  it('탭 줄 끝에 "＋ 방" 버튼(aria-label 그룹 방 만들기)이 있고 누르면 group-create', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', groupCreate: true } })
    const btn = w.find('[data-testid="group-create"]')
    expect(btn.attributes('aria-label')).toBe('그룹 방 만들기')
    expect(btn.text()).toContain('＋')
    expect(w.findAll('[role="tab"]')).toHaveLength(2) // 버튼은 탭이 아니다
    expect(w.element.lastElementChild).toBe(btn.element)
    await btn.trigger('click')
    expect(w.emitted('group-create')).toHaveLength(1)
  })

  it('그룹 방 하나: 방 이름 + 여러 사람 아이콘, 선택하면 prv: 스코프', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp()] } })
    const tab = w.find('[data-testid="private-tab"]')
    expect(w.find('[data-testid="group-tab-name"]').text()).toBe('우리 방')
    expect(tab.find('[data-testid="group-tab-icon"]').exists()).toBe(true)
    expect(tab.find('[data-testid="animal-avatar"]').exists()).toBe(false)
    expect(tab.attributes('aria-label')).toBe('우리 방')
    await tab.trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:' + G])
  })

  it('1:1 + 그룹이 섞이면 같은 목록: 1:1은 상대 이름·아바타, 그룹은 방 이름·아이콘', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one(), grp()] } })
    const tab = w.find('[data-testid="private-tab"]')
    expect(tab.text()).toBe('1:1 (2)')
    await tab.trigger('click')
    const options = w.findAll('[data-testid="private-tab-option"]')
    expect(options).toHaveLength(2)
    expect(options[0].find('[data-testid="animal-avatar"]').exists()).toBe(true)
    expect(options[0].find('[data-testid="group-tab-icon"]').exists()).toBe(false)
    expect(options[1].text()).toBe('우리 방')
    expect(options[1].find('[data-testid="group-tab-icon"]').exists()).toBe(true)
    await options[1].trigger('click')
    expect(w.emitted('select').at(-1)).toEqual(['prv:' + G])
  })

  it('그룹 방만 여러 개면 라벨은 "방 (n)"', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp(), grp(G2, '둘째')] } })
    expect(w.find('[data-testid="private-tab"]').text()).toBe('방 (2)')
  })

  it('이름이 없는 그룹 방은 "이름 없는 방"', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp(G, '')] } })
    expect(w.find('[data-testid="group-tab-name"]').text()).toBe('이름 없는 방')
  })
})
