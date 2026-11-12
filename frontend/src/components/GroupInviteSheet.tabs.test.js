import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import GroupInviteSheet from './GroupInviteSheet.vue'
import i18n from '../i18n/index.js'

let w
const sheet = { roomId: 'prv-g-' + 'ab12'.repeat(6), name: '교실', url: 'https://x/#a', qrDataUrl: 'data:image/png;base64,QR', loading: false }
const mountSheet = (props = {}) => {
  w = mount(GroupInviteSheet, { props: { sheet, ...props }, global: { plugins: [i18n] }, attachTo: document.body })
  return w
}
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
afterEach(() => w?.unmount())

describe('GroupInviteSheet 탭', () => {
  it('탭은 [그림][QR][링크] 순서이고 기본은 QR', () => {
    mountSheet()
    const tabs = [...document.body.querySelectorAll('[role="tab"]')].map((b) => b.textContent)
    expect(tabs).toEqual(['그림', 'QR', '링크'])
    expect(q('group-invite-tab-qr').getAttribute('aria-selected')).toBe('true')
    expect(q('group-invite-qr')).not.toBeNull()
    expect(q('picture-code-show')).toBeNull()
  })

  it('탭을 누르면 tab 이벤트, 좌우 화살표로도 옮긴다', async () => {
    mountSheet()
    q('group-invite-tab-link').click()
    q('group-invite-tab-qr').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    q('group-invite-tab-picture').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(w.emitted('tab')).toEqual([['link'], ['link'], ['link']])
  })

  it('그림 탭: 그림 4개·이름 줄을 보여 주고 QR과 복사 버튼은 숨긴다. 새 코드/들이기는 이벤트로 올라간다', async () => {
    mountSheet({ tab: 'picture', codeState: { code: [0, 1, 2, 3], expiresAt: Date.now() + 60000, request: { sessionId: 's', from: { deviceType: 'mobile', browser: 'Safari' } }, requestCount: 1 } })
    expect(q('picture-code-names').textContent).toBe('바나나 · 피자 · 로켓 · 우산')
    expect(q('group-invite-qr')).toBeNull()
    expect(q('group-invite-copy')).toBeNull()
    q('picture-code-renew').click()
    q('picture-code-reject').click()
    expect(w.emitted('code-renew')).toHaveLength(1)
    expect(w.emitted('code-decide')).toEqual([[false]])
  })

  it('링크 탭: 링크와 복사 버튼', () => {
    mountSheet({ tab: 'link' })
    expect(q('group-invite-link').textContent).toBe('https://x/#a')
    expect(q('group-invite-copy')).not.toBeNull()
    expect(q('group-invite-qr')).toBeNull()
  })
})
