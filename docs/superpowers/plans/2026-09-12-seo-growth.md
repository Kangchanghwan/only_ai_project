# SEO Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clipboardapp.org discoverable in search: consistent www canonical signals, crawlable landing copy on the home page, an English `/en/` prerender, six guide pages, clean structured data, and GA hygiene, per `docs/superpowers/specs/2026-09-12-seo-growth-design.md`.

**Architecture:** The Vue SPA stays a single bundle. Locale is resolved from localStorage, then URL path (`/en/`), then browser language. A `useSeoMeta` composable rewrites head tags per locale and path; `LandingContent.vue` renders crawlable copy under the tool; the Puppeteer prerender writes `dist/index.html` (ko) and `dist/en/index.html` (en). Static HTML pages in `frontend/public/` carry the long-tail guides.

**Tech Stack:** Vue 3 (Composition API, plain JS), vue-i18n 11, Vite 7, Vitest + @vue/test-utils + happy-dom, Puppeteer prerender, Vercel static hosting.

**Rules for every task:**
- Work only inside the files listed for your task. Other tasks run in parallel in the same worktree; touching their files causes conflicts.
- Do NOT `git commit` or `git add`; the coordinator commits after integration.
- Edit locale JSON files with targeted inserts (never rewrite a whole file), keep 2-space indentation and a trailing newline.
- Read `DESIGN.md` at the repo root before any UI/CSS decision.
- Run tests from `frontend/` with `npx vitest run <file>`; `node_modules` is already installed.
- Spec copy (titles, descriptions, landing text) lives in the spec file; use it verbatim.

Already done by the coordinator: `seo.*` and `landing.*` keys exist in `frontend/src/i18n/locales/ko.json` and `en.json` (see spec 4.1, 4.2).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `frontend/src/utils/analytics.js` (+ `.test.js`) | 1 | `trackEvent` wrapper over `window.gtag` |
| `frontend/src/composables/useSeoMeta.js` (+ `.test.js`) | 1 | per-locale/per-path head tags |
| `frontend/src/i18n/index.js` | 1 | `pathLocale`, `resolveLocale` exports; initial locale |
| `frontend/src/i18n/i18n.test.js` | 1 | resolveLocale tests |
| `frontend/src/App.vue` | 1 | call `useSeoMeta()`, fire analytics events |
| `frontend/src/components/LandingContent.vue` (+ `.test.js`) | 2 | crawlable landing copy |
| `frontend/src/components/RoomScreen.vue` (+ `.test.js`) | 2 | mount LandingContent under `<main>` |
| `frontend/index.html` | 3 | meta, hreflang, JSON-LD, GA gating |
| `frontend/scripts/prerender.mjs` | 3 | `/` ko + `/en/` en prerender |
| `frontend/vercel.json` (new), `frontend/public/robots.txt`, `frontend/public/sitemap.xml`, `frontend/public/llms.txt` (new), `README.md` | 3 | hosting + crawl files |
| `frontend/public/faq.html`, `frontend/public/how-to-use.html`, `frontend/public/guide/*.html` (4 new), `frontend/public/en/guide/*.html` (2 new) | 4 | static content pages |
| `frontend/src/i18n/locales/{ar,cs,de,es,fa,fr,hu,id,ja,nl,pl,pt,ro,ru,sv,tr,uk,vi,zh}.json` | 5 (three agents) | translated `seo.*` + `landing.*` |
| `frontend/src/i18n/i18n.test.js` (key-presence test), integration checks | 6 (coordinator) | verification |

---

### Task 1: analytics util, useSeoMeta composable, path locale, App.vue wiring

**Files:**
- Create: `frontend/src/utils/analytics.js`, `frontend/src/utils/analytics.test.js`
- Create: `frontend/src/composables/useSeoMeta.js`, `frontend/src/composables/useSeoMeta.test.js`
- Modify: `frontend/src/i18n/index.js` (locale resolution), `frontend/src/i18n/i18n.test.js` (append tests)
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Write failing tests for `trackEvent`** in `frontend/src/utils/analytics.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { trackEvent } from './analytics'

describe('trackEvent', () => {
  afterEach(() => { delete window.gtag })

  it('gtag가 없으면 false를 돌려주고 아무 일도 하지 않는다', () => {
    expect(trackEvent('file_upload', { file_count: 1 })).toBe(false)
  })

  it('gtag가 있으면 event 호출로 이름과 파라미터를 전달한다', () => {
    window.gtag = vi.fn()
    expect(trackEvent('text_share', { scope: 'ip' })).toBe(true)
    expect(window.gtag).toHaveBeenCalledWith('event', 'text_share', { scope: 'ip' })
  })

  it('gtag가 예외를 던져도 삼키고 false를 돌려준다', () => {
    window.gtag = vi.fn(() => { throw new Error('boom') })
    expect(trackEvent('file_download')).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/utils/analytics.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** `frontend/src/utils/analytics.js`:

```js
/**
 * GA4 이벤트 전송 래퍼. gtag가 없거나(개발/프리렌더) 실패해도 앱 흐름을 막지 않는다.
 * @returns {boolean} 전송 시도 성공 여부
 */
