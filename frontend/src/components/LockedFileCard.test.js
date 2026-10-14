import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useI18n: () => ({ t: (key, p) => (p ? `${key}:${JSON.stringify(p)}` : key) })
}))

const openLockedFile = vi.fn()
const createLockedShareLink = vi.fn()
vi.mock('../services/lockedDownloader', () => ({
  openLockedFile: (...a) => openLockedFile(...a),
  createLockedShareLink: (...a) => createLockedShareLink(...a)
}))

import LockedFileCard from './LockedFileCard.vue'
import LockChip from './LockChip.vue'
import { useLockState } from '../composables/useLockState'

const file = { name: 'abc123', locked: true, size: 2048, created: new Date().toISOString(), roomId: 'room-1' }

const mountCard = (props = { file }) => mount(LockedFileCard, { props, global: { stubs: { teleport: true, transition: false } } })

describe('LockedFileCard', () => {
  beforeEach(() => {
    openLockedFile.mockReset()
    useLockState().resetLockState()
  })

  it('원래 이름 대신 알아볼 수 없는 문자를 보여 준다', () => {
    const w = mountCard()
    const name = w.find('[data-testid="locked-name"]').text()
    expect(name).not.toBe('abc123')
    expect(name).toMatch(/^[0-9a-f]{16}…$/)
  })

  it('일반 카드와 같은 틀: 카드 안에 비밀번호 입력란이 없고, 비활성 체크박스·주 버튼·더보기만 있다', () => {
    const w = mountCard()
    expect(w.find('[data-testid="locked-password"]').exists()).toBe(false)
    expect(w.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="locked-open"]').exists()).toBe(true)
    expect(w.find('[data-testid="locked-more"]').exists()).toBe(true)
    expect(w.classes()).toContain('file-row')
  })

  it('풀기를 누르면 비밀번호 시트가 열리고, 틀리면 시트 안에 남은 시도를 보여 준다', async () => {
    openLockedFile.mockRejectedValue(Object.assign(new Error('x'), { code: 'WRONG_PASSWORD', remaining: 4 }))
    const w = mountCard()
    await w.find('[data-testid="locked-open"]').trigger('click')
    expect(w.find('[data-testid="locked-password-sheet"]').exists()).toBe(true)
    await w.find('[data-testid="locked-password"]').setValue('1235')
    await w.find('[data-testid="locked-password-sheet"] form').trigger('submit')
    await flushPromises()
    expect(openLockedFile.mock.calls[0][0]).toMatchObject({ roomId: 'room-1', id: 'abc123', password: '1235' })
    expect(w.find('[data-testid="locked-password-sheet"]').exists()).toBe(true)
    expect(w.find('[data-testid="locked-message"]').text()).toContain('lock.wrongPassword')
    expect(w.find('[data-testid="locked-message"]').text()).toContain('4')
  })

  it('맞으면 시트가 닫히고 이 기기에서만 풀렸다고 표시하며 원래 이름을 보여 준다', async () => {
    openLockedFile.mockImplementation(async ({ lockState, onName, onProgress }) => {
      lockState.rememberName('room-1', 'abc123', '계획서.pdf')
      onName('계획서.pdf')
      onProgress(100)
      return { name: '계획서.pdf' }
    })
    const w = mountCard()
    await w.find('[data-testid="locked-open"]').trigger('click')
    await w.find('[data-testid="locked-password"]').setValue('0912')
    await w.find('[data-testid="locked-password-sheet"] form').trigger('submit')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 700))
    expect(w.find('[data-testid="locked-password-sheet"]').exists()).toBe(false)
    expect(w.find('[data-testid="locked-icon"]').attributes('data-state')).toBe('open')
    expect(w.find('[data-testid="locked-icon"]').attributes('title')).toBe('lock.unlockedHere')
    // 메타 줄은 일반 카드와 같은 내용(용량 · 시간)만 담는다
    expect(w.find('[data-testid="locked-meta"]').text()).not.toContain('lock.')
    expect(w.find('[data-testid="locked-name"]').text()).toBe('계획서.pdf')
  })

  it('이미 아는 파일(보낸 기기)은 시트 없이 바로 받는다', async () => {
    useLockState().rememberName('room-1', 'abc123', '내파일.pdf')
    openLockedFile.mockResolvedValue({ name: '내파일.pdf' })
    const w = mountCard()
    await w.find('[data-testid="locked-open"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="locked-password-sheet"]').exists()).toBe(false)
    expect(openLockedFile.mock.calls[0][0].password).toBeUndefined()
  })

  it('시도 초과면 시트의 입력과 풀기를 막는다', async () => {
    openLockedFile.mockRejectedValue(Object.assign(new Error('x'), { code: 'LOCKED_OUT', remaining: 0 }))
    const w = mountCard()
    await w.find('[data-testid="locked-open"]').trigger('click')
    await w.find('[data-testid="locked-password"]').setValue('1111')
    await w.find('[data-testid="locked-password-sheet"] form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-testid="locked-message"]').text()).toBe('lock.lockedOut')
    expect(w.find('[data-testid="locked-submit"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="locked-password"]').attributes('disabled')).toBeDefined()
  })

  it('더보기: 권한이 없으면 안내만, 내가 올린 파일이면 삭제', async () => {
    const w = mountCard()
    await w.find('[data-testid="locked-more"]').trigger('click')
    expect(w.find('[data-testid="locked-delete"]').exists()).toBe(false)
    expect(w.find('[data-testid="locked-delete-note"]').exists()).toBe(true)

    useLockState().rememberDeleteKey('room-1', 'abc123', 'dk')
    const w2 = mountCard()
    await w2.find('[data-testid="locked-more"]').trigger('click')
    await w2.find('[data-testid="locked-delete"]').trigger('click')
    expect(w2.emitted('delete-file')).toHaveLength(1)
  })
})

