import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useI18n: () => ({ t: (key, p) => (p ? `${key}:${JSON.stringify(p)}` : key) })
}))
const openLockedLink = vi.fn()
vi.mock('../services/lockedDownloader', () => ({ openLockedLink: (...a) => openLockedLink(...a) }))

import LockedLinkPage from './LockedLinkPage.vue'

const link = { roomId: 'room-1', id: '0123456789abcdef0123456789abcdef', verifier: 'v'.repeat(43), key: 'k'.repeat(43) }

describe('LockedLinkPage', () => {
  beforeEach(() => { openLockedLink.mockReset() })

  it('먼저 이름·크기를 보여 주고, 받기를 누르면 이 기기에서 풀어 저장한다', async () => {
    openLockedLink.mockImplementation(async ({ download, onProgress }) => {
      if (download !== false) onProgress?.(100)
      return { name: '보고서.pdf', size: 2048 }
    })
    const w = mount(LockedLinkPage, { props: { link } })
    await flushPromises()
    expect(openLockedLink.mock.calls[0][0]).toMatchObject({ ...link, download: false })
    expect(w.find('[data-testid="locked-link-name"]').text()).toBe('보고서.pdf')
    await w.find('[data-testid="locked-link-receive"]').trigger('click')
    await flushPromises()
    expect(openLockedLink.mock.calls[1][0].download).toBeUndefined()
    expect(w.find('[data-testid="locked-link-meta"]').text()).toContain('lock.link.done')
    expect(w.find('[data-testid="locked-link-receive"]').text()).toContain('lock.link.again')
  })

  it('형식이 깨진 링크는 서버에 묻지 않고 안내한다', async () => {
    const w = mount(LockedLinkPage, { props: { link: null } })
    await flushPromises()
    expect(openLockedLink).not.toHaveBeenCalled()
    expect(w.find('[data-testid="locked-link-error"]').text()).toBe('lock.link.invalid')
    expect(w.find('[data-testid="locked-link-receive"]').exists()).toBe(false)
  })

  it('파일이 없으면 만료 안내', async () => {
    openLockedLink.mockRejectedValue(Object.assign(new Error('x'), { status: 404 }))
    const w = mount(LockedLinkPage, { props: { link } })
    await flushPromises()
    expect(w.find('[data-testid="locked-link-error"]').text()).toBe('lock.link.expired')
  })
})
