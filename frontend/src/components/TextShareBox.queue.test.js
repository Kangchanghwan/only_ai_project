import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TextShareBox from './TextShareBox.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(null), devices: ref([]) } }
const mountBox = (props = {}) => mount(TextShareBox, { props: { texts: [], ...props }, global: { plugins: [i18n], provide } })

describe('TextShareBox 받는 기기 수 안내', () => {
  it('받을 기기가 있으면 대수를, 보관 범위면 "10분 동안 보관"을 덧붙인다', () => {
    expect(mountBox({ receiverCount: 2 }).find('[data-testid="text-receivers"]').text()).toBe('지금 받을 수 있는 다른 기기 2대')
    expect(mountBox({ receiverCount: 1, willQueue: true }).find('[data-testid="text-receivers"]').text()).toBe('지금 받을 수 있는 다른 기기 1대 · 10분 동안 보관')
  })

  it('0대이고 보관 대상이 아니면 전달되지 않는다고, 보관 대상이면 보관한다고 미리 알린다', () => {
    const live = mountBox({ receiverCount: 0 }).find('[data-testid="text-receivers"]')
    expect(live.attributes('data-state')).toBe('nobody')
    expect(live.text()).toBe('지금 받을 기기가 없어 전달되지 않아요. 잠금을 켜면 10분 동안 보관돼요.')
    const queued = mountBox({ receiverCount: 0, willQueue: true }).find('[data-testid="text-receivers"]')
    expect(queued.attributes('data-state')).toBe('queued')
    expect(queued.text()).toContain('10분 동안 보관했다가')
  })

  it('수를 모르면(null) 표시하지 않는다', () => {
    expect(mountBox().find('[data-testid="text-receivers"]').exists()).toBe(false)
  })

  it('보관 범위에서 공유에 성공하면 보관했다고 알린다', async () => {
    const w = mountBox({ receiverCount: 0, willQueue: true })
    await w.find('[data-testid="text-input"]').setValue('hi')
    await w.find('[data-testid="text-compose"]').trigger('submit')
    w.emitted('share-text')[0][0].done(true)
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-share-result"]').text()).toBe('공유했어요. 10분 동안 보관해 나중에 들어온 기기도 받아요.')
  })
})

describe('TextShareBox 보관 중·잠긴 텍스트 카드', () => {
  const queued = { id: 'q1', content: '보낸 글', timestamp: 0, roomId: 'r', expiresAt: 1, remainingMs: 8 * 60000 - 1000, canCancel: true }

  it('보관 중이면 남은 시간과 보관 취소 버튼, 누르면 cancel-text', async () => {
    const w = mountBox({ texts: [queued] })
    expect(w.find('[data-testid="text-expires"]').text()).toBe('8분 뒤 삭제')
    await w.find('[data-testid="text-cancel-keep"]').trigger('click')
    expect(w.emitted('cancel-text')[0]).toEqual(['q1'])
  })

  it('1분 미만은 "곧 삭제", 지울 증명이 없으면 취소 버튼이 없다, 보관 중이 아니면 줄 자체가 없다', () => {
    const soon = mountBox({ texts: [{ ...queued, remainingMs: 30000, canCancel: false }] })
    expect(soon.find('[data-testid="text-expires"]').text()).toBe('곧 삭제')
    expect(soon.find('[data-testid="text-cancel-keep"]').exists()).toBe(false)
    const live = mountBox({ texts: [{ ...queued, expiresAt: undefined, remainingMs: 0 }] })
    expect(live.find('[data-testid="text-queued"]').exists()).toBe(false)
  })

  it('잠긴 텍스트는 내용·복사 없이 "잠긴 텍스트"로만 보이고, 비밀번호로 풀기를 요청한다', async () => {
    const w = mountBox({ texts: [{ id: 'L1', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' }] })
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-locked"]').text()).toContain('잠긴 텍스트')

    await w.find('[data-testid="text-unlock-open"]').trigger('click')
    await w.find('[data-testid="text-unlock-password"]').setValue('wrong')
    await w.find('[data-testid="text-unlock-form"]').trigger('submit')
    const [{ id, password, done }] = w.emitted('unlock-text')[0]
    expect({ id, password }).toEqual({ id: 'L1', password: 'wrong' })
    done({ ok: false, code: 'WRONG_PASSWORD', remaining: 3 })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-unlock-message"]').text()).toBe('비밀번호가 맞지 않아요 · 남은 시도 3회')

    await w.find('[data-testid="text-unlock-form"]').trigger('submit')
    w.emitted('unlock-text')[1][0].done({ ok: false, code: 'TEXT_NOT_FOUND' })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-unlock-message"]').text()).toBe('보관 시간(10분)이 지나 열 수 없어요.')
  })

  it('풀린 잠긴 텍스트는 일반 카드처럼 내용과 복사 버튼이 보인다', () => {
    const w = mountBox({ texts: [{ id: 'L2', content: '열림', locked: true, salt: 's', timestamp: 0, roomId: 'r' }] })
    expect(w.find('[data-testid="text-body"]').text()).toBe('열림')
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(true)
  })
})
