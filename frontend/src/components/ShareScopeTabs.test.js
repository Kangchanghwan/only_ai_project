import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const G = 'prv-g-' + 'ab12'.repeat(6)
const grp = (id = G, name = '우리 방') => ({ roomId: id, name, status: 'online', peer: null })
const one = (id = 'prv-a', animal = 1) => ({ roomId: id, status: 'online', peer: { socketId: id, identity: { adj: 1, animal } } })
const tabs = (w) => w.findAll('[role="tab"]')

describe('ShareScopeTabs (늘 보이는 방 탭 바)', () => {
  it('클릭 없이 tablist에 같은 네트워크/전체 공유 탭이 바로 보인다', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } })
    expect(w.find('[role="tablist"]').exists()).toBe(true)
    expect(tabs(w).map((x) => x.text())).toEqual(['같은 네트워크', '전체 공유'])
    expect(w.find('[data-testid="scope-trigger"]').exists()).toBe(false)
  })

  it('모든 1:1·그룹 방이 클릭 없이 각각 탭으로 보인다 (순서: ip, global, 방들)', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one(), grp()] } })
    const t = tabs(w)
    expect(t).toHaveLength(4)
    expect(t[2].find('[data-testid="animal-avatar"]').exists()).toBe(true)
    expect(t[3].text()).toBe('우리 방')
    expect(t[3].find('[data-testid="group-tab-icon"]').exists()).toBe(true)
  })

  it('활성 탭만 aria-selected + 굵은 ink 글씨와 ink 밑줄', () => {
    for (const [scope, idx] of [['ip', 0], ['global', 1], ['prv:prv-a', 2]]) {
      const w = mount(ShareScopeTabs, { ...opts, props: { scope, privateRooms: [one()] } })
      tabs(w).forEach((tab, i) => {
        expect(tab.attributes('aria-selected')).toBe(String(i === idx))
        expect(tab.classes().includes('border-ink')).toBe(i === idx)
        expect(tab.classes().includes('font-extrabold')).toBe(i === idx)
      })
    }
  })

  it('탭을 누르면 select를 올린다 (ip/global/prv:)', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one('prv-b', 2), grp()] } })
    await tabs(w)[1].trigger('click')
    await tabs(w)[2].trigger('click')
    await tabs(w)[3].trigger('click')
    await tabs(w)[0].trigger('click')
    expect(w.emitted('select')).toEqual([['global'], ['prv:prv-b'], ['prv:' + G], ['ip']])
  })

  it('"＋ 방"은 groupCreate일 때만, 탭이 아닌 버튼이고 누르면 group-create', async () => {
    expect(mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } }).find('[data-testid="group-create"]').exists()).toBe(false)
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', groupCreate: true } })
    const btn = w.find('[data-testid="group-create"]')
    expect(btn.attributes('aria-label')).toBe('그룹 방 만들기')
    expect(btn.attributes('role')).toBeUndefined()
    expect(tabs(w)).toHaveLength(2)
    await btn.trigger('click')
    expect(w.emitted('group-create')).toHaveLength(1)
  })

  it('범위 색 표시: 전체 공유·방 탭에만 8px 네모, 같은 네트워크에는 없다', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one()] } })
    const t = tabs(w)
    expect(t[0].find('span.w-2.h-2').exists()).toBe(false)
    expect(t[1].find('[data-testid="scope-mark-global"]').classes()).toContain('bg-scope-global')
    expect(t[2].find('[data-testid="scope-mark-private"]').classes()).toContain('bg-scope-private')
  })

  it('highlightRoomId인 방 탭에만 활동 점이 붙는다', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one('prv-a'), one('prv-b', 2)], highlightRoomId: 'prv-b' } })
    const t = tabs(w)
    expect(t[2].find('[data-testid="tab-highlight"]').exists()).toBe(false)
    expect(t[3].find('[data-testid="tab-highlight"]').exists()).toBe(true)
  })

  it('이름 없는 그룹 방은 "이름 없는 방", 긴 이름은 truncate + 최대 폭 제한', () => {
    const LONG = '수줍은 부엉이의 아주아주 긴 방 이름입니다'
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [grp(G, ''), grp('prv-g-' + 'cd34'.repeat(6), LONG)] } })
    const names = w.findAll('[data-testid="group-tab-name"]')
    expect(names[0].text()).toBe('이름 없는 방')
    expect(names[1].classes()).toContain('truncate')
    expect(tabs(w)[3].classes()).toContain('max-w-[15rem]')
  })

  it('방이 많아도 모두 탭으로 그려지고 한 줄 가로 스크롤이다', () => {
    const rooms = Array.from({ length: 12 }, (_, i) => one('prv-' + i, (i % 5) + 1))
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: rooms, groupCreate: true } })
    expect(tabs(w)).toHaveLength(14)
    const list = w.find('[role="tablist"]')
    expect(list.classes()).toContain('overflow-x-auto')
    expect(list.classes()).toContain('flex-nowrap')
    expect(tabs(w)[0].classes()).toContain('whitespace-nowrap')
  })

  it('활성 탭을 보이는 자리로 스크롤한다', async () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [one()] } })
    await w.setProps({ scope: 'prv:prv-a' })
    await w.vm.$nextTick()
    expect(spy).toHaveBeenCalled()
    delete Element.prototype.scrollIntoView
  })
})

