/**
 * Office 미리보기용 글꼴 별칭. 문서가 이름으로 지정한 글꼴(맑은 고딕, 굴림 …)이 이 기기에 없으면 브라우저 기본(명조 계열)으로 떨어져
 * 한글이 이상하게 보인다. 같은 이름의 @font-face를 local()로만 정의해 기기에 있는 비슷한 글꼴로 이어 준다(네트워크 요청 0).
 * 이 이름들은 앱 UI 글꼴 목록에 없으므로 앱 화면에는 영향이 없다. 첫 미리보기를 열 때 한 번만 넣는다.
 */
const SANS_NAMES = ['Malgun Gothic', '맑은 고딕', '굴림', 'Gulim', '굴림체', '돋움', 'Dotum', '돋움체', '새굴림', '等线', 'DengXian', 'Calibri']
const SERIF_NAMES = ['바탕', 'Batang', '바탕체', '궁서', 'Gungsuh']

const SANS = ['Apple SD Gothic Neo', 'AppleSDGothicNeo-Regular', 'Malgun Gothic', 'Noto Sans KR', 'NanumGothic']
const SANS_BOLD = ['Apple SD Gothic Neo Bold', 'AppleSDGothicNeo-Bold', 'Malgun Gothic Bold', 'Noto Sans KR Bold', 'NanumGothic Bold', 'NanumGothicBold']
const SERIF = ['AppleMyungjo', 'Batang', 'Noto Serif KR', 'NanumMyeongjo']
const SERIF_BOLD = ['AppleMyungjo', 'Batang', 'Noto Serif KR Bold', 'NanumMyeongjo Bold', 'NanumMyeongjoBold']

const loc = (list) => list.map((n) => `local("${n}")`).join(',')

export function officeFontCss() {
  const out = []
  const face = (names, regular, bold) => {
    for (const n of names) {
      out.push(`@font-face{font-family:"${n}";font-weight:400;src:${loc(regular)}}`)
      out.push(`@font-face{font-family:"${n}";font-weight:700;src:${loc(bold)}}`)
    }
  }
  face(SANS_NAMES, SANS, SANS_BOLD)
  face(SERIF_NAMES, SERIF, SERIF_BOLD)
  return out.join('\n')
}

export function ensureOfficeFonts(doc = document) {
  if (doc.getElementById('cb-office-fonts')) return
  const st = doc.createElement('style')
  st.id = 'cb-office-fonts'
  st.textContent = officeFontCss()
  doc.head.appendChild(st)
}

/** 렌더러 컨테이너의 기본 글꼴: 모르는 글꼴은 명조가 아니라 고딕으로 */
export const BASE_FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif'

const GENERIC = /(^|[\s,])(serif|sans-serif|monospace|cursive|fantasy|system-ui)\s*$/i
const SERIF_HINT = /바탕|명조|batang|myungjo|gungsuh|궁서|serif|times|georgia|mincho|song/i

/** 글꼴 목록 끝에 일반 글꼴이 없으면 붙인다 (명조 계열 이름이면 serif, 아니면 sans-serif) */
export function withFallback(value) {
  const v = String(value || '').trim()
  if (!v || GENERIC.test(v)) return v
  return SERIF_HINT.test(v) ? `${v}, "AppleMyungjo","Noto Serif KR",serif` : `${v}, "Apple SD Gothic Neo","Noto Sans KR",sans-serif`
}

/** CSS 텍스트 안의 font-family 선언에 withFallback 적용 (docx-preview가 만든 <style>용) */
export function patchStyleText(css) {
  return String(css).replace(/font-family\s*:\s*([^;}]+)/gi, (m, v) => `font-family:${withFallback(v.replace(/!important\s*$/i, ''))}${/!important/i.test(v) ? ' !important' : ''}`)
}

/** root 아래 요소의 인라인 font-family에 적용 */
export function patchInlineFonts(root) {
  if (!root?.querySelectorAll) return
  const els = root.nodeType === 1 && root.style?.fontFamily ? [root, ...root.querySelectorAll('[style*="font-family"]')] : root.querySelectorAll('[style*="font-family"]')
  for (const el of els) {
    const cur = el.style.fontFamily
    const next = withFallback(cur)
    if (next && next !== cur) el.style.fontFamily = next
  }
}
