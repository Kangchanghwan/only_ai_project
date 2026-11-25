import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PairRequestSheet from './PairRequestSheet.vue'
import DeviceRow from './DeviceRow.vue'
import i18n from '../i18n/index.js'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'

const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
let wrapper
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
afterEach(() => { wrapper?.unmount(); i18n.global.locale.value = 'ko' })

describe('QR 연결 요청 화면', () => {
  it('PC 요청 창: 그림 대신 QR 안내, 키가 준비되면 수락 한 번이 수락+확인', async () => {
    i18n.global.locale.value = 'ko'
    const session = { sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: false, legacy: false, viaQr: true, sas: [1, 2, 3, 4], peer }
    wrapper = mount(PairRequestSheet, { props: { session }, global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('#pair-request-title').textContent).toBe('QR로 연결 요청')
    expect(q('pair-qr-body')).not.toBeNull()
    expect(document.body.querySelectorAll('[data-testid="pair-sas"], [data-testid="pair-sas-loading"]').length).toBe(0)
    expect(q('pair-accept').disabled).toBe(false)
    q('pair-accept').click()
    expect(wrapper.emitted('respond')[0][0]).toEqual({ accept: true, same: true })
  })

  it('PC 요청 창: 키가 준비되기 전에는 수락할 수 없다', async () => {
    const session = { sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: false, legacy: false, viaQr: true, sas: null, peer }
    wrapper = mount(PairRequestSheet, { props: { session }, global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(q('pair-accept').disabled).toBe(true)
  })

  it('휴대폰 기기 줄: 그림·같아요 버튼 없이 수락 대기 문구와 취소만', async () => {
    const states = { value: { p1: { state: 'pending', sessionId: 's1', expiresAt: null, sas: [1, 2, 3, 4], confirmed: true, viaQr: true } } }
    wrapper = mount(DeviceRow, { props: { device: peer }, global: { plugins: [i18n], provide: { [PAIR_CONTEXT_KEY]: { states, invite() {}, cancel() {}, confirm() {} } } } })
    expect(wrapper.find('[data-testid="pair-qr-waiting"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pair-same-inline"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pair-sas"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pair-sas-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pair-confirmed-text"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pair-cancel-button"]').exists()).toBe(true)
  })
})
