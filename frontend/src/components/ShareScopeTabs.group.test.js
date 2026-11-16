import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const G = 'prv-g-' + 'ab12'.repeat(6)
const G2 = 'prv-g-' + 'cd34'.repeat(6)
const grp = (id = G, name = '우리 방') => ({ roomId: id, name, status: 'online', peer: null })
const one = (id = 'prv-' + 'a'.repeat(24)) => ({ roomId: id, status: 'online', peer: { socketId: id, identity: { adj: 1, animal: 1 } } })

const openMenu = (w) => w.find('[data-testid="scope-trigger"]').trigger('click')

describe('ShareScopeTabs 그룹 방', () => {
  it('groupCreate가 꺼져 있으면 "＋ 방" 항목이 없다 (기존 화면 그대로)', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } })
    await openMenu(w)
    expect(w.find('[data-testid="group-create"]').exists()).toBe(false)
  })

  it('메뉴 끝에 "＋ 방"(aria-label 그룹 방 만들기)이 있고 누르면 group-create', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', groupCreate: true } })
    await openMenu(w)
    const btn = w.find('[data-testid="group-create"]')
    expect(btn.attributes('aria-label')).toBe('그룹 방 만들기')
    expect(btn.text()).toContain('＋')
    expect(w.findAll('[role="option"]')).toHaveLength(2) // 만들기는 option이 아니다
    await btn.trigger('click')
    expect(w.emitted('group-create')).toHaveLength(1)
    expect(w.find('[data-testid="scope-menu"]').exists()).toBe(false)
  })

  it('그룹 방 하나: 방 이름 + 여러 사람 아이콘, 선택하면 prv: 스코프', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp()] } })
    await openMenu(w)
    const opt = w.find('[data-testid="private-tab-option"]')
    expect(w.find('[data-testid="group-tab-name"]').text()).toBe('우리 방')
    expect(opt.find('[data-testid="group-tab-icon"]').exists()).toBe(true)
    expect(opt.find('[data-testid="animal-avatar"]').exists()).toBe(false)
    await opt.trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:' + G])
  })

  it('예전 방 + 새 방이 섞이면 같은 목록: 1:1은 상대 아바타, 그룹은 방 이름·아이콘', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one(), grp()] } })
    await openMenu(w)
    const options = w.findAll('[data-testid="private-tab-option"]')
    expect(options).toHaveLength(2)
    expect(options[0].find('[data-testid="animal-avatar"]').exists()).toBe(true)
    expect(options[0].find('[data-testid="group-tab-icon"]').exists()).toBe(false)
    expect(options[1].text()).toBe('우리 방')
    expect(options[1].find('[data-testid="group-tab-icon"]').exists()).toBe(true)
    await options[1].trigger('click')
    expect(w.emitted('select').at(-1)).toEqual(['prv:' + G])
  })

  it('그룹 방을 고른 상태면 트리거에 방 이름이 보인다', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'prv:' + G, privateRooms: [grp(), grp(G2, '둘째')] } })
    expect(w.find('[data-testid="scope-current"]').text()).toBe('우리 방')
  })

  it('이름이 없는 그룹 방은 "이름 없는 방"', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp(G, '')] } })
    await openMenu(w)
    expect(w.find('[data-testid="group-tab-name"]').text()).toBe('이름 없는 방')
  })

  it('긴 방 이름: 트리거 이름은 말줄임(truncate, min-w-0)이고 option 이름도 truncate', async () => {
    const LONG = '수줍은 부엉이의 아주아주 긴 방 이름입니다'
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'prv:' + G, privateRooms: [grp(G, LONG)], groupCreate: true } })
    const cur = w.find('[data-testid="scope-current"]')
    expect(cur.text()).toBe(LONG)
    for (const c of ['min-w-0', 'truncate']) expect(cur.classes(), c).toContain(c)
    await openMenu(w)
    expect(w.find('[data-testid="group-tab-name"]').classes()).toContain('truncate')
  })
})
