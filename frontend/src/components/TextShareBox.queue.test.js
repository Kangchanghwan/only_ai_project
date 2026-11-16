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
    expect(label(prv)).toBe('방 키로 암호화해서 10분 보관')
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

  it('붙여넣기 자동 공유 도움말은 화면 줄 대신 스크린리더 문구와 입력란 툴팁으로', () => {
    const w = mountBox()
    const hint = w.find('[data-testid="text-autoshare-hint"]')
    expect(hint.classes()).toContain('sr-only')
    expect(w.find('[data-testid="text-input"]').attributes('title')).toContain('Ctrl+V')
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
