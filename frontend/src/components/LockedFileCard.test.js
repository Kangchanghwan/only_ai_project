import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useI18n: () => ({ t: (key, p) => (p ? `${key}:${JSON.stringify(p)}` : key) })
}))

const openLockedFile = vi.fn()
vi.mock('../services/lockedDownloader', () => ({ openLockedFile: (...a) => openLockedFile(...a) }))

import LockedFileCard from './LockedFileCard.vue'
import LockChip from './LockChip.vue'
import { useLockState } from '../composables/useLockState'

const file = { name: 'abc123', locked: true, size: 2048, created: new Date().toISOString(), roomId: 'room-1' }

describe('LockedFileCard', () => {
  beforeEach(() => {
    openLockedFile.mockReset()
    useLockState().resetLockState()
  })

  it('원래 이름 대신 알아볼 수 없는 문자를 보여 준다', () => {
    const w = mount(LockedFileCard, { props: { file } })
    const name = w.find('[data-testid="locked-name"]').text()
    expect(name).not.toBe('abc123')
    expect(name).toMatch(/^[0-9a-f]{16}…$/)
  })

  it('틀리면 남은 시도 횟수를 보여 준다', async () => {
    openLockedFile.mockRejectedValue(Object.assign(new Error('x'), { code: 'WRONG_PASSWORD', remaining: 4 }))
    const w = mount(LockedFileCard, { props: { file } })
    await w.find('[data-testid="locked-password"]').setValue('1235')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(openLockedFile.mock.calls[0][0]).toMatchObject({ roomId: 'room-1', id: 'abc123', password: '1235' })
    expect(w.find('[data-testid="locked-message"]').text()).toContain('lock.wrongPassword')
    expect(w.find('[data-testid="locked-message"]').text()).toContain('4')
  })

  it('맞으면 이 기기에서만 풀렸다고 표시하고 원래 이름을 보여 준다', async () => {
    openLockedFile.mockImplementation(async ({ lockState, onName, onProgress }) => {
      lockState.rememberName('room-1', 'abc123', '계획서.pdf')
      onName('계획서.pdf')
      onProgress(100)
      return { name: '계획서.pdf' }
    })
    const w = mount(LockedFileCard, { props: { file } })
    await w.find('[data-testid="locked-password"]').setValue('0912')
    await w.find('form').trigger('submit')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 700))
    expect(w.text()).toContain('lock.unlockedHere')
    expect(w.find('[data-testid="locked-name"]').text()).toBe('계획서.pdf')
  })

  it('시도 초과면 입력을 막는다', async () => {
    openLockedFile.mockRejectedValue(Object.assign(new Error('x'), { code: 'LOCKED_OUT', remaining: 0 }))
    const w = mount(LockedFileCard, { props: { file } })
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-testid="locked-open"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="locked-message"]').text()).toBe('lock.lockedOut')
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
