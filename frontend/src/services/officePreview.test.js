import { describe, it, expect } from 'vitest'
import { officeKindOf, isPreviewName } from '../utils/hwpName.js'
import { sizeCapFor, OFFICE_LIMITS } from './officePreview.js'

describe('Office 종류 판별과 크기 한도', () => {
  it('docx/xlsx/pptx만, 대소문자 무시', () => {
    expect(officeKindOf('a.docx')).toBe('docx')
    expect(officeKindOf('B.XLSX')).toBe('xlsx')
    expect(officeKindOf('c.PptX')).toBe('pptx')
    for (const n of ['a.doc', 'a.xls', 'a.ppt', 'a.docm', 'a.docx.zip', 'docx', '', null]) expect(officeKindOf(n)).toBeNull()
  })
  it('미리보기 대상 = 한글 + Office', () => {
    expect(isPreviewName('a.hwpx')).toBe(true)
    expect(isPreviewName('a.pptx')).toBe(true)
    expect(isPreviewName('a.pdf')).toBe(false)
  })
  it('한도: 데스크톱 50MB, 폰 20MB, 시간 25초', () => {
    expect(sizeCapFor(false)).toBe(50 * 1024 * 1024)
    expect(sizeCapFor(true)).toBe(20 * 1024 * 1024)
    expect(OFFICE_LIMITS.timeoutMs).toBe(25000)
  })
})
