import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyLocaleFor, pathLocale, savedLocale } from '../i18n/index.js'

const SITE = 'https://www.clipboardapp.org'
const OG_LOCALES = {
  ko: 'ko_KR', en: 'en_US', zh: 'zh_CN', ja: 'ja_JP', es: 'es_ES', fr: 'fr_FR', pt: 'pt_BR',
  ar: 'ar_AR', ru: 'ru_RU', id: 'id_ID', de: 'de_DE', fa: 'fa_IR', tr: 'tr_TR', pl: 'pl_PL',
  nl: 'nl_NL', cs: 'cs_CZ', vi: 'vi_VN', uk: 'uk_UA', sv: 'sv_SE', hu: 'hu_HU', ro: 'ro_RO'
}

/** 언어 코드 → og:locale 값. 매핑이 없으면 en_US로 떨어진다. */
export function ogLocaleFor(code) {
  return OG_LOCALES[code] || 'en_US'
}

/** 경로 기준 canonical: /en 계열이면 영어 페이지, 그 외는 루트 */
export function canonicalFor(pathname) {
  return pathLocale(pathname) === 'en' ? `${SITE}/en/` : `${SITE}/`
}

function setAttr(selector, attr, value) {
  if (!value) return
  const el = document.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

/**
 * FAQPage JSON-LD를 화면에 보이는 FAQ와 같은 언어로 교체한다.
 * faq가 없거나 비었으면(=번역이 없는 로케일) 프리렌더된 JSON-LD를 그대로 둔다.
 */
function applyFaqJsonLd(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return
  const el = document.querySelector('script#ld-faq')
  if (!el) return
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  })
}

/** head 태그를 로케일/경로에 맞게 갱신한다. 요소가 없으면 건너뛴다. */
export function applySeoMeta({ locale, title, description, pathname, faq }) {
  if (typeof document === 'undefined') return
  const url = canonicalFor(pathname)
  if (title) document.title = title
  if (locale) document.documentElement.setAttribute('lang', locale)
  setAttr('meta[name="title"]', 'content', title)
  setAttr('meta[name="description"]', 'content', description)
  setAttr('meta[property="og:title"]', 'content', title)
  setAttr('meta[property="og:description"]', 'content', description)
  setAttr('meta[property="og:url"]', 'content', url)
  setAttr('meta[property="og:locale"]', 'content', ogLocaleFor(locale))
  setAttr('meta[name="twitter:title"]', 'content', title)
  setAttr('meta[name="twitter:description"]', 'content', description)
  setAttr('meta[name="twitter:url"]', 'content', url)
  setAttr('link[rel="canonical"]', 'href', url)
  applyFaqJsonLd(faq)
}

/** 로케일이 바뀔 때마다 SEO 메타를 갱신하는 컴포저블 (App.vue에서 1회 호출) */
export function useSeoMeta() {
  const { t, te, locale } = useI18n()

  const update = () => {
    const pathname = window.location.pathname

    // 크롤러 보호: Googlebot은 navigator.language='en-US' + 빈 localStorage로 렌더링하므로
    // '/'에서도 로케일이 en으로 잡힌다. 그대로 head를 덮으면 canonical/hreflang은 '/'를
    // 한국어 페이지라고 말하는데 title/description/og/lang만 영어가 되어 신호가 충돌한다.
    // LandingContent와 같은 규칙(copyLocaleFor)을 써서 본문 카피와 head 언어를 항상 일치시킨다.
    // 이 화면이 보여줄 카피 언어가 앱 로케일과 다르면 = 사용자가 직접 고른 언어가 아니므로
    // 프리렌더된 head를 그대로 둔다.
    if (copyLocaleFor({ savedLocale: savedLocale.value, pathname, locale: locale.value }) !== locale.value) return

    // 화면의 FAQ와 JSON-LD 언어를 맞춘다. 번역이 없는 로케일이면 프리렌더된 FAQ를 유지한다.
    const hasLanding = te('landing.headline', locale.value)
    const faq = hasLanding
      ? [1, 2, 3, 4, 5].map((n) => ({ q: t(`landing.faq${n}q`), a: t(`landing.faq${n}a`) }))
      : undefined

    applySeoMeta({
      locale: locale.value,
      title: t('seo.title'),
      description: t('seo.description'),
      pathname,
      faq
    })
  }

  // 언어를 직접 고르면 locale 값이 그대로여도(이미 같은 언어) head를 다시 계산해야 한다
  watch([locale, savedLocale], update, { immediate: true })
}
