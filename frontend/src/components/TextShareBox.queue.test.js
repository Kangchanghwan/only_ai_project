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

  it('잠금 꺼짐(평문): 같은 네트워크·전체 공유 각각 누가 볼 수 있는지와 잠금 칩을 보여 준다', () => {
    const ip = mountBox({ storageMode: 'plain', scope: 'ip' })
    expect(label(ip)).toBe('평문 10분 보관 · 같은 네트워크 누구나 볼 수 있어요')
    expect(ip.find('[data-testid="lock-start"]').exists()).toBe(true)
    const global = mountBox({ storageMode: 'plain', scope: 'global' })
    expect(label(global)).toBe('평문 10분 보관 · 모르는 사람도 누구나 볼 수 있어요')
    expect(global.find('[data-testid="text-storage-label"]').classes()).toContain('font-semibold')
  })

  it('잠금 켜짐·1:1 방·보관 안 함(구버전 서버) 문구, 칩은 공개 범위에만', () => {
    expect(label(mountBox({ storageMode: 'locked', scope: 'ip' }))).toBe('암호화해서 10분 보관 · 비밀번호 아는 기기만 봐요')
    const prv = mountBox({ storageMode: 'private', scope: 'prv:prv-1' })
    expect(label(prv)).toBe('1:1 방 키로 암호화해서 10분 보관')
    expect(prv.find('[data-testid="lock-chip"]').exists()).toBe(false)
    const none = mountBox({ storageMode: 'none' })
    expect(label(none)).toBe('보관 안 함 · 지금 열린 기기에만 전달')
    expect(none.find('[data-testid="lock-chip"]').exists()).toBe(false)
  })

  it('받을 기기 수는 보관 방식 박스 안에 짧게: 0대면 들어오면 전달(보관 안 하면 전달 안 됨)', () => {
    const many = mountBox({ receiverCount: 2, storageMode: 'plain' })
    expect(many.find('[data-testid="text-storage"] [data-testid="text-receivers"]').text()).toBe('받을 기기 2대')
    const queued = mountBox({ receiverCount: 0, storageMode: 'plain' }).find('[data-testid="text-receivers"]')
    expect(queued.attributes('data-state')).toBe('queued')
    expect(queued.text()).toBe('받을 기기 0대 · 들어오면 전달')
    const live = mountBox({ receiverCount: 0, storageMode: 'none' }).find('[data-testid="text-receivers"]')
    expect(live.attributes('data-state')).toBe('nobody')
    expect(live.text()).toBe('받을 기기 0대 · 전달 안 됨')
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

  it('붙여넣기 자동 공유 도움말은 키보드·마우스 기기에서만 한 줄, 붙여넣기 버튼 툴팁에도', () => {
    const w = mountBox()
    const hint = w.find('[data-testid="text-autoshare-hint"]')
    expect(hint.classes()).toEqual(expect.arrayContaining(['hidden', 'pointer-fine:block', 'truncate']))
    expect(w.find('[data-testid="text-paste-button"]').attributes('title')).toContain('Ctrl+V')
  })

  it('잠금 칩의 비밀번호 입력 제출은 텍스트 공유로 번지지 않는다', async () => {
    const w = mountBox({ storageMode: 'plain', scope: 'ip' })
    await w.find('[data-testid="text-input"]').setValue('draft')
    await w.find('[data-testid="lock-start"]').trigger('click')
    await w.find('[data-testid="lock-password"]').setValue('ab')
    await w.find('form.lock-form').trigger('submit')
    expect(w.emitted('share-text')).toBeFalsy()
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

  it('96KB를 넘어 보관되지 않은 내 텍스트는 지금 열린 기기에만 갔다고 알리고 .txt로 보내기를 제안한다', async () => {
    const w = mountBox({ texts: [{ id: 'big', content: 'x', timestamp: 0, roomId: 'r', notStored: 'TOO_LARGE' }] })
    expect(w.find('[data-testid="text-not-kept"]').text()).toContain('96KB가 넘어 보관하지 않았어요 · 지금 열린 기기에만 전달됐어요')
    await w.find('[data-testid="text-send-as-file"]').trigger('click')
    expect(w.emitted('send-as-file')[0]).toEqual(['big'])
    const full = mountBox({ texts: [{ id: 'f', content: 'x', timestamp: 0, roomId: 'r', notStored: 'FULL' }] })
    expect(full.find('[data-testid="text-not-kept"]').text()).toContain('서버 보관함이 가득 차')
    expect(full.find('[data-testid="text-send-as-file"]').exists()).toBe(false)
  })

  it('풀린 잠긴 텍스트는 일반 카드처럼 내용과 복사 버튼이 보인다', () => {
    const w = mountBox({ texts: [{ id: 'L2', content: '열림', locked: true, salt: 's', timestamp: 0, roomId: 'r' }] })
    expect(w.find('[data-testid="text-body"]').text()).toBe('열림')
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(true)
  })
})
