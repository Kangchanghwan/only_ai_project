import { describe, it, expect } from 'vitest'
import { sanitizeTree, isSafeUrl, watchSanitize } from './officeSanitize.js'

const mk = (html) => {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

describe('isSafeUrl', () => {
  it.each(['http://a.com/x', 'https://a.com', 'HTTPS://A.COM', 'blob:https://x/abc', 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,AAAA', '#bookmark', ''])('허용: %s', (u) => {
    expect(isSafeUrl(u)).toBe(true)
  })
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' \tjava\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'data:image/svg+xml;base64,AAAA', 'file:///etc/passwd', 'vbscript:x', '//evil.com/x', 'relative/path.png'])('거부: %s', (u) => {
    expect(isSafeUrl(u)).toBe(false)
  })
})

describe('sanitizeTree', () => {
  it('script / iframe / object / embed 제거', () => {
    const r = mk('<p>글</p><script>alert(1)</script><iframe src="https://x"></iframe><object data="x"></object><embed src="x"><div><script>1</script><b>남음</b></div>')
    sanitizeTree(r)
    expect(r.querySelector('script,iframe,object,embed')).toBeNull()
    expect(r.textContent).toContain('글')
    expect(r.textContent).toContain('남음')
  })
  it('on* 속성 제거', () => {
    const r = mk('<img src="data:image/png;base64,AA" onerror="alert(1)"><div onclick="x()" ONMOUSEOVER="y()" class="k">t</div>')
    sanitizeTree(r)
    for (const el of r.querySelectorAll('*')) {
      for (const a of el.attributes) expect(a.name.toLowerCase().startsWith('on')).toBe(false)
    }
    expect(r.querySelector('.k')).not.toBeNull()
  })
  it('허용되지 않는 스킴의 href/src는 속성 제거, 허용 스킴은 유지', () => {
    const r = mk('<a id="a" href="javascript:alert(1)">x</a><a id="b" href="https://ok.com">y</a><img id="c" src="data:text/html;base64,AA"><img id="d" src="data:image/png;base64,AA"><img id="e" src="blob:https://x/1"><a id="f" href="#top">z</a>')
    sanitizeTree(r)
    expect(r.querySelector('#a').hasAttribute('href')).toBe(false)
    expect(r.querySelector('#b').getAttribute('href')).toBe('https://ok.com')
    expect(r.querySelector('#c').hasAttribute('src')).toBe(false)
    expect(r.querySelector('#d').hasAttribute('src')).toBe(true)
    expect(r.querySelector('#e').hasAttribute('src')).toBe(true)
    expect(r.querySelector('#f').getAttribute('href')).toBe('#top')
  })
  it('모든 링크는 target=_blank rel="noopener noreferrer"', () => {
    const r = mk('<a href="https://a.com">a</a><a href="javascript:1">b</a><a>c</a>')
    sanitizeTree(r)
    for (const a of r.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })
  it('style 안의 위험한 url()은 style 속성을 지운다, 안전한 것은 둔다', () => {
    const r = mk('<div id="a" style="background:url(javascript:alert(1))"></div><div id="b" style="background:url(data:image/png;base64,AA)"></div><div id="c" style="color:red"></div>')
    sanitizeTree(r)
    expect(r.querySelector('#a').hasAttribute('style')).toBe(false)
    expect(r.querySelector('#b').hasAttribute('style')).toBe(true)
    expect(r.querySelector('#c').getAttribute('style')).toContain('red')
  })
  it('srcset도 검사한다', () => {
    const r = mk('<img id="a" srcset="javascript:alert(1) 1x"><img id="b" srcset="https://a.com/x.png 2x">')
    sanitizeTree(r)
    expect(r.querySelector('#a').hasAttribute('srcset')).toBe(false)
    expect(r.querySelector('#b').hasAttribute('srcset')).toBe(true)
  })
  it('null이어도 예외 없음', () => {
    expect(() => sanitizeTree(null)).not.toThrow()
  })
})

describe('watchSanitize', () => {
  it('나중에 들어온 노드도 정리하고, 멈출 수 있다', async () => {
    const r = mk('<div id="slot"></div>')
    const stop = watchSanitize(r)
    r.querySelector('#slot').innerHTML = '<a href="javascript:x()" onclick="y()">t</a><script>1</script>'
    await new Promise((res) => setTimeout(res, 20))
    const a = r.querySelector('a')
    expect(a.hasAttribute('href')).toBe(false)
    expect(a.hasAttribute('onclick')).toBe(false)
    expect(r.querySelector('script')).toBeNull()
    stop()
  })
})
