import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LegacyInviteSheet from './LegacyInviteSheet.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

describe('LegacyInviteSheet', () => {
  it('sheet가 없으면 그리지 않는다', () => {
    const w = mount(LegacyInviteSheet, { ...opts, props: { sheet: null } })
    expect(q('legacy-invite-sheet')).toBeNull()
    w.unmount()
  })
  it('안내 제목·본문과 "새 방 만들기" 버튼, 누르면 create 이벤트', async () => {
    const w = mount(LegacyInviteSheet, { ...opts, props: { sheet: { roomId: 'prv-' + 'a'.repeat(24) } } })
    expect(document.body.querySelector('#legacy-invite-title').textContent).toBe('예전 방식으로 만든 방이라 초대할 수 없어요')
    expect(q('legacy-invite-sheet').textContent).toContain('새 방을 만들어 이 기기와 다른 기기를 함께 넣어 주세요')
    expect(q('legacy-invite-create').textContent.trim()).toBe('새 방 만들기')
    q('legacy-invite-create').click()
    q('legacy-invite-close').click()
    expect(w.emitted('create')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})
