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

  it('붙여넣기 버튼은 paste-content를 emit한다', async () => {
    const w = mountBox()
    await w.find('[data-testid="text-paste-button"]').trigger('click')
    expect(w.emitted('paste-content')).toHaveLength(1)
  })
})

describe('TextShareBox 받은 텍스트', () => {
  const time = Date.now() - 3 * 60_000
  it('보낸 사람+시간 헤더는 항목당 한 번이고, 복사 버튼은 hover 없이 보인다', async () => {
    const w = mountBox({ texts: [{ id: '1', content: 'hi', timestamp: time, sender }] })
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
    const w = mountBox({ texts: [{ id: '1', content: 'hi', timestamp: time }] })
    expect(w.find('[data-testid="text-delete"]').exists()).toBe(false)
    await w.find('[data-testid="text-more"]').trigger('click')
    await w.find('[data-testid="text-delete"]').trigger('click')
    expect(w.emitted('remove-text')[0]).toEqual(['1'])
  })

  it('본문은 일반 텍스트로만 렌더링된다 (HTML 주입 없음)', () => {
    const w = mountBox({ texts: [{ id: '1', content: '<img src=x onerror=alert(1)><b>x</b>', timestamp: time }] })
    expect(w.find('[data-testid="text-body"] img').exists()).toBe(false)
    expect(w.find('[data-testid="text-body"]').text()).toContain('<img src=x')
  })
})
