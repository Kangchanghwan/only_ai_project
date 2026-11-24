import { describe, it, expect } from 'vitest'
import { storedNameOf, editorKindOf, isEditableName, savedName, baseNameOf } from './editTarget'

describe('editorKindOf', () => {
  it.each(['a.hwp', 'a.HWPX', 'b.Hwp'])('한글 %s', (n) => expect(editorKindOf(n)).toBe('hwp'))
  it.each(['a.docx', 'a.XLSX', 'a.pptx', 'a.doc', 'a.xls', 'a.ppt', 'a.PDF'])('오피스 %s', (n) => expect(editorKindOf(n)).toBe('office'))
  it.each(['a.png', 'a.txt', 'hwp', 'a.hwp.bak', '', null, undefined, 'a.docm'])('대상 아님 %s', (n) => {
    expect(editorKindOf(n)).toBeNull()
    expect(isEditableName(n)).toBe(false)
  })
})

describe('savedName', () => {
  it('원래 이름 그대로, 확장자는 export ext', () => {
    expect(savedName('보고서.hwp', 'hwp')).toBe('보고서.hwp')
    expect(savedName('a.doc', 'docx')).toBe('a.docx')
    expect(savedName('a.PPT', 'pptx')).toBe('a.pptx')
  })
  it('서버 정규화 모양 (공백 → _, 괄호 제거)', () => {
    expect(savedName('분기 보고서 (최종).docx', 'docx')).toBe('분기_보고서_최종.docx')
    expect(storedNameOf('cs-edit-test (수정).docx')).toBe('cs-edit-test_수정.docx')
  })
  it('baseNameOf', () => { expect(baseNameOf('x.y.docx')).toBe('x.y'); expect(baseNameOf('noext')).toBe('noext') })
})
