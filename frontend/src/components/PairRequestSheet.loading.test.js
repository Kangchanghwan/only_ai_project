import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PairRequestSheet from './PairRequestSheet.vue'
import PairConfirmSheet from './PairConfirmSheet.vue'
import PairSasTiles from './PairSasTiles.vue'
import i18n from '../i18n/index.js'
import { sasImages } from '../utils/sasImages'
import { loadAllSas } from '../test/sasLoad.js'

const peer = { socketId: 'p1', identity: { adj: 1, animal: 1 }, deviceType: 'mobile', browser: 'Safari', os: 'iOS' }
const base = { sessionId: 's1', role: 'responder', state: 'incoming', sameNetwork: true, legacy: false, peer }
let wrapper
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const qa = (id) => [...document.body.querySelectorAll(`[data-testid="${id}"]`)]
const mountReq = (sas) => mount(PairRequestSheet, { props: { session: { ...base, sas } }, global: { plugins: [i18n] }, attachTo: document.body })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })

describe('1:1 확인 그림 로딩 상태 (데이터 없음 / 이미지 load 대기)', () => {
  it('요청 시트: 그림 데이터가 없으면 로딩 문구와 스켈레톤을 보이고 수락만 막는다(거절은 가능)', async () => {
    wrapper = mountReq(null)
    expect(q('pair-sas-loading-text').textContent).toContain('그림을 불러오는 중')
    expect(qa('pair-sas-skeleton-tile')).toHaveLength(4)
    expect(q('pair-accept').disabled).toBe(true)
    expect(q('pair-accept').getAttribute('aria-disabled')).toBe('true')
    expect(q('pair-decline').disabled).toBe(false)
  })

  it('요청 시트: 데이터가 와도 <img> 4장이 모두 load 되기 전에는 막혀 있고, 4장 load 뒤에 풀린다', async () => {
    wrapper = mountReq([1, 2, 3, 4])
    const imgs = qa('pair-sas-image')
    expect(imgs).toHaveLength(4)
    expect(q('pair-accept').disabled).toBe(true)
    expect(q('pair-sas-loading-text')).not.toBeNull()
    for (const img of imgs.slice(0, 3)) img.dispatchEvent(new Event('load'))
    await wrapper.vm.$nextTick()
    expect(q('pair-accept').disabled).toBe(true)
    expect(q('pair-sas-loading-text')).not.toBeNull()
    imgs[3].dispatchEvent(new Event('load'))
    await wrapper.vm.$nextTick()
    expect(q('pair-sas-loading-text')).toBeNull()
    expect(q('pair-accept').disabled).toBe(false)
    expect(q('pair-accept').getAttribute('aria-disabled')).toBe('false')
  })

  it('error가 난 그림은 이모지 글자로 대신 보이고 준비된 것으로 센다', async () => {
    wrapper = mountReq([1, 2, 3, 4])
    const imgs = qa('pair-sas-image')
    for (const img of imgs.slice(0, 3)) img.dispatchEvent(new Event('load'))
    imgs[3].dispatchEvent(new Event('error'))
    await wrapper.vm.$nextTick()
    const label = q('pair-sas-label')
    expect(label).not.toBeNull()
    expect(label.textContent.trim()).toBe(sasImages([1, 2, 3, 4])[3].emoji)
    expect(q('pair-accept').disabled).toBe(false)
  })

  it('8초 안에 다 못 받으면 못 받은 그림을 글자로 대신하고 수락을 연다', async () => {
    vi.useFakeTimers()
    wrapper = mountReq([1, 2, 3, 4])
    qa('pair-sas-image')[0].dispatchEvent(new Event('load'))
    await wrapper.vm.$nextTick()
    expect(q('pair-accept').disabled).toBe(true)
    vi.advanceTimersByTime(7900)
    await wrapper.vm.$nextTick()
    expect(q('pair-accept').disabled).toBe(true)
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(qa('pair-sas-label')).toHaveLength(3)
    expect(q('pair-sas-loading-text')).toBeNull()
    expect(q('pair-accept').disabled).toBe(false)
  })

  it('확인 시트: 그림 준비 전에는 같아요가 비활성(취소는 가능), 4장 load 뒤에 활성', async () => {
    wrapper = mount(PairConfirmSheet, { props: { session: { ...base, legacy: true, state: 'accepted', sas: null }, me: null }, global: { plugins: [i18n] }, attachTo: document.body })
    expect(q('pair-sas-loading-text')).not.toBeNull()
    expect(q('pair-same').disabled).toBe(true)
    expect(q('pair-confirm-cancel')).not.toBeNull()
    await wrapper.setProps({ session: { ...base, legacy: true, state: 'keyed', sas: [5, 6, 7, 8] } })
    expect(q('pair-same').disabled).toBe(true)
    await loadAllSas()
    expect(q('pair-sas-loading-text')).toBeNull()
    expect(q('pair-same').disabled).toBe(false)
  })

  it('PairSasTiles: 그림 목록이 바뀌면 다시 로딩 상태가 되고 ready-change를 알린다', async () => {
    wrapper = mount(PairSasTiles, { props: { images: sasImages([1, 2, 3, 4]) }, global: { plugins: [i18n] }, attachTo: document.body })
    await loadAllSas()
    await wrapper.setProps({ images: sasImages([9, 10, 11, 12]) })
    expect(q('pair-sas-loading-text')).not.toBeNull()
    expect(wrapper.emitted('ready-change').map((e) => e[0])).toEqual([false, true, false])
  })
})
