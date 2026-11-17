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
    expect(on.find('[data-testid="share-label-full"]').text()).toBe(i18n.global.t('lock.confirmLockedSend'))
    // 360px 미만에서는 자물쇠 + 짧은 글자만 (긴 언어에서 상자를 넘치지 않게)
    expect(on.find('[data-testid="share-label-full"]').classes()).toContain('max-[359px]:hidden')
    expect(on.find('[data-testid="share-label-short"]').text()).toBe(i18n.global.t('file.share'))
    expect(on.find('[data-testid="share-label-short"]').classes()).toEqual(expect.arrayContaining(['hidden', 'max-[359px]:inline']))
    expect(on.classes()).toContain('inline-flex')
    const off = mountBox({ storageMode: 'plain' }).find('[data-testid="text-share-button"]')
    expect(off.attributes('data-locked')).toBeUndefined()
    expect(off.find('svg').exists()).toBe(false)
    expect(off.text()).toBe('공유')
  })
})

describe('TextShareBox 잠금 비밀번호 입력 줄 (좁은 화면)', () => {
  it('입력 줄이 열리면 도구 줄이 줄바꿈되어 입력 줄이 한 줄을 다 쓰고, 닫으면 원래대로 돌아간다', async () => {
    const w = mountBox({ storageMode: 'plain' })
    const bar = w.find('[data-testid="send-toolbar"]')
    expect(bar.classes()).toEqual(expect.arrayContaining(['flex-nowrap', 'sm:flex-wrap']))
    await w.find('[data-testid="lock-start"]').trigger('click')
    expect(w.find('[data-testid="lock-password"]').exists()).toBe(true)
    expect(bar.classes()).toContain('flex-wrap')
    expect(bar.classes()).not.toContain('flex-nowrap')
    await w.find('[data-testid="lock-password"]').trigger('keydown', { key: 'Escape' })
    expect(w.find('[data-testid="lock-password"]').exists()).toBe(false)
    expect(bar.classes()).toContain('flex-nowrap')
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

describe('TextShareBox 연결 전 받을 기기 글자 자리', () => {
  it('receiverHint가 있으면 지난번 글자를 보이지 않게 그려 자리만 잡는다', () => {
    const w = mountBox({ receiverCount: 0, receiverHint: 7 })
    const ph = w.find('[data-testid="text-receivers-placeholder"]')
    expect(ph.exists()).toBe(true)
    expect(ph.classes()).toContain('invisible')
    expect(ph.attributes('aria-hidden')).toBe('true')
    expect(ph.text()).toContain('7')
    // 연결 전의 "0대 · 들어오면 전달"은 같이 그리지 않는다
    expect(w.find('[data-testid="text-receivers"]').exists()).toBe(false)
    expect(w.find('[data-testid="upload-limit"]').exists()).toBe(true)
  })
  it('receiverHint가 없으면 원래대로 받을 기기 수를 보여 준다', () => {
    const w = mountBox({ receiverCount: 3 })
    expect(w.find('[data-testid="text-receivers-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-receivers"]').text()).toContain('3')
  })
  it('receiverCount를 쓰지 않는 화면에서는 자리도 잡지 않는다', () => {
    const w = mountBox({ receiverHint: 7 })
    expect(w.find('[data-testid="text-receivers-placeholder"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-receivers"]').exists()).toBe(false)
  })
})
