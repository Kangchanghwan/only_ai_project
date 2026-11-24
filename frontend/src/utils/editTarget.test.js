import { describe, it, expect } from 'vitest'
import { editorKindOf, isEditableName, editedName, baseNameOf } from './editTarget'

describe('editorKindOf', () => {
  it.each(['a.hwp', 'a.HWPX', 'b.Hwp'])('한글 %s', (n) => expect(editorKindOf(n)).toBe('hwp'))
  it.each(['a.docx', 'a.XLSX', 'a.pptx', 'a.doc', 'a.xls', 'a.ppt', 'a.PDF'])('오피스 %s', (n) => expect(editorKindOf(n)).toBe('office'))
  it.each(['a.png', 'a.txt', 'hwp', 'a.hwp.bak', '', null, undefined, 'a.docm'])('대상 아님 %s', (n) => {
    expect(editorKindOf(n)).toBeNull()
    expect(isEditableName(n)).toBe(false)
  })
})

describe('editedName', () => {
  it('(수정) 을 붙이고 확장자는 export ext 를 쓴다', () => {
    expect(editedName('보고서.hwp', [], 'hwp')).toBe('보고서 (수정).hwp')
    expect(editedName('a.doc', [], 'docx')).toBe('a (수정).docx')
    expect(editedName('a.PPT', [], 'pptx')).toBe('a (수정).pptx')
  })
  it('이미 있으면 (수정 2), (수정 3)', () => {
    expect(editedName('a.docx', ['a (수정).docx'], 'docx')).toBe('a (수정 2).docx')
    expect(editedName('a.docx', ['a (수정).docx', 'a (수정 2).docx'], 'docx')).toBe('a (수정 3).docx')
  })
  it('대소문자 무시 비교, 다른 확장자는 충돌 아님', () => {
    expect(editedName('a.docx', ['A (수정).DOCX'], 'docx')).toBe('a (수정 2).docx')
    expect(editedName('a.doc', ['a (수정).doc'], 'docx')).toBe('a (수정).docx')
  })
  it('이미 수정본이면 꼬리를 떼고 센다', () => {
    expect(editedName('a (수정).hwp', ['a (수정).hwp'], 'hwp')).toBe('a (수정 2).hwp')
  })
  it('baseNameOf', () => { expect(baseNameOf('x.y.docx')).toBe('x.y'); expect(baseNameOf('noext')).toBe('noext') })
})
