import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PairRequestSheet from './PairRequestSheet.vue'
import PairConfirmSheet from './PairConfirmSheet.vue'
import i18n from '../i18n/index.js'

const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
const base = { sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: true, legacy: false, peer }
let wrapper
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
afterEach(() => wrapper?.unmount())

describe('1:1 확인 그림 로딩 상태', () => {
  it('요청 시트: 그림이 없으면 로딩 문구와 스켈레톤을 보이고 수락만 막는다(거절은 가능)', async () => {
    wrapper = mount(PairRequestSheet, { props: { session: { ...base, sas: null } }, global: { plugins: [i18n] }, attachTo: document.body })
    expect(q('pair-sas-loading-text').textContent).toContain('그림을 불러오는 중')
    expect(document.body.querySelectorAll('[data-testid="pair-sas-skeleton-tile"]')).toHaveLength(4)
    expect(q('pair-accept').disabled).toBe(true)
    expect(q('pair-accept').getAttribute('aria-disabled')).toBe('true')
    expect(q('pair-decline').disabled).toBe(false)
    await wrapper.setProps({ session: { ...base, sas: [1, 2, 3, 4] } })
    expect(q('pair-sas-loading-text')).toBeNull()
    expect(document.body.querySelectorAll('[data-testid="pair-sas-image"]')).toHaveLength(4)
    expect(q('pair-accept').disabled).toBe(false)
    expect(q('pair-accept').getAttribute('aria-disabled')).toBe('false')
  })

  it('확인 시트: 그림 준비 전에는 같아요/달라요 대신 같아요 비활성, 준비되면 활성', async () => {
    wrapper = mount(PairConfirmSheet, { props: { session: { ...base, legacy: true, state: 'accepted', sas: null }, me: null }, global: { plugins: [i18n] }, attachTo: document.body })
    expect(q('pair-sas-loading-text')).not.toBeNull()
    expect(q('pair-same').disabled).toBe(true)
    expect(q('pair-same').getAttribute('aria-disabled')).toBe('true')
    expect(q('pair-confirm-cancel')).not.toBeNull()
    await wrapper.setProps({ session: { ...base, legacy: true, state: 'keyed', sas: [5, 6, 7, 8] } })
    expect(q('pair-sas-loading-text')).toBeNull()
    expect(q('pair-same').disabled).toBe(false)
  })
})
