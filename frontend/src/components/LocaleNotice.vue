<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { languages, localeNoticeTarget, readSavedLocale } from '../i18n/index.js'
import { trackEvent } from '../utils/analytics'

const DISMISS_KEY = 'locale-notice-dismissed'
const { t } = useI18n()

// 프리렌더(Googlebot용 HTML)에 들어가지 않도록 마운트 뒤에만 결정한다
const target = ref(null)

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

onMounted(() => {
  if (isDismissed()) return
  const found = localeNoticeTarget({
    savedLocale: readSavedLocale(),
    pathname: window.location.pathname,
    browserLanguage: navigator.language || navigator.userLanguage
  })
  if (!found) return
  target.value = found
  trackEvent('locale_notice_shown', { target_locale: found.locale })
})

const href = computed(() =>
  target.value ? `${target.value.path}${window.location.search}${window.location.hash}` : '#'
)
const languageName = computed(() => languages.find((l) => l.code === target.value?.locale)?.name || '')

function onClick() {
  trackEvent('locale_notice_click', { target_locale: target.value?.locale })
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // 저장소가 막힌 환경에서는 이번 방문에서만 닫는다
  }
  target.value = null
}
</script>

<template>
  <div v-if="target" class="locale-notice" role="region" data-testid="locale-notice">
    <span>{{ t('localeNotice.message') }}</span>
    <a :href="href" class="locale-notice__link" data-testid="locale-notice-link" @click="onClick">
      {{ t('localeNotice.link', { language: languageName }) }}
    </a>
    <button
      type="button"
      class="locale-notice__close"
      data-testid="locale-notice-dismiss"
      :aria-label="t('localeNotice.dismiss')"
      @click="dismiss"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.locale-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.4rem 2.5rem 0.4rem 0.75rem;
  position: relative;
  font-size: 0.85rem;
  background: #eef2ff;
  color: #1e293b;
}
.locale-notice__link {
  font-weight: 600;
  color: #4338ca;
  text-decoration: underline;
}
.locale-notice__close {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
}
</style>
