import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import ko from '../i18n/locales/ko.json'
import WindowDropOverlay from './WindowDropOverlay.vue'

vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../utils/analytics'

const i18n = createI18n({ legacy: false, locale: 'ko', messages: { ko } })

function dragEvent(type, { types = ['Files'], files = [], target = document.body } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  e.dataTransfer = { types, files, dropEffect: 'none' }
  target.dispatchEvent(e)
  return e
}
const file = () => new File(['x'], 'a.txt')

describe('WindowDropOverlay', () => {
  let w
  const mountIt = (props = {}) => {
    w = mount(WindowDropOverlay, { props: { enabled: true, ...props }, global: { plugins: [i18n] }, attachTo: document.body })
    return w
  }
  beforeEach(() => { vi.mocked(trackEvent).mockClear() })
  afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

  it('Files 드래그에서만 표시되고 현재 범위가 보인다', async () => {
    mountIt({ scopeKind: 'global' })
    dragEvent('dragenter', { types: ['text/plain'] })
    await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
    dragEvent('dragenter')
    await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(true)
    expect(w.text()).toContain('여기에 놓으면 바로 올라가요')
    expect(w.text()).toContain('전체 공유로 보내요')
  })

  it('drop 시 업로드를 한 번 emit하고 닫힌다', async () => {
    mountIt()
    dragEvent('dragenter'); await nextTick()
    const e = dragEvent('drop', { files: [file(), file()] })
    await nextTick()
    expect(e.defaultPrevented).toBe(true)
    expect(w.emitted('drop-files')).toHaveLength(1)
    expect(w.emitted('drop-files')[0][0]).toHaveLength(2)
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
    expect(trackEvent).toHaveBeenCalledWith('window_drop', { file_count: 2, on_card: false })
  })

  it('카드 위 drop은 오버레이가 다시 올리지 않는다(카드가 한 번만 올림)', async () => {
    mountIt()
    const card = document.createElement('div')
    card.setAttribute('data-testid', 'upload-dropzone')
    document.body.appendChild(card)
    dragEvent('dragenter', { target: card }); await nextTick()
    dragEvent('drop', { files: [file()], target: card })
    await nextTick()
    expect(w.emitted('drop-files')).toBeUndefined()
    expect(trackEvent).toHaveBeenCalledWith('window_drop', { file_count: 1, on_card: true })
  })

  it('enter/leave 깜빡임 없이 중첩 이동 중에는 유지되고, 창 밖으로 나가면 닫힌다', async () => {
    mountIt()
    dragEvent('dragenter'); dragEvent('dragenter'); await nextTick()
    dragEvent('dragleave'); await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(true)
    dragEvent('dragleave'); await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
  })

  it('Esc로 닫힌다', async () => {
    mountIt()
    dragEvent('dragenter'); await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
  })

  it('모바일(disabled)에서는 반응하지 않는다', async () => {
    mountIt({ disabled: true })
    dragEvent('dragenter'); await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
    dragEvent('drop', { files: [file()] })
    expect(w.emitted('drop-files')).toBeUndefined()
  })

  it('방 미연결이면 오버레이 없이 기본 동작만 막고 업로드하지 않는다', async () => {
    mountIt({ enabled: false })
    const over = dragEvent('dragover')
    await nextTick()
    expect(over.defaultPrevented).toBe(true)
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
    const d = dragEvent('drop', { files: [file()] })
    expect(d.defaultPrevented).toBe(true)
    expect(w.emitted('drop-files')).toBeUndefined()
  })

  it('모달이 열려 있으면 표시하지 않는다', async () => {
    mountIt()
    const m = document.createElement('div'); m.setAttribute('role', 'dialog'); document.body.appendChild(m)
    dragEvent('dragenter'); await nextTick()
    expect(w.find('[data-testid="window-drop-overlay"]').exists()).toBe(false)
  })
})
