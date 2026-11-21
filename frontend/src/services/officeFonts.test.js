import { describe, it, expect } from 'vitest'
import { officeFontCss, ensureOfficeFonts, withFallback, patchStyleText, patchInlineFonts, BASE_FONT } from './officeFonts.js'

describe('officeFonts', () => {
  const css = officeFontCss()
  it('local()만 쓴다 (url()·@import 없음 = 네트워크 요청 0)', () => {
    expect(css).not.toMatch(/url\(/i)
    expect(css).not.toMatch(/@import/i)
    expect(css).toMatch(/local\("Apple SD Gothic Neo"\)/)
  })
  it('요청한 고딕/명조 이름이 모두 별칭으로 선언된다 (보통+굵게)', () => {
    for (const n of ['Malgun Gothic', '맑은 고딕', '굴림', 'Gulim', '굴림체', '돋움', 'Dotum', '돋움체', '새굴림', '等线', 'DengXian', 'Calibri', '바탕', 'Batang', '바탕체', '궁서', 'Gungsuh']) {
      expect(css).toContain(`font-family:"${n}";font-weight:400`)
      expect(css).toContain(`font-family:"${n}";font-weight:700`)
    }
  })
  it('고딕은 Apple SD Gothic Neo 우선, 명조는 AppleMyungjo 우선', () => {
    expect(css).toMatch(/font-family:"맑은 고딕";font-weight:400;src:local\("Apple SD Gothic Neo"\)/)
    expect(css).toMatch(/font-family:"바탕";font-weight:400;src:local\("AppleMyungjo"\)/)
  })
  it('한 번만 넣는다', () => {
    ensureOfficeFonts(); ensureOfficeFonts()
    expect(document.querySelectorAll('#cb-office-fonts').length).toBe(1)
  })
  it('앱 UI 글꼴 이름은 별칭으로 덮지 않는다', () => {
    for (const n of ['Pretendard', 'Pretendard Variable', 'Plus Jakarta Sans', 'Segoe UI', 'Roboto', 'Cabinet Grotesk']) expect(css).not.toContain(`font-family:"${n}"`)
  })
  it('기본 글꼴은 고딕 계열 + sans-serif', () => {
    expect(BASE_FONT).toMatch(/sans-serif$/)
  })
  it('withFallback: 일반 글꼴이 없으면 붙이고, 있으면 그대로', () => {
    expect(withFallback('Foo Font')).toMatch(/sans-serif$/)
    expect(withFallback('"함초롬바탕"')).toMatch(/serif$/)
    expect(withFallback('Foo, sans-serif')).toBe('Foo, sans-serif')
    expect(withFallback('')).toBe('')
  })
  it('patchStyleText / patchInlineFonts', () => {
    expect(patchStyleText('.a{font-family:Gulim;color:red}')).toMatch(/font-family:Gulim, .*sans-serif;color:red/)
    const d = document.createElement('div')
    d.innerHTML = '<span style="font-family: HYHeadLine">x</span><span style="font-family: Arial, sans-serif">y</span>'
    patchInlineFonts(d)
    expect(d.children[0].style.fontFamily).toMatch(/sans-serif/)
    expect(d.children[1].style.fontFamily).toBe('Arial, sans-serif')
  })
})
