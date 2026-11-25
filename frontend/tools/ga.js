// 도구 페이지 전용 GA4 로더 (외부 모듈 파일: 인라인 스크립트 없이 CSP를 엄격하게 유지).
// index.html과 같은 규칙: www.clipboardapp.org 에서만 로드하고 ?internal=1 로 끈 브라우저는 제외한다.
// 메인 번들(src/utils/analytics.js)은 가져오지 않는다. 메인 청크 구성을 바꾸지 않기 위해서다.
const GA_ID = 'G-GT656L9026'

window.dataLayer = window.dataLayer || []
if (typeof window.gtag !== 'function') {
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
}

let internal = false
try {
  const flag = location.search.match(/[?&]internal=([01])/)
  if (flag) {
    if (flag[1] === '1') localStorage.setItem('cs_internal', '1')
    else localStorage.removeItem('cs_internal')
  }
  internal = localStorage.getItem('cs_internal') === '1'
} catch {
  /* 저장소 접근 불가 */
}
if (internal) window['ga-disable-' + GA_ID] = true

if (location.hostname === 'www.clipboardapp.org' && !internal) {
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID
  document.head.appendChild(s)
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, { page_location: location.href, content_group: 'tools' }) // page_view 만 (자동). content_group 으로 도구 페이지를 묶어 본다
}

export function trackEvent(name, params = {}) {
  try {
    window.gtag('event', name, params)
  } catch {
    /* 분석 실패가 앱을 막으면 안 된다 */
  }
}
