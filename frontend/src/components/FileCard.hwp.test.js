import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useI18n: () => ({ t: (key) => key })
}))

import FileCard from './FileCard.vue'

const stubs = { FileQRCodeModal: { template: '<div />' } }
let wrapper
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = '' })

async function openSheet(name) {
  const file = { name, roomId: 'room-shared', url: 'https://example.com/x', size: 10, created: '2026-01-01T00:00:00.000Z' }
  wrapper = mount(FileCard, { props: { file }, global: { stubs } })
  await wrapper.find('.more-btn').trigger('click')
  return { file, sheet: new DOMWrapper(document.body.querySelector('.file-actions-sheet')) }
}

describe('FileCard 한글 편집 메뉴', () => {
  it.each(['a.hwp', 'a.hwpx', 'A.HWPX', '보고서.Hwp'])('%s: 더보기 시트에 항목이 있다', async (name) => {
    const { sheet } = await openSheet(name)
    expect(sheet.find('[data-testid="sheet-preview-hwp"]').exists()).toBe(true)
  })

  it.each(['a.pdf', 'a.hwp.zip', 'hwp', 'a.hwpx.txt', 'photo.png'])('%s: 항목이 없다', async (name) => {
    const { sheet } = await openSheet(name)
    expect(sheet.find('[data-testid="sheet-preview-hwp"]').exists()).toBe(false)
  })

  it('누르면 preview-hwp를 내보내고 시트를 닫는다', async () => {
    const { file, sheet } = await openSheet('a.hwpx')
    await sheet.find('[data-testid="sheet-preview-hwp"]').trigger('click')
    expect(wrapper.emitted('preview-hwp')[0]).toEqual([file])
    expect(document.body.querySelector('.file-actions-sheet')).toBeNull()
  })

  it('한글 파일 이름을 누르면 미리보기 이벤트, 다른 파일은 아니다', async () => {
    const mk = (name) => mount(FileCard, { props: { file: { name, roomId: 'r', url: 'u', size: 1, created: '2026-01-01T00:00:00.000Z' } }, global: { stubs } })
    wrapper = mk('a.hwpx')
    await wrapper.find('[data-testid="file-name"]').trigger('click')
    expect(wrapper.emitted('preview-hwp')).toHaveLength(1)
    expect(wrapper.emitted('toggle-selection')).toBeFalsy()
    wrapper.unmount()
    wrapper = mk('a.pdf')
    await wrapper.find('[data-testid="file-name"]').trigger('click')
    expect(wrapper.emitted('preview-hwp')).toBeFalsy()
  })
})
