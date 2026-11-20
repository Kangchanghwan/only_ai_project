/**
 * 읽기 전용 보기: rhwp-studio는 읽기 전용 모드를 따로 제공하지 않아(편집기 안의 'form' 모드는 양식 입력용),
 * studio iframe은 화면 밖에 숨기고 editor.getPageSvg(page)로 쪽마다 SVG를 받아 목록에 그린다.
 * SVG 안의 글꼴 이름은 이 문서에서 해석되므로, studio가 자기 폴더로 내려주는 오픈 글꼴을 별칭으로 선언해 둔다.
 * (글꼴 파일은 실제로 그 글자를 그릴 때에만 받아진다)
 */
const FONT_BASE = '/tools/hwp/studio/fonts/'
// [HWP 쪽 글꼴 이름들, 파일(보통), 파일(굵게)]
const FACES = [
  [['함초롬바탕', '바탕', '바탕체', '한컴바탕', '휴먼명조', 'HCR Batang', 'HY견명조', '신명조', '명조'], 'NotoSerifKR-Regular.woff2', 'NotoSerifKR-Bold.woff2'],
  [['함초롬돋움', '돋움', '돋움체', '한컴돋움', '맑은 고딕', '굴림', '굴림체', '고딕', '휴먼고딕', 'HCR Dotum', 'HY중고딕', '새굴림', '맑은고딕'], 'NotoSansKR-Regular.woff2', 'NotoSansKR-Bold.woff2'],
  [['나눔명조'], 'NanumMyeongjo-Regular.woff2', 'NanumMyeongjo-Bold.woff2'],
  [['나눔고딕'], 'NanumGothic-Regular.woff2', 'NanumGothic-Bold.woff2'],
]

export function viewerFontCss(base = FONT_BASE) {
  const out = []
  for (const [names, reg, bold] of FACES) {
    for (const n of names) {
      out.push(`@font-face{font-family:"${n}";font-weight:400;src:url(${base}${reg}) format("woff2");font-display:swap}`)
      out.push(`@font-face{font-family:"${n}";font-weight:700;src:url(${base}${bold}) format("woff2");font-display:swap}`)
    }
  }
  return out.join('\n')
}

export function ensureViewerFonts(doc = document) {
  if (doc.getElementById('cb-hwp-viewer-fonts')) return
  const st = doc.createElement('style')
  st.id = 'cb-hwp-viewer-fonts'
  st.textContent = viewerFontCss()
  doc.head.appendChild(st)
}

/**
 * 쪽을 목록에 그린다. 처음 몇 쪽을 바로 그리고, 나머지는 스크롤이 가까워지면 이어서 그린다.
 * @returns {{destroy:()=>void}}
 */
export function renderPages(container, studio, pageCount, { first = 4, batch = 4 } = {}) {
  ensureViewerFonts(container.ownerDocument)
  container.textContent = ''
  let next = 0
  let busy = false
  let dead = false
  const sentinel = container.ownerDocument.createElement('div')
  sentinel.className = 'cb-page-sentinel'
  container.appendChild(sentinel)

  async function more(n) {
    if (busy || dead || next >= pageCount) return
    busy = true
    try {
      for (let i = 0; i < n && next < pageCount && !dead; i++, next++) {
        const svg = await studio.getPageSvg(next)
        const holder = container.ownerDocument.createElement('div')
        holder.className = 'cb-page'
        holder.setAttribute('role', 'img')
        holder.setAttribute('aria-label', `${next + 1} / ${pageCount}`)
        holder.innerHTML = svg // 스튜디오(같은 출처, 우리가 빌드한 엔진)가 만든 SVG
        container.insertBefore(holder, sentinel)
      }
    } finally {
      busy = false
    }
    if (next >= pageCount) io.disconnect()
  }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(batch) }, { root: container, rootMargin: '600px' })
  io.observe(sentinel)
  const ready = more(first)
  return { ready, destroy() { dead = true; io.disconnect() } }
}
