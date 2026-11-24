import { describe, it, expect } from 'vitest'
import { storedNameOf, editorKindOf, isEditableName, editedName, baseNameOf } from './editTarget'

describe('editorKindOf', () => {
  it.each(['a.hwp', 'a.HWPX', 'b.Hwp'])('한글 %s', (n) => expect(editorKindOf(n)).toBe('hwp'))
  it.each(['a.docx', 'a.XLSX', 'a.pptx', 'a.doc', 'a.xls', 'a.ppt', 'a.PDF'])('오피스 %s', (n) => expect(editorKindOf(n)).toBe('office'))
  it.each(['a.png', 'a.txt', 'hwp', 'a.hwp.bak', '', null, undefined, 'a.docm'])('대상 아님 %s', (n) => {
    expect(editorKindOf(n)).toBeNull()
    expect(isEditableName(n)).toBe(false)
  })
})

describe('editedName', () => {
  it('_수정 을 붙이고 확장자는 export ext 를 쓴다', () => {
    expect(editedName('보고서.hwp', [], 'hwp')).toBe('보고서_수정.hwp')
    expect(editedName('a.doc', [], 'docx')).toBe('a_수정.docx')
    expect(editedName('a.PPT', [], 'pptx')).toBe('a_수정.pptx')
  })
  it('서버 정규화 모양으로 짓는다 (공백 → _, 괄호 제거)', () => {
    expect(editedName('분기 보고서 (최종).docx', [], 'docx')).toBe('분기_보고서_최종_수정.docx')
    expect(storedNameOf('cs-edit-test (수정).docx')).toBe('cs-edit-test_수정.docx')
  })
  it('이미 있으면 _수정2, _수정3 (정규화해서 비교)', () => {
    expect(editedName('a.docx', ['a_수정.docx'], 'docx')).toBe('a_수정2.docx')
    expect(editedName('a.docx', ['a_수정.docx', 'a_수정2.docx'], 'docx')).toBe('a_수정3.docx')
    expect(editedName('a b.docx', ['a_b_수정.docx'], 'docx')).toBe('a_b_수정2.docx')
  })
  it('대소문자 무시 비교, 다른 확장자는 충돌 아님', () => {
    expect(editedName('a.docx', ['A_수정.DOCX'], 'docx')).toBe('a_수정2.docx')
    expect(editedName('a.doc', ['a_수정.doc'], 'docx')).toBe('a_수정.docx')
  })
  it('이미 수정본이면 꼬리를 떼고 센다', () => {
    expect(editedName('a_수정.hwp', ['a_수정.hwp'], 'hwp')).toBe('a_수정2.hwp')
  })
  it('baseNameOf', () => { expect(baseNameOf('x.y.docx')).toBe('x.y'); expect(baseNameOf('noext')).toBe('noext') })
})
