/**
 * "수정" 대상 판별과 수정본 이름 짓기.
 * 한글(hwp, hwpx)은 한글 편집기, 오피스(docx, xlsx, pptx, doc, xls, ppt, pdf)는 오피스 편집기로 간다. 대소문자는 무시한다.
 */
const HWP = new Set(['hwp', 'hwpx'])
const OFFICE = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'pdf'])

export function extOf(name) {
  const m = /\.([^./\\]+)$/.exec(String(name || ''))
  return m ? m[1].toLowerCase() : ''
}

/** 파일 이름 → 'hwp' | 'office' | null */
export function editorKindOf(name) {
  const ext = extOf(name)
  if (HWP.has(ext)) return 'hwp'
  if (OFFICE.has(ext)) return 'office'
  return null
}

export function isEditableName(name) {
  return editorKindOf(name) !== null
}

/** 확장자를 뺀 이름 (확장자가 없으면 이름 그대로) */
export function baseNameOf(name) {
  const s = String(name || '')
  return extOf(s) ? s.replace(/\.[^./\\]+$/, '') : s
}

/** 서버(backend r2Service.sanitizeFileName)와 같은 규칙: 공백 → _, 영문·숫자·한글·. _ - 만 남김 */
export function storedNameOf(name) {
  const s = String(name || '')
  const dot = s.lastIndexOf('.')
  const base = dot > 0 ? s.slice(0, dot) : dot === 0 ? '' : s
  const ext = dot >= 0 ? s.slice(dot) : ''
  const clean = base.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9\p{Script=Hangul}._-]/gu, '') || 'unnamed_file'
  return clean.slice(0, 255 - ext.length) + ext
}

/**
 * 덮어쓸 이름: 원래 이름에 편집기가 돌려준 확장자(doc→docx 처럼 바뀔 수 있음)를 붙이고 서버 저장 규칙으로 정규화한다.
 * 확장자가 같으면 원래 파일과 같은 저장 이름이 되어 그 자리에 덮어쓴다.
 */
export function savedName(name, ext) {
  const useExt = String(ext || extOf(name) || '').replace(/^\./, '').toLowerCase()
  return storedNameOf(`${baseNameOf(name)}${useExt ? '.' + useExt : ''}`)
}
