import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import ko from './locales/ko.json'
import en from './locales/en.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import pt from './locales/pt.json'
import ar from './locales/ar.json'
import ru from './locales/ru.json'
import id from './locales/id.json'
import de from './locales/de.json'
import fa from './locales/fa.json'
import tr from './locales/tr.json'
import pl from './locales/pl.json'
import nl from './locales/nl.json'
import cs from './locales/cs.json'
import vi from './locales/vi.json'
import uk from './locales/uk.json'
import sv from './locales/sv.json'
import hu from './locales/hu.json'
import ro from './locales/ro.json'

// 지원하는 언어 목록
export const languages = [
  { code: 'ko', name: '한국어', nativeName: 'Korean' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: '中文', nativeName: 'Chinese' },
  { code: 'es', name: 'Español', nativeName: 'Spanish' },
  { code: 'fr', name: 'Français', nativeName: 'French' },
  { code: 'pt', name: 'Português', nativeName: 'Portuguese' },
  { code: 'ar', name: 'العربية', nativeName: 'Arabic' },
  { code: 'ru', name: 'Русский', nativeName: 'Russian' },
  { code: 'id', name: 'Bahasa Indonesia', nativeName: 'Indonesian' },
  { code: 'de', name: 'Deutsch', nativeName: 'German' },
  { code: 'ja', name: '日本語', nativeName: 'Japanese' },
  { code: 'fa', name: 'فارسی', nativeName: 'Persian' },
  { code: 'tr', name: 'Türkçe', nativeName: 'Turkish' },
  { code: 'pl', name: 'Polski', nativeName: 'Polish' },
  { code: 'nl', name: 'Nederlands', nativeName: 'Dutch' },
  { code: 'cs', name: 'Čeština', nativeName: 'Czech' },
  { code: 'vi', name: 'Tiếng Việt', nativeName: 'Vietnamese' },
  { code: 'uk', name: 'Українська', nativeName: 'Ukrainian' },
  { code: 'sv', name: 'Svenska', nativeName: 'Swedish' },
  { code: 'hu', name: 'Magyar', nativeName: 'Hungarian' },
  { code: 'ro', name: 'Română', nativeName: 'Romanian' }
]

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

/** 저장소 접근이 막힌 환경(사파리 사생활 보호 모드 등)에서 부팅이 깨지지 않도록 감싼다. 접근이 막히면 null */
export function readSavedLocale() {
  try {
    return localStorage.getItem('user-locale')
  } catch {
    return null
  }
}

/**
 * 사용자가 직접 고른 언어(localStorage 'user-locale')를 반응형으로 보관한다.
 * localStorage 자체는 반응형이 아니라서, 이 ref 없이는 언어를 골라도
 * (이미 같은 locale이면 locale.value가 바뀌지 않으므로) 카피와 head가 새로고침 전까지 갱신되지 않는다.
 */
export const savedLocale = ref(readSavedLocale())

/** 사용자가 고른 언어를 저장하고 반응형 상태에 반영한다 */
export function setSavedLocale(code) {
  try {
    localStorage.setItem('user-locale', code)
  } catch {
    // 저장소 접근이 막힌 환경에서도 화면 상태는 갱신한다
  }
  savedLocale.value = code
}

/**
 * 검색엔진용 카피(랜딩 섹션, SEO 메타, FAQ JSON-LD)에 쓸 로케일.
 * 사용자가 직접 고른 언어가 있으면 그 언어, 없으면 페이지 경로의 언어를 쓴다.
 * Googlebot은 navigator.language=en-US + 빈 localStorage로 렌더링하므로,
 * 이 규칙이 없으면 한국어 페이지(/)에 영어 카피가 섞여 canonical/hreflang 신호와 어긋난다.
 */
export function copyLocaleFor({ savedLocale, pathname, locale }) {
  return savedLocale ? locale : (pathLocale(pathname) || 'ko')
}

const defaultLocale = resolveLocale({
  savedLocale: readSavedLocale(),
  pathname: window.location.pathname,
  browserLanguage: navigator.language || navigator.userLanguage
})

const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: 'ko',
  messages: {
    ko,
    en,
    zh,
    ja,
    es,
    fr,
    pt,
    ar,
    ru,
    id,
    de,
    fa,
    tr,
    pl,
    nl,
    cs,
    vi,
    uk,
    sv,
    hu,
    ro
  }
})

export default i18n