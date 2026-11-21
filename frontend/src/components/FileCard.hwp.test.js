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
    expect(sheet.find('[data-testid="sheet-preview-file"]').exists()).toBe(true)
  })

  it.each(['a.docx', 'a.XLSX', '보고서.pptx'])('%s: Office도 더보기 시트에 미리보기 항목이 있다', async (name) => {
    const { sheet } = await openSheet(name)
    expect(sheet.find('[data-testid="sheet-preview-file"]').exists()).toBe(true)
  })

  it.each(['a.pdf', 'a.hwp.zip', 'hwp', 'a.hwpx.txt', 'photo.png', 'a.doc', 'a.xls', 'a.ppt', 'a.docx.zip', 'a.docm'])('%s: 항목이 없다', async (name) => {
    const { sheet } = await openSheet(name)
    expect(sheet.find('[data-testid="sheet-preview-file"]').exists()).toBe(false)
  })

  it('누르면 preview-file를 내보내고 시트를 닫는다', async () => {
    const { file, sheet } = await openSheet('a.hwpx')
    await sheet.find('[data-testid="sheet-preview-file"]').trigger('click')
    expect(wrapper.emitted('preview-file')[0]).toEqual([file])
    expect(document.body.querySelector('.file-actions-sheet')).toBeNull()
  })

  it.each(['a.hwp', 'a.hwpx', 'a.docx', 'a.xlsx', 'a.pptx', 'A.PPTX'])('⋯ 메뉴의 미리보기 항목이 %s에서 preview-file을 내보낸다', async (name) => {
    const { file, sheet } = await openSheet(name)
    await sheet.find('[data-testid="sheet-preview-file"]').trigger('click')
    expect(wrapper.emitted('preview-file')).toHaveLength(1)
    expect(wrapper.emitted('preview-file')[0]).toEqual([file])
  })

  it.each(['a.hwp', 'a.hwpx', 'a.docx', 'a.xlsx', 'a.pptx', 'a.pdf'])('%s: 이름을 누르면 선택이 토글되고 미리보기는 열리지 않는다 (카드 클릭은 원래대로)', async (name) => {
    wrapper = mount(FileCard, { props: { file: { name, roomId: 'r', url: 'u', size: 1, created: '2026-01-01T00:00:00.000Z' } }, global: { stubs } })
    await wrapper.find('[data-testid="file-name"]').trigger('click')
    expect(wrapper.emitted('toggle-selection')).toHaveLength(1)
    expect(wrapper.emitted('preview-file')).toBeFalsy()
    expect(wrapper.find('[data-testid="file-name"]').classes()).not.toContain('cursor-pointer')
  })
})

describe('FileCard 한글 문서 썸네일', () => {
  const mk = (name, extra = {}) => mount(FileCard, { props: { file: { name, roomId: 'room-x', url: 'https://example.com/orig.hwpx', size: 10, created: '2026-01-01T00:00:00.000Z', ...extra } }, global: { stubs } })
  it('썸네일 URL로 보여 준다 (원본 URL이 아니다)', () => {
    wrapper = mk('a.hwpx')
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain('thumbs/room-x/a.hwpx.jpg')
    expect(img.attributes('src')).not.toContain('orig.hwpx')
  })
  it('썸네일을 못 받으면 원본으로 돌아가지 않고 파일 아이콘', async () => {
    wrapper = mk('a.hwp')
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
  })
  it('Office 파일은 썸네일을 만들지 않는다', () => {
    wrapper = mk('a.docx')
    expect(wrapper.find('img').exists()).toBe(false)
  })
  it('다른 문서(pdf)는 이미지 칸을 쓰지 않는다', () => {
    wrapper = mk('a.pdf')
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
