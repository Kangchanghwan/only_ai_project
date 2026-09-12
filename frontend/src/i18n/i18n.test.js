import { describe, it, expect } from 'vitest'
import { resolveLocale, pathLocale } from './index.js'
import ko from './locales/ko.json'

const locales = import.meta.glob('./locales/*.json', { eager: true })

describe('i18n qr.backgroundHint', () => {
  it('모든 로케일 파일에 qr.backgroundHint 문자열이 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.qr, `${path}에 qr 섹션 없음`).toBeTruthy()
      expect(typeof json.qr.backgroundHint, `${path}에 qr.backgroundHint 없음`).toBe('string')
      expect(json.qr.backgroundHint.length, `${path} qr.backgroundHint 비어있음`).toBeGreaterThan(0)
    }
  })
})

describe('i18n shareScope', () => {
  it('모든 로케일 파일에 shareScope의 5개 키가 모두 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['label', 'ip', 'ipDescription', 'global', 'globalDescription']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.shareScope, `${path}에 shareScope 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.shareScope[key], `${path}의 shareScope.${key} 없음`).toBe('string')
        expect(json.shareScope[key].length, `${path}의 shareScope.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})

describe('i18n file.moreActions', () => {
  it('모든 로케일 파일에 file.moreActions 문자열이 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.file, `${path}에 file 섹션 없음`).toBeTruthy()
      expect(typeof json.file.moreActions, `${path}에 file.moreActions 없음`).toBe('string')
      expect(json.file.moreActions.length, `${path} file.moreActions 비어있음`).toBeGreaterThan(0)
    }
  })
})

describe('i18n shareTargetConfirm', () => {
  it('모든 로케일 파일에 shareTargetConfirm의 5개 키가 모두 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['titleFiles', 'titleText', 'titleFilesAndText', 'cancel', 'confirm']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.shareTargetConfirm, `${path}에 shareTargetConfirm 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.shareTargetConfirm[key], `${path}의 shareTargetConfirm.${key} 없음`).toBe('string')
        expect(json.shareTargetConfirm[key].length, `${path}의 shareTargetConfirm.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})

describe('i18n footer install', () => {
  it('모든 로케일 파일에 footer의 installPrompt/installButton이 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['installPrompt', 'installButton']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.footer, `${path}에 footer 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.footer[key], `${path}의 footer.${key} 없음`).toBe('string')
        expect(json.footer[key].length, `${path}의 footer.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})

describe('i18n help.pwa', () => {
  it('모든 로케일 파일에 help의 PWA 설치 안내 키가 모두 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['pwaTitle', 'pwaIntro', 'pwaAndroidTitle', 'pwaAndroidDesc', 'pwaIOSTitle', 'pwaIOSDesc']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.help, `${path}에 help 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.help[key], `${path}의 help.${key} 없음`).toBe('string')
        expect(json.help[key].length, `${path}의 help.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})

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

describe('i18n seo/landing (검색엔진용 카피)', () => {
  it('모든 로케일 파일에 seo.title/description과 landing 필수 키가 비어있지 않게 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    // 기준은 ko.json. 새 키를 추가하면 모든 로케일이 자동으로 검사 대상이 된다.
    const requiredLanding = Object.keys(ko.landing)
    // 한국어 전용 가이드라 다른 언어에는 대응 문서가 없다 (빈 문자열이면 링크에서 걸러진다)
    const mayBeEmpty = new Set(['guide3', 'guide4'])
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.seo, `${path}에 seo 섹션 없음`).toBeTruthy()
      for (const key of ['title', 'description']) {
        expect(typeof json.seo[key], `${path}의 seo.${key} 없음`).toBe('string')
        expect(json.seo[key].length, `${path}의 seo.${key} 비어있음`).toBeGreaterThan(0)
        // vue-i18n은 "|"를 복수형 구분자로 해석해 t()가 앞부분만 돌려주므로 카피에 쓰면 안 된다
        expect(json.seo[key].includes('|'), `${path}의 seo.${key}에 '|' 포함`).toBe(false)
      }
      expect(json.landing, `${path}에 landing 섹션 없음`).toBeTruthy()
      for (const key of requiredLanding) {
        expect(typeof json.landing[key], `${path}의 landing.${key} 없음`).toBe('string')
        if (mayBeEmpty.has(key)) continue
        expect(json.landing[key].length, `${path}의 landing.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})
