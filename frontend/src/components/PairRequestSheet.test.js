import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PairRequestSheet from './PairRequestSheet.vue'
import i18n from '../i18n/index.js'

const session = {
  sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: true, legacy: false, sas: [1, 2, 3, 4],
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

  it('처음부터 그림 4장(alt=이모지)과 안내 문구를 보여 준다', () => {
    mountSheet()
    const imgs = [...document.body.querySelectorAll('[data-testid="pair-sas-image"]')]
    expect(imgs).toHaveLength(4)
    for (const img of imgs) expect(img.getAttribute('alt').length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('그림이 같으면 수락, 다르면 거절하세요')
  })

  it('그림이 준비되기 전엔 수락이 비활성(스피너)이고 눌러도 아무 일 없다', async () => {
    mountSheet({ session: { ...session, sas: null } })
    expect(q('pair-accept').disabled).toBe(true)
    expect(q('pair-accept-spinner')).not.toBeNull()
    expect(q('pair-sas')).toBeNull()
    expect(document.body.querySelectorAll('[data-testid="pair-sas-skeleton-tile"]')).toHaveLength(4)
    q('pair-accept').click()
    expect(wrapper.emitted('respond')).toBeUndefined()
    await wrapper.setProps({ session: { ...session } })
    expect(q('pair-accept').disabled).toBe(false)
    expect(q('pair-accept-spinner')).toBeNull()
  })

  it('수락은 same:true 한 번, 거절/요청 받지 않기가 respond를 올린다', async () => {
    mountSheet()
    q('pair-accept').click()
    q('pair-decline').click()
    q('pair-block').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('respond')).toEqual([
      [{ accept: true, same: true }],
      [{ accept: false }],
      [{ accept: false, block: true }]
    ])
  })

  it('옛 흐름(legacy)은 그림 없이 수락이 바로 켜지고 same 없이 수락한다', async () => {
    mountSheet({ session: { ...session, legacy: true, sas: null } })
    expect(q('pair-sas')).toBeNull()
    q('pair-accept').click()
    expect(wrapper.emitted('respond')).toEqual([[{ accept: true }]])
  })

  it('수락한 뒤 상대 확인을 기다리는 동안은 대기 문구와 취소만 보인다', async () => {
    mountSheet({ session: { ...session, state: 'waiting-peer-confirm', confirmed: true } })
    expect(q('pair-waiting').textContent).toBe('확인했어요 · 상대 확인 기다리는 중')
    expect(q('pair-accept')).toBeNull()
    q('pair-wait-cancel').click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
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
