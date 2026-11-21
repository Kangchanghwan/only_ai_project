import { describe, it, expect } from 'vitest'
import { viewerFontCss, fontBase, sanitizeSvg } from './hwpViewer.js'

describe('hwpViewer', () => {
  it('폰 보기 글꼴은 편집기 출처에서 받는다', () => {
    expect(fontBase()).toBe('https://hwp.clipboardapp.org/fonts/')
    const css = viewerFontCss()
    expect(css).toContain('src:url(https://hwp.clipboardapp.org/fonts/NotoSerifKR-Regular.woff2)')
    expect(css).not.toContain('/tools/hwp/studio/')
  })
  it('SVG 에서 스크립트가 될 수 있는 부분을 뺀다', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="x()"><script>alert(1)</script>'
      + '<foreignObject><div>x</div></foreignObject><text x="1" y="2" font-family="함초롬바탕">글</text>'
      + '<image href="data:image/png;base64,AA==" onerror="y()"/><a xlink:href="javascript:z()"><rect width="1" height="1"/></a></svg>'
    const out = sanitizeSvg(svg)
    expect(out).toContain('<text')
    expect(out).toContain('글')
    expect(out).toContain('data:image/png;base64,AA==')
    expect(out).not.toMatch(/script|foreignObject|onload|onerror|javascript:/i)
  })
  it('SVG 가 아니면 빈 문자열', () => {
    expect(sanitizeSvg('<html><body>x</body></html>')).toBe('')
  })
})
