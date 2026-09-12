import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { applySeoMeta, canonicalFor, ogLocaleFor, useSeoMeta } from './useSeoMeta'
import { languages, savedLocale, setSavedLocale } from '../i18n/index.js'

function head(html) { document.head.innerHTML = html }

describe('canonicalFor', () => {
  it('경로가 /en 계열이면 /en/ canonical, 아니면 루트', () => {
    expect(canonicalFor('/en/')).toBe('https://www.clipboardapp.org/en/')
    expect(canonicalFor('/en')).toBe('https://www.clipboardapp.org/en/')
    expect(canonicalFor('/')).toBe('https://www.clipboardapp.org/')
    expect(canonicalFor('/#/download?r=x')).toBe('https://www.clipboardapp.org/')
  })
})

describe('ogLocaleFor', () => {
  it('지원 언어 목록의 모든 코드가 OG 로케일 매핑을 갖는다', () => {
    for (const { code } of languages) {
      expect(typeof ogLocaleFor(code), `${code}의 OG 로케일 매핑 없음`).toBe('string')
      // 'en'만 기본값과 같은 값을 갖는 것이 정상이고, 나머지가 기본값으로 떨어지면 매핑 누락이다
      if (code !== 'en') {
        expect(ogLocaleFor(code), `${code}가 기본값(en_US)으로 떨어짐 — OG_LOCALES 누락`).not.toBe('en_US')
      }
    }
  })
})

describe('applySeoMeta', () => {
  beforeEach(() => {
    head(`
      <meta name="title" content="old">
      <meta name="description" content="old">
      <meta property="og:title" content="old">
      <meta property="og:description" content="old">
      <meta property="og:url" content="old">
      <meta property="og:locale" content="old">
      <meta name="twitter:title" content="old">
      <meta name="twitter:description" content="old">
      <meta name="twitter:url" content="old">
      <link rel="canonical" href="old">
      <script type="application/ld+json" id="ld-faq">{"prerendered":true}</script>
    `)
    document.documentElement.setAttribute('lang', 'xx')
  })

  it('title/description/og/twitter/canonical/lang을 모두 갱신한다', () => {
    applySeoMeta({ locale: 'en', title: 'T', description: 'D', pathname: '/en/' })
    expect(document.title).toBe('T')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('D')
    expect(document.querySelector('meta[property="og:title"]').getAttribute('content')).toBe('T')
    expect(document.querySelector('meta[property="og:url"]').getAttribute('content')).toBe('https://www.clipboardapp.org/en/')
    expect(document.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe('en_US')
    expect(document.querySelector('meta[name="twitter:url"]').getAttribute('content')).toBe('https://www.clipboardapp.org/en/')
    expect(document.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://www.clipboardapp.org/en/')
  })

  it('한국어는 og:locale ko_KR, 루트 canonical', () => {
    applySeoMeta({ locale: 'ko', title: 'K', description: 'KD', pathname: '/' })
    expect(document.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe('ko_KR')
    expect(document.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://www.clipboardapp.org/')
  })

  it('head에 요소가 없어도 예외 없이 title과 lang만 바꾼다', () => {
    head('')
    expect(() => applySeoMeta({ locale: 'ja', title: 'J', description: 'JD', pathname: '/' })).not.toThrow()
    expect(document.title).toBe('J')
    expect(document.documentElement.getAttribute('lang')).toBe('ja')
  })

  it('faq를 주면 script#ld-faq를 FAQPage JSON-LD로 교체한다', () => {
    applySeoMeta({
      locale: 'en',
      title: 'T',
      description: 'D',
      pathname: '/en/',
      faq: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }]
    })
    const json = JSON.parse(document.querySelector('script#ld-faq').textContent)
    expect(json['@type']).toBe('FAQPage')
    expect(json.mainEntity).toHaveLength(2)
    expect(json.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Q1',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' }
    })
  })

  it('faq를 주지 않으면 프리렌더된 script#ld-faq를 그대로 둔다', () => {
    applySeoMeta({ locale: 'ko', title: 'K', description: 'KD', pathname: '/' })
    expect(JSON.parse(document.querySelector('script#ld-faq').textContent)).toEqual({ prerendered: true })
  })

  it('script#ld-faq가 없어도 faq 전달 시 예외가 없다', () => {
    head('')
    expect(() => applySeoMeta({ locale: 'en', title: 'T', description: 'D', pathname: '/en/', faq: [{ q: 'Q', a: 'A' }] })).not.toThrow()
  })
})

