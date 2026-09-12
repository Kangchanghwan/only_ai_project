import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LandingContent from './LandingContent.vue'
import { savedLocale, setSavedLocale } from '../i18n/index.js'
import ko from '../i18n/locales/ko.json'
import en from '../i18n/locales/en.json'

const KO_HREFS = [
  '/how-to-use.html',
  '/faq.html',
  '/guide/iphone-to-windows-photo-transfer.html',
  '/guide/pc-bang-file-transfer.html',
  '/guide/android-mac-airdrop-alternative.html',
  '/guide/copy-text-phone-to-pc.html'
]
const EN_HREFS = [
  '/en/guide/share-clipboard-between-phone-and-pc.html',
  '/en/guide/airdrop-alternative-android-windows-mac.html'
]

// landing 번역이 아예 없는 로케일 / guide2만 빈 문자열인 로케일
const XX = { app: { title: 'x' } }
const YY = { landing: { ...en.landing, guide2: '' } }

function mountWith(locale, { saved = null, messages } = {}) {
  if (saved) setSavedLocale(saved)
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'ko',
    messages: messages || { ko, en, xx: XX }
  })
  return { w: mount(LandingContent, { global: { plugins: [i18n] } }), i18n }
}

function hrefs(w) {
  return w.findAll('[data-testid="landing-link"]').map((a) => a.attributes('href'))
}

afterEach(() => {
  savedLocale.value = null
  localStorage.removeItem('user-locale')
  window.history.replaceState({}, '', '/')
})

