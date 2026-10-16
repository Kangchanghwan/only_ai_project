import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShareScopeTabs from './ShareScopeTabs.vue'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const room = (id, animal = 1) => ({ roomId: id, status: 'online', peer: { socketId: id, identity: { adj: 1, animal } } })

describe('ShareScopeTabs 1:1 탭', () => {
  it('연결이 없으면 기존 2탭 그대로', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip' } })
    expect(w.findAll('[role="tab"]')).toHaveLength(2)
    expect(w.find('[data-testid="private-tab"]').exists()).toBe(false)
  })

  it('1개면 아바타 + "1:1" 세 번째 탭, 선택 시 prv: 스코프를 올린다', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [room('prv-a')] } })
    const tab = w.find('[data-testid="private-tab"]')
    expect(w.findAll('[role="tab"]')).toHaveLength(3)
    expect(tab.text()).toBe('1:1')
    expect(tab.find('[data-testid="animal-avatar"]').exists()).toBe(true)
    await tab.trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:prv-a'])
  })

  it('활성일 때 전용 파랑 배경', () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'prv:prv-a', privateRooms: [room('prv-a')] } })
    const tab = w.find('[data-testid="private-tab"]')
    expect(tab.classes()).toContain('bg-scope-private')
    expect(tab.attributes('aria-selected')).toBe('true')
  })

  it('2개 이상이면 "1:1 (n)" 후 팝오버에서 상대를 고른다', async () => {
    const w = mount(ShareScopeTabs, { ...opts, props: { scope: 'ip', privateRooms: [room('prv-a', 1), room('prv-b', 2)] } })
    const tab = w.find('[data-testid="private-tab"]')
    expect(tab.text()).toBe('1:1 (2)')
    expect(w.find('[data-testid="private-tab-popover"]').exists()).toBe(false)
    await tab.trigger('click')
    const options = w.findAll('[data-testid="private-tab-option"]')
    expect(options).toHaveLength(2)
    await options[1].trigger('click')
    expect(w.emitted('select')[0]).toEqual(['prv:prv-b'])
    expect(w.find('[data-testid="private-tab-popover"]').exists()).toBe(false)
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
    expect(w.find('[data-testid="private-strip-title"]').text()).toContain('1:1')
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
