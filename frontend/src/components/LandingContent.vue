<script setup>
/**
 * 검색엔진과 첫 방문자를 위한 설명 섹션. 도구 아래에 렌더링되며 프리렌더 HTML에 포함된다.
 *
 * 카피의 언어는 앱 로케일이 아니라 copyLocaleFor() 규칙을 따른다.
 * Googlebot은 navigator.language='en-US' + 빈 localStorage로 '/'를 렌더링하므로,
 * 앱 로케일을 그대로 쓰면 한국어 head/canonical 아래에 영어 본문이 깔려 신호가 어긋난다.
 * 사용자가 언어를 직접 고른 적이 있을 때만 그 언어를 따르고, 아니면 경로의 언어를 쓴다.
 * 해당 로케일에 landing 번역이 없으면 아무것도 렌더링하지 않는다 (한국어 폴백 노출 방지).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyLocaleFor, savedLocale } from '../i18n/index.js'

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

// locale과 savedLocale 모두 반응형이라, 언어를 고르면 새로고침 없이 카피가 따라온다.
const copyLocale = computed(() =>
  copyLocaleFor({
    savedLocale: savedLocale.value,
    pathname: window.location.pathname,
    locale: locale.value
  })
)

/**
 * UI 언어와 카피 언어가 다를 때(예: 영어 브라우저로 한국어 페이지에 온 첫 방문자)
 * 원하는 언어의 페이지로 넘어갈 수 있는 탈출구. 언어 선택기를 못 찾는 사람을 위한 링크라
 * 보는 사람이 읽을 수 있어야 해서 i18n 키가 아니라 대상 언어로 고정한 문구를 쓴다.
 */
const altLink = computed(() => {
  if (locale.value === copyLocale.value) return null
  return copyLocale.value === 'ko'
    ? { href: '/en/', label: 'Read this page in English' }
    : { href: '/', label: '이 페이지를 한국어로 보기' }
})

/** copyLocale 기준으로 번역한다. te()로 먼저 막으므로 폴백(한국어)이 새지 않는다. */
const tc = (key) => t(key, {}, { locale: copyLocale.value })

const available = computed(() => te('landing.headline', copyLocale.value))
const steps = ['landing.how1', 'landing.how2', 'landing.how3']
const useCases = ['landing.useCase1', 'landing.useCase2', 'landing.useCase3', 'landing.useCase4']
const safety = ['landing.safety1', 'landing.safety2', 'landing.safety3']
const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: `landing.faq${n}q`, a: `landing.faq${n}a` }))
const links = computed(() =>
  (copyLocale.value === 'ko' ? KO_LINKS : EN_LINKS).filter(
    (l) => te(l.key, copyLocale.value) && tc(l.key).trim().length > 0
  )
)
</script>

<template>
  <section
    v-if="available"
    data-testid="landing-content"
    aria-labelledby="landing-headline"
    class="mt-8 mb-4 flex flex-col gap-6 text-text-primary"
  >
    <a
      v-if="altLink"
      :href="altLink.href"
      data-testid="landing-alt-link"
      class="text-sm text-primary hover:underline"
    >{{ altLink.label }}</a>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 id="landing-headline" class="font-display font-bold text-xl leading-snug">{{ tc('landing.headline') }}</h2>
      <p class="mt-2 text-base leading-relaxed">{{ tc('landing.intro') }}</p>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ tc('landing.howTitle') }}</h2>
      <ol class="mt-2 flex flex-col gap-2 list-decimal pl-6 text-base leading-relaxed">
        <li v-for="key in steps" :key="key">{{ tc(key) }}</li>
      </ol>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ tc('landing.useCasesTitle') }}</h2>
      <ul class="mt-2 flex flex-col gap-2 list-disc pl-6 text-base leading-relaxed">
        <li v-for="key in useCases" :key="key">{{ tc(key) }}</li>
      </ul>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ tc('landing.safetyTitle') }}</h2>
      <ul class="mt-2 flex flex-col gap-2 list-disc pl-6 text-base leading-relaxed">
        <li v-for="key in safety" :key="key">{{ tc(key) }}</li>
      </ul>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="font-display font-bold text-lg">{{ tc('landing.faqTitle') }}</h2>
      <div class="mt-2 flex flex-col gap-4">
        <div v-for="faq in faqs" :key="faq.q" data-testid="landing-faq-item">
          <h3 class="text-sm font-semibold">{{ tc(faq.q) }}</h3>
          <p class="mt-1 text-base leading-relaxed">{{ tc(faq.a) }}</p>
        </div>
      </div>
    </div>

    <nav v-if="links.length" aria-labelledby="landing-more-title" class="px-6">
      <h2 id="landing-more-title" class="font-display font-bold text-lg">{{ tc('landing.moreTitle') }}</h2>
      <ul class="mt-2 flex flex-col gap-2 text-base">
        <li v-for="link in links" :key="link.href">
          <a :href="link.href" data-testid="landing-link" class="text-primary hover:underline">{{ tc(link.key) }}</a>
        </li>
      </ul>
    </nav>
  </section>
</template>