describe('LandingContent.vue', () => {
  it('한국어: 헤드라인, 5개 FAQ, 사용법/FAQ/가이드 4개 링크를 렌더링한다', () => {
    const { w } = mountWith('ko')
    expect(w.find('[data-testid="landing-content"]').exists()).toBe(true)
    expect(w.text()).toContain(ko.landing.headline)
    expect(w.findAll('[data-testid="landing-faq-item"]')).toHaveLength(5)
    expect(hrefs(w)).toEqual(KO_HREFS)
  })

  it('언어를 직접 고르지 않은 en 로케일(크롤러/브라우저 언어)에서는 / 페이지 언어인 한국어 카피를 렌더링한다', () => {
    // Googlebot은 navigator.language='en-US' + 빈 localStorage로 '/'를 렌더링한다.
    // 이때 영어 카피가 나오면 한국어 head/canonical과 신호가 어긋난다.
    expect(window.location.pathname).toBe('/')
    const { w } = mountWith('en')
    expect(w.text()).toContain(ko.landing.headline)
    expect(w.text()).not.toContain(en.landing.headline)
    expect(hrefs(w)).toEqual(KO_HREFS)
  })

  it('/en/ 경로에서는 저장된 언어가 없어도 영어 카피와 영어 링크를 렌더링한다', () => {
    window.history.replaceState({}, '', '/en/')
    const { w } = mountWith('ko')
    expect(w.text()).toContain(en.landing.headline)
    expect(w.text()).not.toContain(ko.landing.headline)
    expect(hrefs(w)).toEqual(EN_HREFS)
  })

  it('영어: 사용자가 직접 en을 고르면 영어 헤드라인과 영어 가이드 2개만 링크한다 (빈 guide3/guide4는 제외)', () => {
    const { w } = mountWith('en', { saved: 'en' })
    expect(w.text()).toContain(en.landing.headline)
    expect(hrefs(w)).toEqual(EN_HREFS)
  })

  it('사용자가 직접 고른 로케일에 landing 키가 없으면 아무것도 렌더링하지 않는다 (한국어 폴백 노출 방지)', () => {
    const { w } = mountWith('xx', { saved: 'xx' })
    expect(w.find('[data-testid="landing-content"]').exists()).toBe(false)
  })

  it('언어를 고르면 새로고침 없이 카피가 바뀐다 (locale 값이 이미 같아도 반응한다)', async () => {
    // 영어 브라우저로 '/'에 처음 온 방문자: UI는 en, 카피는 한국어.
    // 여기서 "English"를 고르면 locale.value는 이미 'en'이라 바뀌지 않는다.
    // 저장된 언어가 반응형이 아니면 새로고침 전까지 카피가 그대로 남는다.
    const { w } = mountWith('en')
    expect(w.text()).toContain(ko.landing.headline)

    setSavedLocale('en')
    await nextTick()

    expect(w.text()).toContain(en.landing.headline)
    expect(hrefs(w)).toEqual(EN_HREFS)
  })

  it('런타임 언어 전환: ko → en 으로 바꾸면 영어 카피와 영어 링크로 갱신된다', async () => {
    const { w, i18n } = mountWith('ko', { saved: 'ko' })
    expect(w.text()).toContain(ko.landing.headline)

    setSavedLocale('en')
    i18n.global.locale.value = 'en'
    await nextTick()

    expect(w.text()).toContain(en.landing.headline)
    expect(hrefs(w)).toEqual(EN_HREFS)

    setSavedLocale('xx')
    i18n.global.locale.value = 'xx'
    await nextTick()

    expect(w.find('[data-testid="landing-content"]').exists()).toBe(false)
  })

  it('번역이 빈 문자열인 링크만 걸러낸다 (키 존재 + 내용 있음)', () => {
    const { w } = mountWith('yy', { saved: 'yy', messages: { ko, en, yy: YY } })
    expect(w.find('[data-testid="landing-content"]').exists()).toBe(true)
    expect(hrefs(w)).toEqual([EN_HREFS[0]])
  })

  describe('UI 언어와 카피 언어가 다를 때의 안내 링크', () => {
    it('한국어 카피가 보이는 영어 UI에서는 영어 페이지로 가는 링크를 보여준다', () => {
      const { w } = mountWith('en')
      const alt = w.find('[data-testid="landing-alt-link"]')
      expect(alt.exists()).toBe(true)
      expect(alt.attributes('href')).toBe('/en/')
      expect(alt.text()).toBe('Read this page in English')
    })

    it('/en/ 에서 한국어 UI라면 한국어 페이지로 가는 링크를 보여준다', () => {
      window.history.replaceState({}, '', '/en/')
      const { w } = mountWith('ko')
      const alt = w.find('[data-testid="landing-alt-link"]')
      expect(alt.exists()).toBe(true)
      expect(alt.attributes('href')).toBe('/')
      expect(alt.text()).toBe('이 페이지를 한국어로 보기')
    })

    it('UI 언어와 카피 언어가 같으면 안내 링크가 없다', () => {
      const { w } = mountWith('ko', { saved: 'ko' })
      expect(w.find('[data-testid="landing-alt-link"]').exists()).toBe(false)
    })
  })

  it('헤드라인은 h2, FAQ 질문은 h3로 렌더링된다', () => {
    const { w } = mountWith('ko')
    expect(w.find('h2#landing-headline').text()).toBe(ko.landing.headline)
    expect(w.findAll('h3').length).toBeGreaterThanOrEqual(5)
  })

  it('FAQ는 dl/dt/dd 없이 div + h3 + p로 마크업된다 (dt 안의 h3는 유효하지 않은 HTML)', () => {
    const { w } = mountWith('ko')
    expect(w.findAll('dl')).toHaveLength(0)
    expect(w.findAll('dt')).toHaveLength(0)
    expect(w.findAll('dd')).toHaveLength(0)

    const items = w.findAll('[data-testid="landing-faq-item"]')
    expect(items).toHaveLength(5)
    items.forEach((item) => {
      expect(item.find('h3').exists()).toBe(true)
      expect(item.find('p').exists()).toBe(true)
    })
  })

  it('더 알아보기 nav는 aria-label 대신 제목 id를 참조한다', () => {
    const { w } = mountWith('ko')
    const nav = w.find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-labelledby')).toBe('landing-more-title')
    expect(nav.attributes('aria-label')).toBeUndefined()
    expect(w.find('h2#landing-more-title').exists()).toBe(true)
  })

  it('본문 텍스트는 text-text-secondary 대신 기본 텍스트 색을 상속한다', () => {
    const { w } = mountWith('ko')
    const section = w.find('[data-testid="landing-content"]')
    expect(section.classes()).toContain('text-text-primary')
    expect(section.classes()).toContain('mb-4')
    expect(section.html()).not.toContain('text-text-secondary')
  })
})
