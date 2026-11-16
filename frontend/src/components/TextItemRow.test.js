import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TextItemRow from './TextItemRow.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const fox = { adj: 1, animal: 1 }
const sender = { socketId: 'me', identity: fox, deviceLabel: 'mac', browser: 'Chrome' }
const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(fox), devices: ref([sender]) } }
const mountRow = (text) => mount(TextItemRow, { props: { text }, global: { plugins: [i18n], provide } })

describe('TextItemRow 받은 텍스트', () => {
  const time = Date.now() - 3 * 60_000
  it('보낸 사람+시간 헤더는 항목당 한 번이고, 복사 버튼은 hover 없이 보인다', async () => {
    const w = mountRow({ id: '1', content: 'hi', timestamp: time, sender })
    const entry = w.find('[data-testid="text-entry"]')
    expect(entry.findAll('[data-testid="sender-label"]')).toHaveLength(1)
    expect(entry.find('[data-testid="text-time"]').exists()).toBe(false)
    expect(entry.text().match(/3분 전/g)).toHaveLength(1)
    const copy = entry.find('[data-testid="text-copy"]')
    expect(copy.classes().join(' ')).not.toContain('opacity-0')
    await copy.trigger('click')
    expect(w.emitted('copy-text')[0]).toEqual(['1'])
  })

  it('삭제는 더보기 메뉴에서 한다', async () => {
    const w = mountRow({ id: '1', content: 'hi', timestamp: time })
    expect(w.find('[data-testid="text-delete"]').exists()).toBe(false)
    await w.find('[data-testid="text-more"]').trigger('click')
    await w.find('[data-testid="text-delete"]').trigger('click')
    expect(w.emitted('remove-text')[0]).toEqual(['1'])
  })

  it('본문은 일반 텍스트로만 렌더링된다 (HTML 주입 없음)', () => {
    const w = mountRow({ id: '1', content: '<img src=x onerror=alert(1)><b>x</b>', timestamp: time })
    expect(w.find('[data-testid="text-body"] img').exists()).toBe(false)
    expect(w.find('[data-testid="text-body"]').text()).toContain('<img src=x')
  })
})


describe('TextItemRow 보관 중·잠긴 텍스트 카드', () => {
  const queued = { id: 'q1', content: '보낸 글', timestamp: 0, roomId: 'r', expiresAt: 1, remainingMs: 8 * 60000 - 1000, canCancel: true }

  it('보관 중이면 남은 시간과 보관 취소 버튼, 누르면 cancel-text', async () => {
    const w = mountRow(queued)
    expect(w.find('[data-testid="text-expires"]').text()).toBe('8분 뒤 삭제')
    await w.find('[data-testid="text-cancel-keep"]').trigger('click')
    expect(w.emitted('cancel-text')[0]).toEqual(['q1'])
  })

  it('1분 미만은 "곧 삭제", 지울 증명이 없으면 취소 버튼이 없다, 보관 중이 아니면 줄 자체가 없다', () => {
    const soon = mountRow({ ...queued, remainingMs: 30000, canCancel: false })
    expect(soon.find('[data-testid="text-expires"]').text()).toBe('곧 삭제')
    expect(soon.find('[data-testid="text-cancel-keep"]').exists()).toBe(false)
    const live = mountRow({ ...queued, expiresAt: undefined, remainingMs: 0 })
    expect(live.find('[data-testid="text-queued"]').exists()).toBe(false)
  })

  it('잠긴 텍스트는 내용·복사 없이 "잠긴 텍스트"로만 보이고, 비밀번호로 풀기를 요청한다', async () => {
    const w = mountRow({ id: 'L1', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' })
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

  it('96KB를 넘어 보관되지 않은 내 텍스트는 지금 열린 기기에만 갔다고 알리고 .txt로 보내기를 제안한다', async () => {
    const w = mountRow({ id: 'big', content: 'x', timestamp: 0, roomId: 'r', notStored: 'TOO_LARGE' })
    expect(w.find('[data-testid="text-not-kept"]').text()).toContain('96KB가 넘어 보관하지 않았어요 · 지금 열린 기기에만 전달됐어요')
    await w.find('[data-testid="text-send-as-file"]').trigger('click')
    expect(w.emitted('send-as-file')[0]).toEqual(['big'])
    const full = mountRow({ id: 'f', content: 'x', timestamp: 0, roomId: 'r', notStored: 'FULL' })
    expect(full.find('[data-testid="text-not-kept"]').text()).toContain('서버 보관함이 가득 차')
    expect(full.find('[data-testid="text-send-as-file"]').exists()).toBe(false)
  })

  it('풀린 잠긴 텍스트는 일반 카드처럼 내용과 복사 버튼이 보인다', () => {
    const w = mountRow({ id: 'L2', content: '열림', locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    expect(w.find('[data-testid="text-body"]').text()).toBe('열림')
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(true)
  })
})

describe('TextItemRow 행 모양', () => {
  it('"텍스트" 태그, 2줄 줄임 본문(누르면 펼침), 복사 버튼은 남색 채움', async () => {
    const w = mountRow({ id: '1', content: 'a\nb\nc\nd', timestamp: Date.now(), sender })
    expect(w.find('[data-testid="text-tag"]').text()).toBe('텍스트')
    const body = w.find('[data-testid="text-body"]')
    expect(body.classes()).toContain('line-clamp-2')
    await body.trigger('click')
    expect(body.classes()).not.toContain('line-clamp-2')
    const copy = w.find('[data-testid="text-copy"]')
    expect(copy.classes()).toContain('bg-ink')
    expect(copy.classes()).toContain('min-h-[44px]')
  })
})