// ── useSeoMeta 컴포저블 (마운트 테스트) ────────────────────────────────
const messages = {
  ko: {
    seo: { title: 'KO-TITLE', description: 'KO-DESC' },
    landing: {
      headline: 'KO-HEAD',
      faq1q: 'KO-Q1', faq1a: 'KO-A1',
      faq2q: 'KO-Q2', faq2a: 'KO-A2',
      faq3q: 'KO-Q3', faq3a: 'KO-A3',
      faq4q: 'KO-Q4', faq4a: 'KO-A4',
      faq5q: 'KO-Q5', faq5a: 'KO-A5'
    }
  },
  en: {
    seo: { title: 'EN-TITLE', description: 'EN-DESC' },
    landing: {
      headline: 'EN-HEAD',
      faq1q: 'EN-Q1', faq1a: 'EN-A1',
      faq2q: 'EN-Q2', faq2a: 'EN-A2',
      faq3q: 'EN-Q3', faq3a: 'EN-A3',
      faq4q: 'EN-Q4', faq4a: 'EN-A4',
      faq5q: 'EN-Q5', faq5a: 'EN-A5'
    }
  }
}

const Probe = defineComponent({
  setup() {
    useSeoMeta()
    return () => h('div')
  }
})

function mountProbe(locale) {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'ko', messages })
  const wrapper = mount(Probe, { global: { plugins: [i18n] } })
  return { i18n, wrapper }
}

function faqJson() {
  return JSON.parse(document.querySelector('script#ld-faq').textContent)
}

describe('useSeoMeta', () => {
  beforeEach(() => {
    savedLocale.value = null
    localStorage.removeItem('user-locale')
    head(`
      <meta name="title" content="PRERENDERED">
      <meta name="description" content="PRERENDERED">
      <meta property="og:title" content="PRERENDERED">
      <meta property="og:description" content="PRERENDERED">
      <meta property="og:url" content="PRERENDERED">
      <meta property="og:locale" content="PRERENDERED">
      <meta name="twitter:title" content="PRERENDERED">
      <meta name="twitter:description" content="PRERENDERED">
      <meta name="twitter:url" content="PRERENDERED">
      <link rel="canonical" href="PRERENDERED">
      <script type="application/ld+json" id="ld-faq">{"prerendered":true}</script>
    `)
    document.title = 'PRERENDERED'
  })

  afterEach(() => {
    savedLocale.value = null
    localStorage.removeItem('user-locale')
    window.history.replaceState({}, '', '/')
  })

  it('저장된 로케일이 없고 로케일이 페이지 언어와 같으면 head를 갱신한다', () => {
    mountProbe('ko')
    expect(document.title).toBe('KO-TITLE')
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('KO-DESC')
    expect(faqJson().mainEntity[0].name).toBe('KO-Q1')
  })

  it('저장된 로케일이 없는데 브라우저 언어로 en이 잡히면 / 의 프리렌더 head를 건드리지 않는다', async () => {
    const { i18n } = mountProbe('ko')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(document.title).toBe('KO-TITLE')
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('KO-DESC')
    expect(faqJson().mainEntity[0].name).toBe('KO-Q1')
  })

  it('사용자가 직접 고른 로케일(localStorage)이 있으면 경로와 달라도 head를 갱신한다', () => {
    setSavedLocale('en')
    mountProbe('en')
    expect(document.title).toBe('EN-TITLE')
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('EN-DESC')
    expect(faqJson().mainEntity[0].name).toBe('EN-Q1')
  })

  it('언어를 고르면 locale 값이 이미 같아도 head가 갱신된다', async () => {
    // 영어 브라우저로 '/'에 처음 온 방문자: locale은 en이지만 저장된 언어가 없어 head는 프리렌더 그대로.
    mountProbe('en')
    expect(document.title).toBe('PRERENDERED')

    setSavedLocale('en')
    await nextTick()

    expect(document.title).toBe('EN-TITLE')
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('EN-DESC')
  })

  it('/en/ 경로에서는 저장된 로케일이 없어도 영어 head를 적용한다', () => {
    window.history.replaceState({}, '', '/en/')
    mountProbe('en')
    expect(document.title).toBe('EN-TITLE')
    expect(document.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://www.clipboardapp.org/en/')
    expect(faqJson().mainEntity[0].name).toBe('EN-Q1')
  })
})