describe('PrivateRoomStrip', () => {
  it('상태를 글자와 data-status로 표시한다', () => {
    const expected = { online: '접속 중', offline: '오프라인', connecting: '연결 중…', left: '나갔어요' }
    for (const [status, text] of Object.entries(expected)) {
      const w = mount(PrivateRoomStrip, { ...opts, props: { room: { ...one(), status } } })
      const el = w.find('[data-testid="private-status"]')
      expect(el.text()).toBe(text)
      expect(el.attributes('data-status')).toBe(status)
    }
  })

  it('상대 이름/상태/암호화 안내를 보여 준다', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: one() } })
    expect(w.find('[data-testid="private-strip-title"]').text()).toContain('쓰는 방')
    expect(w.text()).toContain('자동으로 암호화돼요')
  })

  it('연결 끊기는 메뉴 → 확인을 거쳐야 leave를 올린다', async () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: one() } })
    await w.find('[data-testid="private-menu"]').trigger('click')
    await w.find('[data-testid="private-leave"]').trigger('click')
    expect(w.emitted('leave')).toBeUndefined()
    await w.find('[data-testid="private-leave-ok"]').trigger('click')
    expect(w.emitted('leave')[0]).toEqual(['prv-a'])
  })
})

describe('ShareScopeTabs 넘침 표시', () => {
  const rooms = [one('prv-a', 1), one('prv-b', 2), grp()]
  function stub(w, { sw, cw, left = 0, rights }) {
    const bar = w.find('[data-testid="room-tablist"]').element
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, value: sw })
    Object.defineProperty(bar, 'clientWidth', { configurable: true, value: cw })
    bar.scrollLeft = left
    bar.getBoundingClientRect = () => ({ right: cw, left: 0 })
    w.findAll('[role="tab"]').forEach((t, i) => { t.element.getBoundingClientRect = () => ({ right: rights[i] }) })
    return bar
  }
  it('넘치면 +N 버튼과 오른쪽 페이드, 안 넘치면 없다', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: rooms, groupCreate: true } })
    expect(w.find('[data-testid="tabs-more-right"]').exists()).toBe(false)
    const bar = stub(w, { sw: 800, cw: 300, rights: [100, 200, 300, 400, 500] })
    bar.scrollIntoView = undefined
    await bar.dispatchEvent(new Event('scroll'))
    await w.vm.$nextTick()
    const btn = w.find('[data-testid="tabs-more-right"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('+2')
    expect(btn.attributes('aria-label')).toBe('방 2개 더 있어요')
    expect(w.find('[data-testid="tabs-fade-right"]').exists()).toBe(true)
    expect(w.find('[data-testid="tabs-fade-left"]').exists()).toBe(false)
    const spy = vi.fn()
    w.findAll('[role="tab"]')[3].element.scrollIntoView = spy
    await btn.trigger('click')
    expect(spy).toHaveBeenCalledWith({ inline: 'start', block: 'nearest', behavior: 'smooth' })
  })
  it('스크롤이 시작을 벗어나면 왼쪽 페이드', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: rooms } })
    const bar = stub(w, { sw: 800, cw: 300, left: 200, rights: [-100, 0, 100, 200, 300] })
    await bar.dispatchEvent(new Event('scroll'))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="tabs-fade-left"]').exists()).toBe(true)
  })

  describe('키보드 (WAI-ARIA 탭)', () => {
    const rooms = [one()]
    const key = async (w, i, k) => { await tabs(w)[i].trigger('keydown', { key: k }) }
    it('선택된 탭만 tabindex 0, 나머지는 -1', () => {
      const w = mountControls('global')
      expect(tabs(w).map((x) => x.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
    })
    it('→ 키로 다음 탭 선택 emit', async () => {
      const w = mountControls('ip')
      await key(w, 0, 'ArrowRight')
      expect(w.emitted('select')[0]).toEqual(['global'])
    })
    it('끝에서 → 는 처음으로, 처음에서 ← 는 끝으로 순환', async () => {
      const w = mountControls('prv:prv-a')
      await key(w, 2, 'ArrowRight')
      expect(w.emitted('select')[0]).toEqual(['ip'])
      await key(w, 0, 'ArrowLeft')
      expect(w.emitted('select')[1]).toEqual(['prv:prv-a'])
    })
    it('Home/End는 처음/마지막 탭', async () => {
      const w = mountControls('global')
      await key(w, 1, 'End')
      expect(w.emitted('select')[0]).toEqual(['prv:prv-a'])
      await key(w, 1, 'Home')
      expect(w.emitted('select')[1]).toEqual(['ip'])
    })
    function mountControls(scope) { return mount(ShareScopeTabs, { ...opts, props: { scope, privateRooms: rooms } }) }
  })
})
