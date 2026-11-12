import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TextShareBox from './TextShareBox.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(null), devices: ref([]) } }
const mountBox = (props = {}) => mount(TextShareBox, { props: { texts: [], storageMode: 'private', ...props }, global: { plugins: [i18n], provide } })
const label = (w) => w.find('[data-testid="text-storage-label"]').text()
const G = 'prv-g-' + 'ab12'.repeat(6)

describe('TextShareBox 보관 안내: 그룹 방 vs 1:1 방', () => {
  it('그룹 방은 1:1 이라는 말 없이 "방 키" 문구를 쓴다', () => {
    const w = mountBox({ scope: 'prv:' + G })
    expect(label(w)).toBe('방 키로 암호화해서 10분 보관')
    expect(label(w)).not.toContain('1:1')
  })

  it('예전 방도 같은 문구', () => {
    expect(label(mountBox({ scope: 'prv:prv-' + 'a'.repeat(24) }))).toBe('방 키로 암호화해서 10분 보관')
  })

  it('영어도 1:1 없이', () => {
    i18n.global.locale.value = 'en'
    try {
      expect(label(mountBox({ scope: 'prv:' + G }))).toBe('Encrypted with the room key, kept 10 min')
      expect(label(mountBox({ scope: 'prv:prv-' + 'a'.repeat(24) }))).toBe('Encrypted with the room key, kept 10 min')
    } finally {
      i18n.global.locale.value = 'ko'
    }
  })
})
