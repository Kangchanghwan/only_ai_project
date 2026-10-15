import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PairRequestSheet from './PairRequestSheet.vue'
import i18n from '../i18n/index.js'

const session = {
  sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: true,
  peer: { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
}
let wrapper
const mountSheet = (props = { session }) => {
  wrapper = mount(PairRequestSheet, { props, global: { plugins: [i18n] }, attachTo: document.body })
  return wrapper
}
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

afterEach(() => wrapper?.unmount())

describe('PairRequestSheet', () => {
  it('세션이 없으면 시트를 그리지 않는다', () => {
    mountSheet({ session: null })
    expect(q('pair-request-sheet')).toBeNull()
  })

  it('이름·같은 네트워크 배지를 보여 주고 첫 포커스는 거절 버튼이다', async () => {
    mountSheet()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(q('pair-request-name').textContent.length).toBeGreaterThan(0)
    expect(q('pair-network-badge').textContent).toContain('같은 네트워크')
    expect(document.activeElement).toBe(q('pair-decline'))
  })

  it('다른 네트워크 배지', () => {
    mountSheet({ session: { ...session, sameNetwork: false } })
    expect(q('pair-network-badge').textContent).toContain('다른 네트워크')
  })

  it('수락/거절/요청 받지 않기가 respond를 올린다', async () => {
    mountSheet()
    q('pair-accept').click()
    q('pair-decline').click()
    q('pair-block').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('respond')).toEqual([
      [{ accept: true }],
      [{ accept: false }],
      [{ accept: false, block: true }]
    ])
  })

  it('Esc는 거절이다', async () => {
    mountSheet()
    q('pair-decline').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('respond')[0]).toEqual([{ accept: false }])
  })

  it('Tab이 시트 밖으로 나가지 않는다 (마지막 → 처음)', async () => {
    mountSheet()
    q('pair-block').focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    q('pair-block').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(q('pair-decline'))
  })

  it('요청 도착 안내를 aria-live 영역에 낸다', () => {
    mountSheet({ session, announcement: '누가 요청했어요' })
    const live = q('pair-announce')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('누가 요청했어요')
  })
})
