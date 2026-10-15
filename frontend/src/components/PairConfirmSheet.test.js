import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PairConfirmSheet from './PairConfirmSheet.vue'
import i18n from '../i18n/index.js'
import manifest from '../assets/sas/manifest.json'

const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile' }
const base = { sessionId: 's1', role: 'initiator', state: 'keyed', peer, sas: [0, 5, 63, 10] }
let wrapper
const mountSheet = (session = base) => {
  wrapper = mount(PairConfirmSheet, {
    props: { session, me: { identity: { adj: 0, animal: 0 } } },
    global: { plugins: [i18n] }, attachTo: document.body
  })
  return wrapper
}
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
afterEach(() => wrapper?.unmount())

describe('PairConfirmSheet', () => {
  it('그림 4장을 이모지 alt와 함께 그리고 글자 라벨은 없다', () => {
    mountSheet()
    const imgs = [...document.body.querySelectorAll('[data-testid="pair-sas-image"]')]
    expect(imgs).toHaveLength(4)
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(base.sas.map((v) => manifest[v].emoji))
    expect(q('pair-confirm-sheet').textContent).toContain('두 화면의 그림이 같은지 확인하세요')
  })

  it('달라요/같아요가 confirm(false/true)을 올린다', async () => {
    mountSheet()
    q('pair-different').click()
    q('pair-same').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')).toEqual([[false], [true]])
  })

  it('내가 확인한 뒤에는 대기 문구만 보이고 버튼은 취소 하나다', () => {
    mountSheet({ ...base, state: 'waiting-peer-confirm' })
    expect(q('pair-waiting').textContent).toContain('상대 확인 기다리는 중')
    expect(q('pair-same')).toBeNull()
    expect(q('pair-confirm-cancel')).not.toBeNull()
  })

  it('키 교환 중(sas 없음)에는 그림 대신 준비 문구', () => {
    mountSheet({ ...base, state: 'accepted', sas: null })
    expect(q('pair-sas')).toBeNull()
    expect(q('pair-confirm-sheet').textContent).toContain('준비')
  })

  it('Esc는 cancel을 올린다', async () => {
    mountSheet()
    q('pair-same').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
