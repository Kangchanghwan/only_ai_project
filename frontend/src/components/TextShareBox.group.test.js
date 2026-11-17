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

describe('TextShareBox 보관 안내: 방에서도 보관 기간만 짧게', () => {
  it('그룹 방도 보관 기간 한 줄 (1:1이라는 말 없음)', () => {
    const w = mountBox({ scope: 'prv:' + G })
    expect(label(w)).toBe('텍스트 10분 · 파일 최대 1일 보관')
    expect(label(w)).not.toContain('1:1')
  })

  it('예전 방도 같은 문구', () => {
    expect(label(mountBox({ scope: 'prv:prv-' + 'a'.repeat(24) }))).toBe('텍스트 10분 · 파일 최대 1일 보관')
  })

  it('영어도 1:1 없이', () => {
    i18n.global.locale.value = 'en'
    try {
      expect(label(mountBox({ scope: 'prv:' + G }))).toBe('Text kept 10 min · files up to 1 day')
      expect(label(mountBox({ scope: 'prv:prv-' + 'a'.repeat(24) }))).toBe('Text kept 10 min · files up to 1 day')
    } finally {
      i18n.global.locale.value = 'ko'
    }
  })
})
