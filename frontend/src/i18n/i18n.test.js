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

describe('i18n 키 커버리지', () => {
  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    )

  it('알림/에러/QR/룸 섹션은 모든 로케일이 en.json과 같은 키를 가져야 한다', () => {
    // 이 테스트가 보장하는 섹션. 그 외 섹션(help/download 등)은 일부 로케일이 아직 en으로 폴백한다.
    const guarded = /^(notification|errors|qrModal)\.|^room\.|^fileGallery\./
    const en = flatten((locales['./locales/en.json'].default || locales['./locales/en.json'])).filter((k) => guarded.test(k))
    for (const [path, mod] of Object.entries(locales)) {
      const keys = new Set(flatten(mod.default || mod))
      const missing = en.filter((k) => !keys.has(k))
      expect(missing, `${path} 누락 키`).toEqual([])
    }
  })

  it('코드에서 사용하는 t(\'...\') 키가 en.json에 모두 존재해야 한다', () => {
    const sources = import.meta.glob(['../**/*.vue', '../**/*.js', '!../**/*.test.js', '!../i18n/locales/**'], {
      eager: true,
      query: '?raw',
      import: 'default'
    })
    const en = new Set(flatten(locales['./locales/en.json'].default || locales['./locales/en.json']))
    const used = new Map()
    const re = /(?<![\w.])\$?t\(\s*['"]([A-Za-z][\w]*(?:\.[\w]+)+)['"]/g
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(re)) used.set(m[1], file)
    }
    expect(used.size).toBeGreaterThan(50)
    const missing = [...used].filter(([k]) => !en.has(k) && !en.has(`${k}_plural`)).map(([k, f]) => `${k} (${f})`)
    expect(missing).toEqual([])
  })
})

describe('i18n 멀티파트/일일 한도 메시지', () => {
  it('모든 로케일에 업로드 관련 신규 키가 비어 있지 않게 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const keys = [
      ['notification', 'uploadResumed'],
      ['errors', 'dailyQuotaExceeded'],
      ['errors', 'singlePutTooLarge'],
      ['errors', 'sizeMismatch'],
      ['errors', 'multipartFailed'],
      ['errors', 'serverRoomSizeExceeded']
    ]
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      for (const [section, key] of keys) {
        expect(typeof json[section]?.[key], `${path}의 ${section}.${key} 없음`).toBe('string')
        expect(json[section][key].length, `${path}의 ${section}.${key} 비어있음`).toBeGreaterThan(0)
      }
      expect(json.errors.multipartFailed, `${path} multipartFailed에 {status} 없음`).toContain('{status}')
    }
  })
})

describe('i18n notification 업로드 취소 키', () => {
  it('모든 로케일에 cancel/cancelAll/uploadCancelled/uploadsCancelled가 있고 uploadsCancelled는 {count}를 쓴다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      for (const key of ['cancel', 'cancelAll', 'uploadCancelled', 'uploadsCancelled']) {
        expect(typeof json.notification[key], `${path}의 notification.${key} 없음`).toBe('string')
        expect(json.notification[key].length).toBeGreaterThan(0)
      }
      expect(json.notification.uploadsCancelled, path).toContain('{count}')
    }
  })
})

describe('i18n identity (기기 정체성)', () => {
  const ko = locales['./locales/ko.json'].default || locales['./locales/ko.json']
  const flat = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    )

  it('모든 로케일에 ko와 같은 identity 키 구조가 있어야 한다', () => {
    const expected = flat(ko.identity).sort()
    expect(expected.length).toBeGreaterThan(20)
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      expect(json.identity, `${path}에 identity 섹션 없음`).toBeTruthy()
      expect(flat(json.identity).sort(), `${path} identity 키 불일치`).toEqual(expected)
    }
  })

  it('형용사 24개/동물 24개, 비어 있지 않고, 활용형 구분자(/)와 성별 문자열이 올바르다', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const { identity } = mod.default || mod
      expect(identity.adj, `${path} adj`).toHaveLength(24)
      expect(identity.animal, `${path} animal`).toHaveLength(24)
      for (const word of [...identity.adj, ...identity.animal]) {
        expect(typeof word === 'string' && word.trim().length > 0, `${path} 빈 이름`).toBe(true)
        expect(word, `${path}: 특수문자`).not.toMatch(/[|@{}]/)
      }
      expect(identity.gender === '-' || identity.gender === '' || /^[mfn]{24}$/.test(identity.gender), `${path} gender`).toBe(true)
      if (/^[mfn]{24}$/.test(identity.gender)) {
        // 성별이 있는 언어는 어순 상관없이 모든 형용사가 최소 1개의 활용형을 갖는다
        for (const adj of identity.adj) expect(adj.split('/').every(Boolean), `${path} 활용형 ${adj}`).toBe(true)
      }
      expect(identity.nameFormat, `${path} nameFormat`).toContain('{adj}')
      expect(identity.nameFormat, `${path} nameFormat`).toContain('{animal}')
    }
  })

  it('형용사/동물 이름이 로케일 안에서 중복되지 않는다', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const { identity } = mod.default || mod
      expect(new Set(identity.animal).size, `${path} animal 중복`).toBe(24)
      expect(new Set(identity.adj).size, `${path} adj 중복`).toBe(24)
    }
  })

  it('자리표시자가 필요한 문구에 모두 들어 있다', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const { identity } = mod.default || mod
      expect(identity.connectedAs, `${path} connectedAs`).toMatch(/\{name\}/)
      expect(identity.connectedAs, `${path} connectedAs`).toMatch(/\{device\}/)
      expect(identity.connectedAs, `${path} connectedAs`).toMatch(/\{browser\}/)
      expect(identity.toastJoined, `${path} toastJoined`).toMatch(/\{desc\}/)
      expect(identity.youAre, `${path} youAre`).toMatch(/\{name\}/)
      expect(identity.listTitle, `${path} listTitle`).toMatch(/\{count\}/)
      expect(identity.joinedAgo, `${path} joinedAgo`).toMatch(/\{time\}/)
    }
  })
})
