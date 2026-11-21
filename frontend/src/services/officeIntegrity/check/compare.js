/**
 * Integrity check. Editor-caused differences are keys where the baseline B differs from the original O.
 * After restore, such a key "remains" when the user left it alone (S == B) and the result R still differs from O.
 */
import { signature } from './signature.js'

const LABELS = [
  [/^core\./, '문서 속성'],
  [/\.theme$/, '테마 글꼴·색'],
  [/^bin\.multiset$/, '그림·포함 글꼴 파일'],
  [/embeddedFonts$/, '포함된 글꼴'],
  [/^custom|^customXml/, '사용자 정의 속성'],
  [/^w\.themeFontLang$/, '테마 글꼴 언어'],
  [/^w\.settings|^w\.protection/, '문서 설정'],
  [/^w\.docDefaults/, '기본 글자·문단 서식'],
  [/^w\.styles|^w\.tblStyle/, '스타일'],
  [/^w\.pBdr\[/, '문단 테두리'],
  [/^w\.(tblBorders|tcBorders)\[/, '표 테두리'],
  [/^w\.p\d+$|^w\.body/, '문단 내용'],
  [/^w\.runFormats|^w\.paraFormats|^w\.pStyles/, '글자·문단 서식'],
  [/^w\.tbl/, '표'],
  [/^w\.sdt/, '입력 칸(내용 컨트롤)'],
  [/^w\.sect\d+\.pgBorders$/, '쪽 테두리'],
  [/^w\.sect/, '구역·머리글·바닥글'],
  [/^w\.(comments|footnotes|endnotes)/, '메모·각주'],
  [/^w\.numbering/, '번호 매기기'],
  [/^w\./, '문서 내용'],
  [/^x\.defaultFont$/, '기본 글꼴'],
  [/^x\.definedNames$/, '이름 정의'],
  [/^x\[.*\]\.(notes|threaded)$/, '메모'],
  [/^x\[.*\]\.(cf|dv)$/, '조건부 서식·데이터 유효성'],
  [/^x\[.*\]\.page$/, '인쇄 설정'],
  [/^x\[.*\]\.links$/, '링크'],
  [/^x\[/, '셀'],
  [/^x\./, '통합 문서'],
  [/^p\.sections$/, '슬라이드 구역'],
  [/^p\.s\d+\.tbl\[.*\]\.lines$/, '표 선 모양'],
  [/^p\.s\d+\.tbl/, '표'],
  [/^p\.s\d+\.notes$/, '슬라이드 노트'],
  [/^p\./, '슬라이드'],
]

export function labelOf(key) {
  for (const [re, label] of LABELS) if (re.test(key)) return label
  return key
}

/** Where a key points, for display (sheet name or slide number), or ''. */
export function whereOf(key) {
  const x = key.match(/^x\[(.*)\]\./)
  if (x) return x[1] + ' 시트'
  const p = key.match(/^p\.s(\d+)\./)
  if (p) return p[1] + '번 슬라이드'
  return ''
}

export function diffKeys(a, b) {
  const out = []
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] ?? '') !== (b[k] ?? '')) out.push(k)
  return out
}

/** @returns {{ key: string, label: string, where: string }[]} */
export function remainingDiffs(sigO, sigB, sigS, sigR) {
  const out = []
  for (const k of diffKeys(sigO, sigB)) {
    if ((sigS[k] ?? '') !== (sigB[k] ?? '')) continue // the user changed it
    if ((sigR[k] ?? '') === (sigO[k] ?? '')) continue // restored
    out.push({ key: k, label: labelOf(k), where: whereOf(k) })
  }
  return out
}

export { signature }
