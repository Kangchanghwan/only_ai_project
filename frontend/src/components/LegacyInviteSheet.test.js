import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LegacyInviteSheet from './LegacyInviteSheet.vue'
import i18n from '../i18n/index.js'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (v) => `data:${v}`) } }))
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })
const opts = { global: { plugins: [i18n] }, attachTo: document.body }
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

describe('LegacyInviteSheet', () => {
  it('sheet가 없으면 그리지 않는다', () => {
    const w = mount(LegacyInviteSheet, { ...opts, props: { sheet: null } })
    expect(q('legacy-invite-sheet')).toBeNull()
    w.unmount()
  })
  it('안내 제목·본문과 "새 방 만들기" 버튼, 누르면 create 이벤트', async () => {
    const w = mount(LegacyInviteSheet, { ...opts, props: { sheet: { roomId: 'prv-' + 'a'.repeat(24) } } })
    expect(document.body.querySelector('#legacy-invite-title').textContent).toBe('예전 방식으로 만든 방이라 초대할 수 없어요')
    expect(q('legacy-invite-sheet').textContent).toContain('새 방을 만들어 이 기기와 다른 기기를 함께 넣어 주세요')
    expect(q('legacy-invite-create').textContent.trim()).toBe('새 방 만들기')
    q('legacy-invite-create').click()
    q('legacy-invite-close').click()
    expect(w.emitted('create')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  describe('내 휴대폰에서 이 방 열기 블록', () => {
    const sheet = { roomId: 'prv-' + 'a'.repeat(24) }
    const mk = (props) => mount(LegacyInviteSheet, { ...opts, props: { sheet, mineQrUrl: 'https://x/#/qc?r=T', ...props } })
    it('상대가 오프라인이면 보이고 제목·QR 주소를 담는다', async () => {
      const w = mk({ status: 'offline' })
      await new Promise((r) => setTimeout(r, 10))
      expect(q('legacy-invite-mine').textContent).toContain('내 휴대폰에서 이 방 열기')
      expect(q('wake-qr-img').getAttribute('data-qr-value')).toBe('https://x/#/qc?r=T')
      expect(w.emitted('mine-shown')).toHaveLength(1)
      w.unmount()
    })
    it('온라인이면 숨긴다', () => {
      const w = mk({ status: 'online' })
      expect(q('legacy-invite-mine')).toBeNull()
      w.unmount()
    })
    it('연결 중은 3초 넘게 이어질 때만 보인다', async () => {
      vi.useFakeTimers()
      const w = mk({ status: 'connecting' })
      expect(q('legacy-invite-mine')).toBeNull()
      await vi.advanceTimersByTimeAsync(3100)
      expect(q('legacy-invite-mine')).not.toBeNull()
      w.unmount()
    })
    it('보이는 동안 상대가 온라인이 되면 arrived를 낸다. 처음부터 온라인이면 내지 않는다', async () => {
      const w = mk({ status: 'offline' })
      await w.setProps({ status: 'online' })
      expect(w.emitted('arrived')).toHaveLength(1)
      w.unmount()
      const w2 = mk({ status: 'online' })
      expect(w2.emitted('arrived')).toBeUndefined()
      w2.unmount()
    })
  })
})
