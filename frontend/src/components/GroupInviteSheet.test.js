import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GroupInviteSheet from './GroupInviteSheet.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const sheet = (over = {}) => ({ roomId: 'prv-g-' + 'ab12'.repeat(6), name: '우리 방', url: 'https://x.test/#/pv?r=1', qrDataUrl: 'data:image/png;base64,QR', loading: false, ...over })
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

describe('GroupInviteSheet', () => {
  it('sheet가 없으면 아무것도 그리지 않는다', () => {
    const w = mount(GroupInviteSheet, { ...opts, props: { sheet: null } })
    expect(q('group-invite-sheet')).toBeNull()
    w.unmount()
  })

  it('QR 이미지와 안내 2줄(10분 유효, 믿는 사람에게만)과 링크 복사 버튼을 보여 준다', () => {
    const w = mount(GroupInviteSheet, { ...opts, props: { sheet: sheet() } })
    expect(q('group-invite-qr').getAttribute('src')).toBe('data:image/png;base64,QR')
    expect(q('group-invite-expiry').textContent).toBe('이 QR은 10분 동안 쓸 수 있어요')
    expect(q('group-invite-warning').textContent).toContain('믿는 사람에게만')
    expect(document.body.querySelector('#group-invite-title').textContent).toContain('우리 방')
    expect(q('group-invite-copy').textContent.trim()).toBe('링크 복사')
    expect(q('group-invite-copy').disabled).toBe(false)
    w.unmount()
  })

  it('만드는 중이면 QR 자리표시와 비활성 복사 버튼', () => {
    const w = mount(GroupInviteSheet, { ...opts, props: { sheet: sheet({ url: '', qrDataUrl: '', loading: true }) } })
    expect(q('group-invite-qr')).toBeNull()
    expect(q('group-invite-loading')).not.toBeNull()
    expect(q('group-invite-copy').disabled).toBe(true)
    w.unmount()
  })

  it('복사·닫기·Esc가 이벤트로 올라간다', async () => {
    const w = mount(GroupInviteSheet, { ...opts, props: { sheet: sheet() } })
    q('group-invite-copy').click()
    q('group-invite-close').click()
    document.body.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('copy')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(2)
    w.unmount()
  })
})
