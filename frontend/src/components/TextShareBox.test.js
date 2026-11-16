import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TextShareBox from './TextShareBox.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const fox = { adj: 1, animal: 1 }
const sender = { socketId: 'me', identity: fox, deviceLabel: 'mac', browser: 'Chrome' }
const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(fox), devices: ref([sender]) } }
const mountBox = (props = {}) => mount(TextShareBox, { props: { texts: [], ...props }, global: { plugins: [i18n], provide } })

describe('TextShareBox 직접 입력', () => {
  it('공유 버튼은 빈 입력이면 비활성이고 emit하지 않는다', async () => {
    const w = mountBox()
    expect(w.find('[data-testid="text-share-button"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="text-compose"]').trigger('submit')
    expect(w.emitted('share-text')).toBeFalsy()
  })

  it('입력(붙여넣기 포함)만으로는 전송되지 않고, 공유 버튼으로 전송하며 성공하면 입력을 비운다', async () => {
    const w = mountBox()
    const ta = w.find('[data-testid="text-input"]')
    await ta.setValue('  hello  ')
    await ta.trigger('paste')
    expect(w.emitted('share-text')).toBeFalsy()
    await w.find('[data-testid="text-compose"]').trigger('submit')
    const [{ content, done }] = w.emitted('share-text')[0]
    expect(content).toBe('hello')
    done(true)
    await w.vm.$nextTick()
    expect(ta.element.value).toBe('')
  })

  it('전송 실패/취소(done(false))면 입력을 유지한다', async () => {
    const w = mountBox()
    const ta = w.find('[data-testid="text-input"]')
    await ta.setValue('keep me')
    await w.find('[data-testid="text-compose"]').trigger('submit')
    w.emitted('share-text')[0][0].done(false)
    await w.vm.$nextTick()
    expect(ta.element.value).toBe('keep me')
  })

  it('Enter는 줄바꿈이고 Ctrl+Enter(⌘+Enter)로 전송한다, 붙여넣기 버튼은 이 상자에 없다', async () => {
    const w = mountBox()
    const ta = w.find('[data-testid="text-input"]')
    expect(ta.attributes('rows')).toBe('1')
    expect(w.find('[data-testid="text-paste-button"]').exists()).toBe(false)
    await ta.setValue('go')
    await ta.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('share-text')).toBeFalsy()
    await ta.trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(w.emitted('share-text')[0][0].content).toBe('go')
  })

  it('공유 버튼은 주황(bg-primary)이 아니라 남색(bg-ink)이다', () => {
    const btn = mountBox().find('[data-testid="text-share-button"]')
    expect(btn.classes()).toContain('bg-ink')
    expect(btn.classes().join(' ')).not.toContain('bg-primary')
  })
})

describe('TextShareBox 잠금 보내기 버튼', () => {
  it('잠금이면 자물쇠 아이콘과 "잠그고 보내기", 아니면 기존 "공유"', () => {
    const on = mountBox({ storageMode: 'locked' }).find('[data-testid="text-share-button"]')
    expect(on.attributes('data-locked')).toBe('true')
    expect(on.find('svg').exists()).toBe(true)
    expect(on.text()).toBe(i18n.global.t('lock.confirmLockedSend'))
    expect(on.classes()).toContain('inline-flex')
    const off = mountBox({ storageMode: 'plain' }).find('[data-testid="text-share-button"]')
    expect(off.attributes('data-locked')).toBeUndefined()
    expect(off.find('svg').exists()).toBe(false)
    expect(off.text()).toBe('공유')
  })
})

describe('TextShareBox 링크 미리 채우기 (#/send?t=)', () => {
  it('prefill은 입력란만 채우고 자동 전송하지 않으며 안내 문구를 보인다', async () => {
    const w = mountBox({ prefill: '링크 텍스트' })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-input"]').element.value).toBe('링크 텍스트')
    expect(w.find('[data-testid="text-prefill-note"]').exists()).toBe(true)
    expect(w.emitted('share-text')).toBeFalsy()
  })

  it('공유 성공·실패를 role=status 문구로 남긴다', async () => {
    const w = mountBox({ prefill: 'x' })
    await w.vm.$nextTick()
    await w.find('[data-testid="text-compose"]').trigger('submit')
    w.emitted('share-text')[0][0].done(true)
    await w.vm.$nextTick()
    const status = w.find('[data-testid="text-share-result"]')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).not.toBe('')
    expect(w.find('[data-testid="text-prefill-note"]').exists()).toBe(false)
  })

  it('이미 입력 중인 내용은 덮어쓰지 않는다', async () => {
    const w = mountBox()
    await w.find('[data-testid="text-input"]').setValue('내가 쓰던 글')
    await w.setProps({ prefill: '링크 텍스트' })
    expect(w.find('[data-testid="text-input"]').element.value).toBe('내가 쓰던 글')
  })
})
