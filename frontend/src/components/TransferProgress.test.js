import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TransferProgress from './TransferProgress.vue'
import i18n from '../i18n/index.js'

const up = (name, extra = {}) => ({ fileName: name, percent: 30, status: 'uploading', cancellable: true, ...extra })
const mountWith = (entries) => mount(TransferProgress, { global: { plugins: [i18n] }, props: { uploads: new Map(entries) } })

describe('TransferProgress (inline 진행 패널)', () => {
  it('진행 항목이 없으면 렌더링하지 않는다', () => {
    expect(mountWith([]).find('[data-testid="transfer-progress"]').exists()).toBe(false)
  })

  it('개별 취소는 id와 함께 cancel-upload를 올린다', async () => {
    const w = mountWith([['a', up('a.bin')], ['b', up('b.bin')]])
    await w.findAll('.cancel-btn')[1].trigger('click')
    expect(w.emitted('cancel-upload')[0]).toEqual(['b'])
  })

  it('진행 중 업로드가 2개 이상일 때만 모두 취소가 나오고 cancel-all을 올린다', async () => {
    expect(mountWith([['a', up('a')]]).find('.cancel-all-btn').exists()).toBe(false)
    const w = mountWith([['a', up('a')], ['b', up('b')]])
    await w.find('.cancel-all-btn').trigger('click')
    expect(w.emitted('cancel-all')).toHaveLength(1)
  })

  it('다운로드(취소 불가)와 완료 항목에는 취소 버튼이 없다', () => {
    const w = mountWith([['d', up('d', { cancellable: false })], ['c', up('c', { status: 'completed' })]])
    expect(w.find('.cancel-btn').exists()).toBe(false)
  })
})
