import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GroupJoinSheet from './GroupJoinSheet.vue'
import i18n from '../i18n/index.js'

const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

describe('GroupJoinSheet (입장 확인)', () => {
  it('sheet가 없으면 그리지 않는다', () => {
    const w = mount(GroupJoinSheet, { ...opts, props: { sheet: null } })
    expect(q('group-join-sheet')).toBeNull()
    w.unmount()
  })

  it('제목에 방 이름, 본문 경고, 들어가기/취소 버튼', () => {
    const w = mount(GroupJoinSheet, { ...opts, props: { sheet: { roomId: 'r', name: '친구 방', busy: false } } })
    expect(q('group-join-title').textContent).toBe("'친구 방' 방에 들어갈까요?")
    expect(document.body.textContent).toContain('이 방에 올린 파일과 텍스트는 방에 있는 모든 기기가 볼 수 있어요')
    expect(q('group-join-confirm').textContent.trim()).toBe('들어가기')
    expect(q('group-join-cancel').textContent.trim()).toBe('취소')
    w.unmount()
  })

  it('들어가기는 confirm, 취소와 Esc는 cancel을 올린다 (아무것도 자동으로 하지 않는다)', () => {
    const w = mount(GroupJoinSheet, { ...opts, props: { sheet: { roomId: 'r', name: 'x', busy: false } } })
    expect(w.emitted('confirm')).toBeUndefined()
    q('group-join-confirm').click()
    q('group-join-cancel').click()
    document.body.querySelector('[role="alertdialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(2)
    w.unmount()
  })

  it('처리 중(busy)에는 두 버튼이 비활성', () => {
    const w = mount(GroupJoinSheet, { ...opts, props: { sheet: { roomId: 'r', name: 'x', busy: true } } })
    expect(q('group-join-confirm').disabled).toBe(true)
    expect(q('group-join-cancel').disabled).toBe(true)
    w.unmount()
  })

  it('첫 포커스는 취소 버튼', async () => {
    const w = mount(GroupJoinSheet, { ...opts, props: { sheet: { roomId: 'r', name: 'x', busy: false } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement).toBe(q('group-join-cancel'))
    w.unmount()
  })
})
