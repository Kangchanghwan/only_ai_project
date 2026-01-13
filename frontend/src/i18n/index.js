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

// 브라우저 언어 감지
function getBrowserLocale() {
  const browserLocale = navigator.language || navigator.userLanguage
  const languageCode = browserLocale.split('-')[0]

  // 지원하는 언어인지 확인
  const supported = languages.find(lang => lang.code === languageCode)
  return supported ? languageCode : 'ko' // 기본값: 한국어
}

// localStorage에서 저장된 언어 가져오기
const savedLocale = localStorage.getItem('user-locale')
const defaultLocale = savedLocale || getBrowserLocale()

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