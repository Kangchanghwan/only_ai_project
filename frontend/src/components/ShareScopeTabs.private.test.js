import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const room = (id, animal = 1) => ({ roomId: id, status: 'online', peer: { socketId: id, identity: { adj: 1, animal } } })

describe('ShareScopeTabs 1:1 방 항목', () => {
  it('연결이 없으면 기본 option 2개뿐', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } })
    await w.find('[data-testid="scope-trigger"]').trigger('click')
    expect(w.findAll('[role="option"]')).toHaveLength(2)
    expect(w.find('[data-testid="private-tab-option"]').exists()).toBe(false)
  })

  it('1개면 아바타 + 방 option이 추가되고, 선택 시 prv: 스코프를 올린다', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [room('prv-a')] } })
    await w.find('[data-testid="scope-trigger"]').trigger('click')
    const opt = w.find('[data-testid="private-tab-option"]')
    expect(w.findAll('[role="option"]')).toHaveLength(3)
    expect(opt.find('[data-testid="animal-avatar"]').exists()).toBe(true)
    await opt.trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:prv-a'])
  })

  it('활성 방이면 트리거에 방 이름·아바타가 보이고 option이 선택 표시', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'prv:prv-a', privateRooms: [room('prv-a')] } })
    const trig = w.find('[data-testid="scope-trigger"]')
    expect(trig.find('[data-testid="animal-avatar"]').exists()).toBe(true)
    await trig.trigger('click')
    const opt = w.find('[data-testid="private-tab-option"]')
    expect(opt.attributes('aria-selected')).toBe('true')
    expect(opt.classes()).toContain('bg-ink')
  })

  it('방이 여러 개여도 같은 목록에서 상대를 고른다', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [room('prv-a', 1), room('prv-b', 2)] } })
    await w.find('[data-testid="scope-trigger"]').trigger('click')
    const options = w.findAll('[data-testid="private-tab-option"]')
    expect(options).toHaveLength(2)
    await options[1].trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:prv-b'])
    expect(w.find('[data-testid="scope-menu"]').exists()).toBe(false)
  })

  it('highlightRoomId가 있으면 트리거가 한 번 강조된다', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [room('prv-a')], highlightRoomId: 'prv-a' } })
    expect(w.find('[data-testid="scope-trigger"]').classes()).toContain('pair-tab-pulse')
  })
})

describe('PrivateRoomStrip 상태', () => {
  it('online/offline/connecting/left를 각각 글자와 data-status로 표시한다', () => {
    const expected = { online: '접속 중', offline: '오프라인', connecting: '연결 중…', left: '나갔어요' }
    for (const [status, text] of Object.entries(expected)) {
      const w = mount(PrivateRoomStrip, { ...opts, props: { room: { ...room('prv-a'), status } } })
      const el = w.find('[data-testid="private-status"]')
      expect(el.text()).toBe(text)
      expect(el.attributes('data-status')).toBe(status)
    }
  })
})

describe('PrivateRoomStrip', () => {
  it('상대 이름/상태/암호화 안내를 보여 주고 상태는 글자로도 표시', () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: room('prv-a') } })
    expect(w.find('[data-testid="private-strip-title"]').text()).toContain('쓰는 방')
    expect(w.find('[data-testid="private-status"]').text()).toBe('접속 중')
    expect(w.text()).toContain('자동으로 암호화돼요')
    const left = mount(PrivateRoomStrip, { ...opts, props: { room: { ...room('prv-a'), status: 'left' } } })
    expect(left.find('[data-testid="private-status"]').text()).toBe('나갔어요')
  })

  it('연결 끊기는 메뉴 → 확인을 거쳐야 leave를 올린다', async () => {
    const w = mount(PrivateRoomStrip, { ...opts, props: { room: room('prv-a') } })
    await w.find('[data-testid="private-menu"]').trigger('click')
    await w.find('[data-testid="private-leave"]').trigger('click')
    expect(w.emitted('leave')).toBeUndefined()
    await w.find('[data-testid="private-leave-ok"]').trigger('click')
    expect(w.emitted('leave')[0]).toEqual(['prv-a'])
  })
})
