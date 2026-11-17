import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TextShareBox from './TextShareBox.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(null), devices: ref([]) } }
const mountBox = (props = {}) => mount(TextShareBox, { props: { texts: [], ...props }, global: { plugins: [i18n], provide } })

describe('TextShareBox 보관 방식·받는 기기 수 안내', () => {
  const label = (w) => w.find('[data-testid="text-storage-label"]').text()

  it('보관하는 모드(평문·잠금·방)는 모두 보관 기간과 파일 한도만 보여 준다', () => {
    for (const [mode, scope] of [['plain', 'ip'], ['plain', 'global'], ['locked', 'ip'], ['private', 'prv:prv-1']]) {
      const w = mountBox({ storageMode: mode, scope })
      expect(label(w)).toBe('텍스트 10분 · 파일 최대 1일 보관')
      expect(w.find('[data-testid="text-storage"]').text()).toBe('텍스트 10분 · 파일 최대 1일 보관 · 파일당 5GB')
    }
    expect(mountBox({ storageMode: 'plain', scope: 'ip' }).findAll('[data-testid="lock-chip"]')).toHaveLength(1)
    expect(mountBox({ storageMode: 'private', scope: 'prv:prv-1' }).find('[data-testid="lock-chip"]').exists()).toBe(false)
  })

  it('보관 안 함(구버전 서버) 문구는 그대로', () => {
    const none = mountBox({ storageMode: 'none' })
    expect(label(none)).toBe('보관 안 함 · 지금 열린 기기에만 전달')
    expect(none.findAll('[data-testid="lock-chip"]')).toHaveLength(1)
  })

  it('받을 기기는 0대일 때만: 들어오면 전달(보관 안 하면 전달 안 됨). 1대 이상이면 줄에 없다', () => {
    const many = mountBox({ receiverCount: 2, storageMode: 'plain' })
    expect(many.find('[data-testid="text-receivers"]').exists()).toBe(false)
    expect(many.text()).not.toContain('받을 기기')
    const queued = mountBox({ receiverCount: 0, storageMode: 'plain' }).find('[data-testid="text-receivers"]')
    expect(queued.attributes('data-state')).toBe('queued')
    expect(queued.text()).toBe('· 받을 기기 0대 · 들어오면 전달')
    const live = mountBox({ receiverCount: 0, storageMode: 'none' }).find('[data-testid="text-receivers"]')
    expect(live.attributes('data-state')).toBe('nobody')
    expect(live.text()).toBe('· 받을 기기 0대 · 전달 안 됨')
  })

  it('수를 모르면(null) 표시하지 않는다', () => {
    expect(mountBox().find('[data-testid="text-receivers"]').exists()).toBe(false)
  })

  it('보낸 직후 성공 문장은 화면에 고정하지 않고(보조기술용으로만) 실패는 보인다', async () => {
    const w = mountBox({ receiverCount: 0, storageMode: 'plain' })
    await w.find('[data-testid="text-input"]').setValue('hi')
    await w.find('[data-testid="text-compose"]').trigger('submit')
    w.emitted('share-text')[0][0].done(true)
    await w.vm.$nextTick()
    const status = w.find('[data-testid="text-share-result"]')
    expect(status.classes()).toContain('sr-only')
    await w.find('[data-testid="text-input"]').setValue('again')
    await w.find('[data-testid="text-compose"]').trigger('submit')
    w.emitted('share-text')[1][0].done(false)
    await w.vm.$nextTick()
    expect(status.classes()).not.toContain('sr-only')
    expect(status.text()).toBe('공유하지 못했어요. 다시 시도해 주세요.')
  })

  it('붙여넣기 자동 공유 도움말은 화면 줄 대신 스크린리더 문구와 입력란 툴팁으로', () => {
    const w = mountBox()
    const hint = w.find('[data-testid="text-autoshare-hint"]')
    expect(hint.classes()).toContain('sr-only')
    expect(w.find('[data-testid="text-input"]').attributes('title')).toContain('Ctrl+V')
  })

})
