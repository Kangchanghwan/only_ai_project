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

/**
 * 올릴 이름: `원래이름 (수정).확장자`, 이미 있으면 `(수정 2)`, `(수정 3)` …
 * 확장자는 편집기가 돌려준 ext 를 쓴다(doc→docx 처럼 바뀔 수 있음). 이미 "(수정 N)" 이 붙은 이름이면 그 꼬리를 떼고 센다.
 * 이름 비교는 대소문자를 구분하지 않는다.
 */
export function editedName(name, existingNames, ext) {
  const useExt = String(ext || extOf(name) || '').replace(/^\./, '').toLowerCase()
  const base = baseNameOf(name).replace(/ \(수정(?: \d+)?\)$/, '')
  const taken = new Set((existingNames || []).map((n) => String(n).toLowerCase()))
  const make = (n) => `${base} (수정${n > 1 ? ' ' + n : ''})${useExt ? '.' + useExt : ''}`
  let n = 1
  while (taken.has(make(n).toLowerCase())) n += 1
  return make(n)
}
