import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationToast from './NotificationToast.vue'
import i18n from '../i18n/index.js'

const up = (name, extra = {}) => ({ fileName: name, percent: 10, status: 'uploading', cancellable: true, ...extra })
const mountWith = (entries) => mount(NotificationToast, {
  global: { plugins: [i18n] },
  props: { uploads: new Map(entries) },
})

describe('NotificationToast 취소 UI', () => {
  it('진행 카드의 ✕ 버튼은 aria-label을 가지고 cancel-upload를 id와 함께 내보낸다', async () => {
    const w = mountWith([['id1', up('a.bin')]])
    const btn = w.find('.cancel-btn')
    expect(btn.attributes('aria-label')).toBe(i18n.global.t('notification.cancel'))
    await btn.trigger('click')
    expect(w.emitted('cancel-upload')[0]).toEqual(['id1'])
  })

  it('진행 중 업로드가 1개면 모두 취소가 없고 2개 이상이면 보인다', async () => {
    expect(mountWith([['a', up('a')]]).find('.cancel-all-btn').exists()).toBe(false)
    const w = mountWith([['a', up('a')], ['b', up('b')]])
    await w.find('.cancel-all-btn').trigger('click')
    expect(w.emitted('cancel-all')).toHaveLength(1)
  })

  it('다운로드(취소 불가)·완료 카드에는 ✕가 없다', () => {
    const w = mountWith([['d', up('d', { cancellable: false })], ['c', up('c', { status: 'completed' })]])
    expect(w.find('.cancel-btn').exists()).toBe(false)
  })
})
