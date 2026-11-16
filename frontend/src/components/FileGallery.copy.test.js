import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FileGallery from './FileGallery.vue'
import i18n from '../i18n/index.js'

const files = [{ name: 'a.txt', roomId: 'r', size: 1, created: '2026-10-01T00:00:00.000Z', url: 'u' }]
const stubs = {
  FileCard: { name: 'FileCard', props: ['file', 'isSelected', 'scope'], emits: ['toggle-selection'], template: '<div class="fc" @click="$emit(\'toggle-selection\')"></div>' }
}
let w
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
const setup = async () => {
  w = mount(FileGallery, { props: { files, roomId: 'r', isLoading: false, scope: 'ip' }, global: { plugins: [i18n], stubs }, attachTo: document.body })
  await w.find('.fc').trigger('click')
}
const ctrlC = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))

describe('FileGallery Ctrl+C', () => {
  it('선택된 파일이 있어도 textarea에서 Ctrl+C면 파일 복사를 내보내지 않는다', async () => {
    await setup()
    const ta = document.createElement('textarea'); document.body.appendChild(ta)
    ctrlC(ta)
    expect(w.emitted('copy-selected-to-clipboard')).toBeUndefined()
  })
  it('글자를 선택해 둔 상태면 내보내지 않는다', async () => {
    await setup()
    const p = document.createElement('p'); p.textContent = 'hello'; document.body.appendChild(p)
    const r = document.createRange(); r.selectNodeContents(p)
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
    ctrlC(document.body)
    sel.removeAllRanges()
    expect(w.emitted('copy-selected-to-clipboard')).toBeUndefined()
  })
  it('글자 선택이 없고 body에서 Ctrl+C면 선택 파일 복사를 내보낸다', async () => {
    await setup()
    window.getSelection().removeAllRanges()
    ctrlC(document.body)
    expect(w.emitted('copy-selected-to-clipboard')).toHaveLength(1)
  })
})