export function trackEvent(name, params = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false
    window.gtag('event', name, params)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run** the test file → PASS.

- [ ] **Step 5: Write failing tests for locale resolution** by appending to `frontend/src/i18n/i18n.test.js`:

```js
import { resolveLocale, pathLocale } from './index.js'

describe('resolveLocale', () => {
  it('/en 경로는 en, 다른 경로는 null', () => {
    expect(pathLocale('/en/')).toBe('en')
    expect(pathLocale('/en')).toBe('en')
    expect(pathLocale('/en/guide/x.html')).toBe('en')
    expect(pathLocale('/')).toBeNull()
    expect(pathLocale('/english')).toBeNull()
  })

  it('저장된 로케일 > 경로 > 브라우저 언어 > ko 순으로 결정한다', () => {
    expect(resolveLocale({ savedLocale: 'ja', pathname: '/en/', browserLanguage: 'de-DE' })).toBe('ja')
    expect(resolveLocale({ savedLocale: null, pathname: '/en/', browserLanguage: 'de-DE' })).toBe('en')
    expect(resolveLocale({ savedLocale: null, pathname: '/', browserLanguage: 'de-DE' })).toBe('de')
    expect(resolveLocale({ savedLocale: null, pathname: '/', browserLanguage: 'xx-YY' })).toBe('ko')
    expect(resolveLocale({ savedLocale: 'nope', pathname: '/', browserLanguage: 'fr' })).toBe('fr')
  })
})
```

- [ ] **Step 6: Run** `npx vitest run src/i18n/i18n.test.js` → FAIL (exports missing).

- [ ] **Step 7: Implement in `frontend/src/i18n/index.js`** (replace `getBrowserLocale`/`savedLocale`/`defaultLocale` block; keep the `languages` array and the `createI18n` call, `fallbackLocale: 'ko'` unchanged):

```js
const SUPPORTED = new Set(languages.map((lang) => lang.code))

/** `/en` 또는 `/en/...` 경로면 'en', 아니면 null */
export function pathLocale(pathname) {
  return /^\/en(\/|$)/.test(pathname || '') ? 'en' : null
}

/** 저장된 로케일 > URL 경로 > 브라우저 언어 > 'ko' */
export function resolveLocale({ savedLocale, pathname, browserLanguage }) {
  if (savedLocale && SUPPORTED.has(savedLocale)) return savedLocale
  const fromPath = pathLocale(pathname)
  if (fromPath) return fromPath
  const code = (browserLanguage || '').split('-')[0]
  return SUPPORTED.has(code) ? code : 'ko'
}

const defaultLocale = resolveLocale({
  savedLocale: localStorage.getItem('user-locale'),
  pathname: window.location.pathname,
  browserLanguage: navigator.language || navigator.userLanguage
})
```

- [ ] **Step 8: Run** the i18n test file → PASS (all existing tests still pass).

- [ ] **Step 9: Write failing tests for `useSeoMeta`** in `frontend/src/composables/useSeoMeta.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { applySeoMeta, canonicalFor } from './useSeoMeta'

function head(html) { document.head.innerHTML = html }

describe('canonicalFor', () => {
  it('경로가 /en 계열이면 /en/ canonical, 아니면 루트', () => {
    expect(canonicalFor('/en/')).toBe('https://www.clipboardapp.org/en/')
    expect(canonicalFor('/en')).toBe('https://www.clipboardapp.org/en/')
    expect(canonicalFor('/')).toBe('https://www.clipboardapp.org/')
    expect(canonicalFor('/#/download?r=x')).toBe('https://www.clipboardapp.org/')
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
})
```

- [ ] **Step 10: Run** `npx vitest run src/composables/useSeoMeta.test.js` → FAIL.

- [ ] **Step 11: Implement** `frontend/src/composables/useSeoMeta.js`:

```js
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

const SITE = 'https://www.clipboardapp.org'
const OG_LOCALES = {
  ko: 'ko_KR', en: 'en_US', zh: 'zh_CN', ja: 'ja_JP', es: 'es_ES', fr: 'fr_FR', pt: 'pt_BR',
  ar: 'ar_AR', ru: 'ru_RU', id: 'id_ID', de: 'de_DE', fa: 'fa_IR', tr: 'tr_TR', pl: 'pl_PL',
  nl: 'nl_NL', cs: 'cs_CZ', vi: 'vi_VN', uk: 'uk_UA', sv: 'sv_SE', hu: 'hu_HU', ro: 'ro_RO'
}

/** 경로 기준 canonical: /en 계열이면 영어 페이지, 그 외는 루트 */
export function canonicalFor(pathname) {
  return /^\/en(\/|$)/.test(pathname || '') ? `${SITE}/en/` : `${SITE}/`
}

function setAttr(selector, attr, value) {
  if (!value) return
  const el = document.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

/** head 태그를 로케일/경로에 맞게 갱신한다. 요소가 없으면 건너뛴다. */
export function applySeoMeta({ locale, title, description, pathname }) {
  if (typeof document === 'undefined') return
  const url = canonicalFor(pathname)
  if (title) document.title = title
  if (locale) document.documentElement.setAttribute('lang', locale)
  setAttr('meta[name="title"]', 'content', title)
  setAttr('meta[name="description"]', 'content', description)
  setAttr('meta[property="og:title"]', 'content', title)
  setAttr('meta[property="og:description"]', 'content', description)
  setAttr('meta[property="og:url"]', 'content', url)
  setAttr('meta[property="og:locale"]', 'content', OG_LOCALES[locale] || 'en_US')
  setAttr('meta[name="twitter:title"]', 'content', title)
  setAttr('meta[name="twitter:description"]', 'content', description)
  setAttr('meta[name="twitter:url"]', 'content', url)
  setAttr('link[rel="canonical"]', 'href', url)
}

/** 로케일이 바뀔 때마다 SEO 메타를 갱신하는 컴포저블 (App.vue에서 1회 호출) */
export function useSeoMeta() {
  const { t, locale } = useI18n()
  const update = () => applySeoMeta({
    locale: locale.value,
    title: t('seo.title'),
    description: t('seo.description'),
    pathname: window.location.pathname
  })
  watch(locale, update, { immediate: true })
}
```

- [ ] **Step 12: Run** the test file → PASS.

- [ ] **Step 13: Wire App.vue.** Add imports next to the other composable imports:

```js
import { useSeoMeta } from './composables/useSeoMeta'
import { trackEvent } from './utils/analytics'
```

Call `useSeoMeta()` right after `const shareScope = useShareScope()`. Then add events:
- In `uploadFiles(...)`, after `const summary = await fileManager.uploadFiles(...)` resolves, read the success count from the summary (inspect `useFileManager.uploadFiles` return shape; use the field that counts succeeded files, falling back to `files.length` if none exists) and call `trackEvent('file_upload', { file_count: <succeeded>, scope: targetScope })` only when the count is > 0.
- In `handleAddText(...)`, after `socket.publishMessage(...)`: `trackEvent('text_share', { scope: targetScope })`.
- In `handleDownloadFile(...)` success branch: `trackEvent('file_download', { file_count: 1 })`.
- In `handleDownloadParallel(...)` after `download.downloadParallel` resolves: `trackEvent('file_download', { file_count: files.length })`.

- [ ] **Step 14: Run the full frontend suite** `npx vitest run` → all PASS (App.vue has no direct tests; composable tests cover behavior). Report the pass/fail counts.

---

### Task 2: LandingContent component + RoomScreen integration

**Files:**
- Create: `frontend/src/components/LandingContent.vue`, `frontend/src/components/LandingContent.test.js`
- Modify: `frontend/src/components/RoomScreen.vue`, `frontend/src/components/RoomScreen.test.js`

- [ ] **Step 1: Write failing tests** in `frontend/src/components/LandingContent.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LandingContent from './LandingContent.vue'
import ko from '../i18n/locales/ko.json'
import en from '../i18n/locales/en.json'

function mountWith(locale) {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'ko',
    messages: { ko, en, xx: { app: { title: 'x' } } }
  })
  return mount(LandingContent, { global: { plugins: [i18n] } })
}

describe('LandingContent.vue', () => {
  it('한국어: 헤드라인, 5개 FAQ, 사용법/FAQ/가이드 4개 링크를 렌더링한다', () => {
    const w = mountWith('ko')
    expect(w.find('[data-testid="landing-content"]').exists()).toBe(true)
    expect(w.text()).toContain(ko.landing.headline)
    expect(w.findAll('[data-testid="landing-faq-item"]')).toHaveLength(5)
    const hrefs = w.findAll('[data-testid="landing-link"]').map((a) => a.attributes('href'))
    expect(hrefs).toEqual([
      '/how-to-use.html',
      '/faq.html',
      '/guide/iphone-to-windows-photo-transfer.html',
      '/guide/pc-bang-file-transfer.html',
      '/guide/android-mac-airdrop-alternative.html',
      '/guide/copy-text-phone-to-pc.html'
    ])
  })

  it('영어: 영어 헤드라인과 영어 가이드 2개만 링크한다 (빈 guide3/guide4는 제외)', () => {
    const w = mountWith('en')
    expect(w.text()).toContain(en.landing.headline)
    const hrefs = w.findAll('[data-testid="landing-link"]').map((a) => a.attributes('href'))
    expect(hrefs).toEqual([
      '/en/guide/share-clipboard-between-phone-and-pc.html',
      '/en/guide/airdrop-alternative-android-windows-mac.html'
    ])
  })

  it('landing 키가 없는 로케일에서는 아무것도 렌더링하지 않는다 (한국어 폴백 노출 방지)', () => {
    const w = mountWith('xx')
    expect(w.find('[data-testid="landing-content"]').exists()).toBe(false)
  })

  it('헤드라인은 h2, FAQ 질문은 h3로 렌더링된다', () => {
    const w = mountWith('ko')
    expect(w.find('h2#landing-headline').text()).toBe(ko.landing.headline)
    expect(w.findAll('h3').length).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/LandingContent.test.js` → FAIL.

- [ ] **Step 3: Implement** `frontend/src/components/LandingContent.vue` (read `DESIGN.md` first; tokens only: `bg-surface`, `border-border`, `text-text-primary`, `text-text-secondary`, `text-primary`, `font-display`, radius `rounded-xl`, spacing on the 8px scale):

```vue
<script setup>
/**
 * 검색엔진과 첫 방문자를 위한 설명 섹션. 도구 아래에 렌더링되며 프리렌더 HTML에 포함된다.
 * 현재 로케일에 landing 번역이 없으면 아무것도 렌더링하지 않는다 (한국어 폴백 노출 방지).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, te, locale } = useI18n()

const KO_LINKS = [
  { key: 'landing.moreHowToUse', href: '/how-to-use.html' },
  { key: 'landing.moreFaq', href: '/faq.html' },
  { key: 'landing.guide1', href: '/guide/iphone-to-windows-photo-transfer.html' },
  { key: 'landing.guide2', href: '/guide/pc-bang-file-transfer.html' },
  { key: 'landing.guide3', href: '/guide/android-mac-airdrop-alternative.html' },
  { key: 'landing.guide4', href: '/guide/copy-text-phone-to-pc.html' }
]
const EN_LINKS = [
  { key: 'landing.guide1', href: '/en/guide/share-clipboard-between-phone-and-pc.html' },
  { key: 'landing.guide2', href: '/en/guide/airdrop-alternative-android-windows-mac.html' }
]

const available = computed(() => te('landing.headline'))
const steps = ['landing.how1', 'landing.how2', 'landing.how3']
const useCases = ['landing.useCase1', 'landing.useCase2', 'landing.useCase3', 'landing.useCase4']
const safety = ['landing.safety1', 'landing.safety2', 'landing.safety3']
const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: `landing.faq${n}q`, a: `landing.faq${n}a` }))
const links = computed(() =>
  (locale.value === 'ko' ? KO_LINKS : EN_LINKS).filter((l) => te(l.key) && t(l.key).trim().length > 0)
)
</script>

<template>
  <section
    v-if="available"
    data-testid="landing-content"
    aria-labelledby="landing-headline"
    class="mt-8 flex flex-col gap-6 text-text-primary"
  >
    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 id="landing-headline" class="font-display font-bold text-xl leading-snug">{{ t('landing.headline') }}</h2>
      <p class="mt-3 text-sm leading-relaxed text-text-secondary">{{ t('landing.intro') }}</p>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ t('landing.howTitle') }}</h2>
      <ol class="mt-3 flex flex-col gap-2 list-decimal pl-5 text-sm leading-relaxed text-text-secondary">
        <li v-for="key in steps" :key="key">{{ t(key) }}</li>
      </ol>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ t('landing.useCasesTitle') }}</h2>
      <ul class="mt-3 flex flex-col gap-2 list-disc pl-5 text-sm leading-relaxed text-text-secondary">
        <li v-for="key in useCases" :key="key">{{ t(key) }}</li>
      </ul>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ t('landing.safetyTitle') }}</h2>
      <ul class="mt-3 flex flex-col gap-2 list-disc pl-5 text-sm leading-relaxed text-text-secondary">
        <li v-for="key in safety" :key="key">{{ t(key) }}</li>
      </ul>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ t('landing.faqTitle') }}</h2>
      <dl class="mt-3 flex flex-col gap-4">
        <div v-for="faq in faqs" :key="faq.q" data-testid="landing-faq-item">
          <dt><h3 class="text-sm font-semibold">{{ t(faq.q) }}</h3></dt>
          <dd class="mt-1 text-sm leading-relaxed text-text-secondary">{{ t(faq.a) }}</dd>
        </div>
      </dl>
    </div>

    <nav v-if="links.length" :aria-label="t('landing.moreTitle')" class="px-2">
      <h2 class="font-display font-bold text-lg">{{ t('landing.moreTitle') }}</h2>
      <ul class="mt-3 flex flex-col gap-2 text-sm">
        <li v-for="link in links" :key="link.href">
          <a :href="link.href" data-testid="landing-link" class="text-primary hover:underline">{{ t(link.key) }}</a>
        </li>
      </ul>
    </nav>
  </section>
</template>
```

- [ ] **Step 4: Run** the test file → PASS.

- [ ] **Step 5: Integrate into RoomScreen.** In `frontend/src/components/RoomScreen.vue` import `LandingContent from './LandingContent.vue'` and render `<LandingContent />` between the closing `</div>` of `.relative` (after `</main>`) and `<AppFooter />`. Add a stub in `RoomScreen.test.js`:

```js
  LandingContent: {
    name: 'LandingContent',
    template: '<div class="landing-content-stub"></div>'
  }
```

and a test in the "컴포넌트 렌더링" block:

```js
    it('LandingContent가 렌더링되어야 한다', () => {
      const wrapper = mount(RoomScreen, { props: defaultProps, global: { plugins: [i18n], stubs } })
      expect(wrapper.find('.landing-content-stub').exists()).toBe(true)
    })
```

- [ ] **Step 6: Run** `npx vitest run src/components/RoomScreen.test.js src/components/LandingContent.test.js` → PASS.

---

### Task 3: index.html, prerender, hosting and crawl files

**Files:**
- Modify: `frontend/index.html`, `frontend/scripts/prerender.mjs`, `frontend/public/robots.txt`, `frontend/public/sitemap.xml`, `README.md` (repo root)
- Create: `frontend/vercel.json`, `frontend/public/llms.txt`

- [ ] **Step 1: index.html head.** Replace the GA block (the two `<script>` tags and the three TODO comments) with:

```html
    <!-- Google Analytics 4: 프로덕션 호스트에서만 로드 (dev/preview/prerender 트래픽 차단) -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      if (location.hostname === 'www.clipboardapp.org') {
        var gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-GT656L9026';
        document.head.appendChild(gaScript);
        gtag('js', new Date());
        gtag('config', 'G-GT656L9026');
      }
    </script>
```

Replace title/meta/canonical/hreflang/OG/Twitter with (values from spec 4.1 ko):

```html
    <title>PC와 폰 사이 파일·텍스트 즉시 전송 | 온라인 클립보드 Clipboard Share</title>
    <meta name="title" content="PC와 폰 사이 파일·텍스트 즉시 전송 | 온라인 클립보드 Clipboard Share" />
    <meta name="description" content="회원가입·앱 설치 없이 같은 와이파이의 PC와 스마트폰이 브라우저에서 자동 연결돼 복사한 텍스트, 스크린샷, 파일을 바로 주고받는 무료 온라인 클립보드. 나가면 자동 삭제." />
    <meta name="keywords" content="온라인 클립보드, 클립보드 공유, PC 폰 파일 전송, 같은 와이파이 파일 공유, 회원가입 없는 파일 공유, 스크린샷 공유, 텍스트 공유, online clipboard, share clipboard" />
    <meta name="author" content="Clipboard Share" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://www.clipboardapp.org/" />

    <!-- Alternate Languages (hreflang) -->
    <link rel="alternate" hreflang="ko" href="https://www.clipboardapp.org/" />
    <link rel="alternate" hreflang="en" href="https://www.clipboardapp.org/en/" />
    <link rel="alternate" hreflang="x-default" href="https://www.clipboardapp.org/" />
```

OG/Twitter: same title/description, `og:url` and `twitter:url` → `https://www.clipboardapp.org/`, `og:image`/`twitter:image` → `https://www.clipboardapp.org/og-image.png`, keep `og:locale` `ko_KR`, `og:site_name` `Clipboard Share`.

- [ ] **Step 2: index.html JSON-LD.** Delete the `SoftwareApplication` and `HowTo` blocks entirely. Replace the others with:

```html
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Clipboard Share",
      "alternateName": "클립보드 셰어",
      "url": "https://www.clipboardapp.org",
      "logo": { "@type": "ImageObject", "url": "https://www.clipboardapp.org/apple-touch-icon.png", "width": 180, "height": 180 },
      "sameAs": ["https://github.com/Kangchanghwan/only_ai_project"]
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Clipboard Share",
      "alternateName": "클립보드 셰어",
      "url": "https://www.clipboardapp.org",
      "description": "회원가입·앱 설치 없이 같은 와이파이의 PC와 스마트폰 사이에서 텍스트, 스크린샷, 파일을 바로 주고받는 무료 온라인 클립보드.",
      "inLanguage": ["ko-KR", "en-US"],
      "publisher": { "@type": "Organization", "name": "Clipboard Share", "url": "https://www.clipboardapp.org" }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Clipboard Share",
      "alternateName": "클립보드 셰어",
      "url": "https://www.clipboardapp.org",
      "description": "같은 와이파이의 기기들이 브라우저에서 자동 연결되어 복사한 텍스트, 스크린샷, 파일을 실시간으로 주고받는 무료 온라인 클립보드. 회원가입과 앱 설치가 필요 없고, 모두 나가면 자동 삭제됩니다.",
      "applicationCategory": "UtilityApplication",
      "applicationSubCategory": "Online Clipboard",
      "operatingSystem": "Any",
      "browserRequirements": "Requires JavaScript. Modern browser (Chrome, Firefox, Safari, Edge).",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "KRW" },
      "featureList": [
        "같은 네트워크 기기 자동 연결",
        "클립보드 텍스트·이미지 붙여넣기 공유",
        "파일 드래그 앤 드롭 업로드",
        "QR 코드로 파일 전달",
        "여러 파일 순차 다운로드",
        "모두 나가면 자동 삭제",
        "다크 모드, 21개 언어, PWA 설치"
      ],
      "screenshot": { "@type": "ImageObject", "url": "https://www.clipboardapp.org/og-image.png", "width": 1200, "height": 630 },
      "author": { "@type": "Organization", "name": "Clipboard Share" },
      "inLanguage": ["ko-KR", "en-US"]
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "정말 무료인가요?", "acceptedAnswer": { "@type": "Answer", "text": "네. 모든 기능이 무료이고 회원가입도 없습니다." } },
        { "@type": "Question", "name": "앱을 설치해야 하나요?", "acceptedAnswer": { "@type": "Answer", "text": "아니요. 크롬, 사파리, 엣지 같은 브라우저만 있으면 됩니다. 원하면 홈 화면에 앱처럼 추가할 수도 있습니다." } },
        { "@type": "Question", "name": "같은 와이파이가 아니면 못 쓰나요?", "acceptedAnswer": { "@type": "Answer", "text": "'전체 공유' 탭으로 바꾸면 네트워크와 상관없이 이 서비스를 열어 둔 모든 사용자와 공유됩니다. 민감한 파일은 같은 네트워크에서만 공유하세요." } },
        { "@type": "Question", "name": "파일 크기 제한이 있나요?", "acceptedAnswer": { "@type": "Answer", "text": "파일 하나당 업로드 카드에 표시된 최대 용량까지 올릴 수 있고, 여러 파일을 한 번에 올릴 수 있습니다." } },
        { "@type": "Question", "name": "파일은 얼마나 보관되나요?", "acceptedAnswer": { "@type": "Answer", "text": "누군가 보고 있는 동안만 유지됩니다. 모든 기기가 나가면 잠시 후 자동 삭제되니, 필요한 파일은 바로 내려받으세요." } }
      ]
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [ { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://www.clipboardapp.org/" } ]
    }
    </script>
```

Verify with `node -e` that every JSON-LD block parses: extract `<script type="application/ld+json">` contents and `JSON.parse` each.

- [ ] **Step 3: prerender.mjs.** Replace `const routes = ['/']` with:

```js
// route → 프리렌더 시 고정할 로케일. localStorage 'user-locale'이 브라우저 언어보다 우선한다 (src/i18n/index.js resolveLocale)
const routes = [
  { path: '/', locale: 'ko', language: 'ko-KR' },
  { path: '/en/', locale: 'en', language: 'en-US' }
]
```

In the loop, before `page.goto`, add:

```js
      await page.evaluateOnNewDocument((locale, language) => {
        try { localStorage.setItem('user-locale', locale) } catch {}
        Object.defineProperty(navigator, 'language', { get: () => language })
        Object.defineProperty(navigator, 'languages', { get: () => [language] })
      }, route.locale, route.language)
      await page.setExtraHTTPHeaders({ 'Accept-Language': route.language })
```

Use `route.path` in `page.goto` and logs. Before `const html = await page.content()`, strip transient UI:

```js
      // 일시적 요소(알림 토스트)는 정적 HTML에 굽지 않는다
      await page.evaluate(() => {
        document.querySelectorAll('[data-prerender-strip], [role="status"], [role="alert"]').forEach((el) => el.remove())
      })
```

Output path: `route.path === '/' ? join(distDir, 'index.html') : join(distDir, route.path.replace(/^\/|\/$/g, ''), 'index.html')` (so `/en/` → `dist/en/index.html`). Keep the static server as is (it already falls back to `index.html` for extension-less paths).

- [ ] **Step 4: Create `frontend/vercel.json`** (the Vercel project's root directory is `frontend`, so the repo-root `vercel.json` is ignored):

```json
{
  "buildCommand": "npm run build:seo",
  "outputDirectory": "dist",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "clipboardapp.org" }],
      "destination": "https://www.clipboardapp.org/$1",
      "permanent": true
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    { "source": "/robots.txt", "headers": [{ "key": "Content-Type", "value": "text/plain; charset=utf-8" }] },
    { "source": "/sitemap.xml", "headers": [{ "key": "Content-Type", "value": "application/xml; charset=utf-8" }] },
    { "source": "/llms.txt", "headers": [{ "key": "Content-Type", "value": "text/plain; charset=utf-8" }] },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

- [ ] **Step 5: robots.txt** (whole file):

```
# Clipboard Share
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://www.clipboardapp.org/sitemap.xml
```

- [ ] **Step 6: sitemap.xml** (whole file; `lastmod` 2026-09-12; hreflang alternates on `/` and `/en/`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.clipboardapp.org/</loc>
    <lastmod>2026-09-12</lastmod>
    <xhtml:link rel="alternate" hreflang="ko" href="https://www.clipboardapp.org/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://www.clipboardapp.org/en/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.clipboardapp.org/" />
  </url>
  <url>
    <loc>https://www.clipboardapp.org/en/</loc>
    <lastmod>2026-09-12</lastmod>
    <xhtml:link rel="alternate" hreflang="ko" href="https://www.clipboardapp.org/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://www.clipboardapp.org/en/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.clipboardapp.org/" />
  </url>
  <url><loc>https://www.clipboardapp.org/how-to-use.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/faq.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/guide/iphone-to-windows-photo-transfer.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/guide/pc-bang-file-transfer.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/guide/android-mac-airdrop-alternative.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/guide/copy-text-phone-to-pc.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/en/guide/share-clipboard-between-phone-and-pc.html</loc><lastmod>2026-09-12</lastmod></url>
  <url><loc>https://www.clipboardapp.org/en/guide/airdrop-alternative-android-windows-mac.html</loc><lastmod>2026-09-12</lastmod></url>
</urlset>
```

- [ ] **Step 7: llms.txt** (`frontend/public/llms.txt`):

```
# Clipboard Share

> Free online clipboard: devices on the same Wi-Fi connect automatically in the browser and share copied text, screenshots and files instantly. No sign-up, no app; everything is deleted when every device leaves.

- Home (Korean): https://www.clipboardapp.org/
- Home (English): https://www.clipboardapp.org/en/
- How to use (Korean): https://www.clipboardapp.org/how-to-use.html
- FAQ (Korean): https://www.clipboardapp.org/faq.html
- Guide: share your clipboard between phone and PC: https://www.clipboardapp.org/en/guide/share-clipboard-between-phone-and-pc.html
- Guide: AirDrop alternative for Android, Windows and Mac: https://www.clipboardapp.org/en/guide/airdrop-alternative-android-windows-mac.html
- Source code: https://github.com/Kangchanghwan/only_ai_project
```

- [ ] **Step 8: README.md.** Replace the first heading and intro paragraph of the repo-root `README.md` with:

```markdown
# Clipboard Share — 온라인 클립보드 (https://www.clipboardapp.org)

회원가입·앱 설치 없이 같은 와이파이의 PC와 스마트폰이 브라우저에서 자동 연결돼 복사한 텍스트, 스크린샷, 파일을 바로 주고받는 무료 온라인 클립보드입니다. 영어 페이지: https://www.clipboardapp.org/en/

Socket.IO 기반 실시간 공유 서버와 Vue 3 프론트엔드로 구성됩니다. (아래 기능 설명 일부는 초기 6자리 룸 모델 기준의 옛 내용입니다.)
```

- [ ] **Step 9: Verify.** From `frontend/`: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`; `npx vitest run` (no test touches these files, must still pass); `npm run build:seo` locally (Puppeteer is installed) and check:
  - `grep -c 'lang="ko"' dist/index.html` → 1 and `grep -c 'PC와 스마트폰 사이' dist/index.html` ≥ 1
  - `grep -c 'lang="en"' dist/en/index.html` → 1 and `grep -c 'The online clipboard between' dist/en/index.html` ≥ 1
  - `grep -o '<link rel="canonical"[^>]*>' dist/en/index.html` → `https://www.clipboardapp.org/en/`
  - `grep -c 'googletagmanager' dist/index.html` → 1 (only the inline string, not an injected tag)
  Report the actual output. If Task 2's LandingContent is not yet merged when you build, the headline greps may fail; report that and re-run after the coordinator says both are in place.

---

### Task 4: static guide pages and refresh of faq.html / how-to-use.html

**Files:**
- Modify: `frontend/public/faq.html`, `frontend/public/how-to-use.html`
- Create: `frontend/public/guide/iphone-to-windows-photo-transfer.html`, `frontend/public/guide/pc-bang-file-transfer.html`, `frontend/public/guide/android-mac-airdrop-alternative.html`, `frontend/public/guide/copy-text-phone-to-pc.html`, `frontend/public/en/guide/share-clipboard-between-phone-and-pc.html`, `frontend/public/en/guide/airdrop-alternative-android-windows-mac.html`

- [ ] **Step 1: Shared template.** Read `DESIGN.md`. Build one inline-CSS template used by all eight pages: Plus Jakarta Sans from Google Fonts, light palette (`background #FAF8F5`, `surface #FFFFFF`, `border #E9E3DA`, `text #2A2622`, `muted #8A8178`, accent `#FF6B4A`), `max-width: 40rem`, radius 14px cards, `prefers-color-scheme: dark` block with the dark neutrals (`#1C1917`, `#262220`, `#3A3430`, `#F2EDE7`, `#A69A8D`). Header with site name linking home, `<main>` article, a coral CTA button ("지금 바로 써보기" / "Open Clipboard Share") linking to `/` (ko) or `/en/` (en), a "관련 글" / "Related" list, footer with links to home, FAQ, how-to-use, GitHub. No emoji in headings.

- [ ] **Step 2: Page metadata (use exactly):**

| File | `<title>` | description |
|---|---|---|
| guide/iphone-to-windows-photo-transfer.html | 아이폰 사진 윈도우 PC로 옮기기: 케이블·아이튠즈 없이 브라우저로 | 아이폰과 윈도우 PC를 같은 와이파이에 두고 브라우저만 열면 사진과 동영상이 바로 전송됩니다. 케이블, 아이튠즈, 카톡 나에게 보내기 없이 옮기는 방법. |
| guide/pc-bang-file-transfer.html | PC방·공용 PC에서 로그인 없이 파일 옮기는 방법 | PC방이나 회사 공용 PC에 내 계정을 로그인하지 않고 폰과 파일을 주고받는 방법. 브라우저만 열면 되고, 나가면 자동 삭제됩니다. |
| guide/android-mac-airdrop-alternative.html | 안드로이드와 맥 사이 AirDrop 대안: 설치 없이 브라우저로 전송 | 갤럭시 같은 안드로이드 폰과 맥 사이에는 AirDrop이 없습니다. 같은 와이파이에서 브라우저로 사진·파일·텍스트를 바로 보내는 방법을 설명합니다. |
| guide/copy-text-phone-to-pc.html | 폰에서 복사한 텍스트를 PC에 바로 붙여넣기 (링크·인증번호·코드) | 스마트폰에서 복사한 링크, 인증번호, 코드를 PC 브라우저에 그대로 붙여넣는 방법. 앱 설치와 로그인 없이 온라인 클립보드로 옮깁니다. |
| en/guide/share-clipboard-between-phone-and-pc.html | How to Share Your Clipboard Between Phone and PC (No App) | Copy on your phone, paste on your PC. Devices on the same Wi-Fi connect automatically in the browser, so text, screenshots and files move instantly without an app or account. |
| en/guide/airdrop-alternative-android-windows-mac.html | AirDrop Alternative for Android, Windows and Mac (Browser Only) | Send photos, files and text between Android, Windows and Mac without AirDrop. Same Wi-Fi, one browser tab on each device, nothing to install. |

Canonical = `https://www.clipboardapp.org/` + path. `og:type` article, `og:locale` `ko_KR` or `en_US`, `og:image` `https://www.clipboardapp.org/og-image.png`.

- [ ] **Step 3: Body outline per guide (600 to 1,000 characters of prose in the page language):** (1) the problem in two sentences, (2) numbered steps that match the real product: open `https://www.clipboardapp.org/` on both devices on the same Wi-Fi, they group automatically under the "같은 네트워크" / "Same network" tab, paste with Ctrl+V / Cmd+V or drop files, tap the item on the other device to copy or download, (3) two or three tips (Everyone tab for different networks, files disappear after everyone leaves, add to home screen), (4) mini FAQ with two questions, (5) CTA. Never mention room codes, Supabase, or a file-size number.

- [ ] **Step 4: JSON-LD per guide:** `Article` (headline = title, description, `inLanguage`, `datePublished` 2026-09-12, `author`/`publisher` Organization "Clipboard Share", `mainEntityOfPage` canonical) plus `BreadcrumbList` (홈 → 가이드 → page). For `faq.html`: `FAQPage` with the page's questions. For `how-to-use.html`: `BreadcrumbList` only (drop `HowTo`).

- [ ] **Step 5: Rewrite `faq.html` and `how-to-use.html`** on the same template. Content must describe the current product (auto-join, 같은 네트워크/전체 공유 tabs, paste/drag upload, QR, PWA share target, auto-delete). Remove every mention of 6자리 룸 코드, 룸 생성/입장, Supabase, AWS S3. Fix canonical/og:url to www. Cross-link: both pages link to each other and to all four Korean guides.

- [ ] **Step 6: Verify** with a Node script from `frontend/`: for each of the eight files, parse every `application/ld+json` block with `JSON.parse`, assert the canonical starts with `https://www.clipboardapp.org/`, assert every relative `href` in the page points to an existing file under `public/` (or `/`, `/en/`), and print title lengths (≤ 60 chars) and description lengths (≤ 160 chars). Report the script output.

---

### Task 5: translations for the other 19 locales (three parallel agents)

**Files (one owner each):**
- Agent 5A: `ja.json`, `zh.json`, `es.json`, `fr.json`, `pt.json`, `de.json`
- Agent 5B: `ar.json`, `ru.json`, `id.json`, `fa.json`, `tr.json`, `pl.json`
- Agent 5C: `nl.json`, `cs.json`, `vi.json`, `uk.json`, `sv.json`, `hu.json`, `ro.json`

- [ ] **Step 1:** Read `frontend/src/i18n/locales/en.json` and `ko.json` `seo` and `landing` blocks (source copy).
- [ ] **Step 2:** For each owned locale, translate every key of `seo` and `landing` into that language (natural, concise, same meaning; keep product terms "Clipboard Share", "Wi-Fi", "PC", "Ctrl+V / Cmd+V", "GitHub", "HTTPS"; use the locale's existing `shareScope.ip` / `shareScope.global` wording for the two tab names). `landing.guide1`/`guide2` are the English guide titles translated (they link to English pages), `guide3` and `guide4` are empty strings `""`. `seo.title` ≤ 60 characters where the script allows, `seo.description` ≤ 160.
- [ ] **Step 3:** Insert with a Node one-off (never hand-edit the whole file):

```js
// node - <<'EOF'  (from frontend/)
const fs = require('fs'); const f = 'src/i18n/locales/ja.json'
const j = JSON.parse(fs.readFileSync(f, 'utf8'))
j.seo = { title: '...', description: '...' }
j.landing = { headline: '...', /* all 33 keys */ }
fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
```

- [ ] **Step 4:** Verify: `node -e` that each owned file parses and has the same key set under `landing` as `ko.json` (33 keys) and `seo` (2 keys). Report the check output per file.

---

### Task 6 (coordinator): key-presence test, integration, review

- [ ] Add to `frontend/src/i18n/i18n.test.js` a test that all 21 locales have non-empty `seo.title`, `seo.description`, `landing.headline`, `landing.faq5a`, `landing.moreTitle`.
- [ ] `npx vitest run` → all pass. `npm run build:seo` → inspect `dist/index.html`, `dist/en/index.html` per Task 3 Step 9.
- [ ] `vite preview` + browser screenshot of the landing section (mobile 375 and desktop) for a DESIGN.md sanity check.
- [ ] claude-seo agents (technical, schema, sitemap, hreflang) against the local preview; fix anything actionable.
- [ ] Code review, commit in logical chunks, push branch, open PR to `master`.