describe('LockedFileCard QR 공유', () => {
  beforeEach(() => {
    openLockedFile.mockReset()
    createLockedShareLink.mockReset()
    useLockState().resetLockState()
  })

  it('비밀번호를 모르는 기기에는 QR 메뉴가 없다', async () => {
    const w = mountCard()
    await w.find('[data-testid="locked-more"]').trigger('click')
    expect(w.find('[data-testid="locked-qr"]').exists()).toBe(false)
  })

  it('푼 뒤에는 QR 메뉴가 생기고, 누르면 키가 든 링크로 QR 창을 연다', async () => {
    openLockedFile.mockImplementation(async ({ onName }) => { onName('계획서.pdf'); return { name: '계획서.pdf' } })
    createLockedShareLink.mockResolvedValue({ url: 'https://www.clipboardapp.org/#/lk?r=room-1', name: '계획서.pdf', size: 2048 })
    const w = mountCard()
    await w.find('[data-testid="locked-open"]').trigger('click')
    await w.find('[data-testid="locked-password"]').setValue('0912')
    await w.find('[data-testid="locked-password-sheet"] form').trigger('submit')
    await flushPromises()
    await w.find('[data-testid="locked-more"]').trigger('click')
    await w.find('[data-testid="locked-qr"]').trigger('click')
    await flushPromises()
    expect(createLockedShareLink.mock.calls[0][0]).toMatchObject({ roomId: 'room-1', id: 'abc123' })
    expect(w.find('[data-testid="locked-actions-sheet"]').exists()).toBe(false)
    expect(w.text()).toContain('lock.qrScan')
    expect(w.text()).toContain('lock.qrHint')
    expect(w.find('input[readonly]').element.value).toBe('https://www.clipboardapp.org/#/lk?r=room-1')
  })
})

describe('LockChip', () => {
  beforeEach(() => useLockState().resetLockState())

  it('4자 미만은 거절하고, 켜면 범위별로 잠금이 설정된다', async () => {
    const w = mount(LockChip, { props: { scope: 'ip' } })
    await w.find('[data-testid="lock-start"]').trigger('click')
    await w.find('[data-testid="lock-password"]').setValue('12')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('lock.passwordTooShort')
    expect(useLockState().isLocked('ip')).toBe(false)
  })
})
