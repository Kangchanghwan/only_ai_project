import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18n from '../i18n/index.js'
import { t } from '../i18n/translate.js'
import {
  ANIMALS,
  ADJ_COUNT,
  ANIMAL_COUNT,
  animalSrc,
  identityName,
  describeConnected,
  describeJoined,
  deviceName,
  deviceAndBrowser,
  koEuro,
  koGa,
  formatRelativeTime,
  saveIdentity,
  loadIdentity,
  collectClientHints,
  isValidIdentity,
  sameIdentity
} from './identity.js'

const setLocale = (code) => { i18n.global.locale.value = code }

describe('identityName (보는 사람 언어로 표시)', () => {
  afterEach(() => setLocale('ko'))

  it('ko: "졸린 판다"', () => {
    setLocale('ko')
    expect(identityName({ adj: 0, animal: 0 }, t)).toBe('졸린 판다')
    expect(identityName({ adj: 1, animal: 1 }, t)).toBe('용감한 여우')
  })

  it('en: "Sleepy Panda"', () => {
    setLocale('en')
    expect(identityName({ adj: 0, animal: 0 }, t)).toBe('Sleepy Panda')
    expect(identityName({ adj: 1, animal: 1 }, t)).toBe('Brave Fox')
  })

  it('같은 인덱스가 로케일마다 다른 이름으로 번역된다 (일본어는 붙여 쓴다)', () => {
    setLocale('ja')
    expect(identityName({ adj: 0, animal: 0 }, t)).toBe('眠たいパンダ')
  })

  it('접미 번호가 있으면 이름 뒤에 붙인다', () => {
    setLocale('en')
    expect(identityName({ adj: 0, animal: 0, suffix: 2 }, t)).toBe('Sleepy Panda 2')
  })

  it('성별이 있는 언어는 동물 성별에 맞는 형용사 활용형을 쓴다 (fr: 고양이 m / 개구리 f)', () => {
    setLocale('fr')
    expect(identityName({ adj: 0, animal: 2 }, t)).toBe('Chat Endormi')
    expect(identityName({ adj: 0, animal: 11 }, t)).toBe('Grenouille Endormie')
  })

  it('독일어는 관사 없는 어미 변화(er/e/es)를 쓴다', () => {
    setLocale('de')
    expect(identityName({ adj: 0, animal: 3 }, t)).toBe('Schläfriger Hund')
    expect(identityName({ adj: 0, animal: 2 }, t)).toBe('Schläfrige Katze')
    expect(identityName({ adj: 0, animal: 4 }, t)).toBe('Schläfriges Kaninchen')
  })

  it('잘못된 identity는 빈 문자열', () => {
    expect(identityName(null, t)).toBe('')
    expect(identityName({ adj: 99, animal: 0 }, t)).toBe('')
  })
})

describe('조사 처리', () => {
  it("'으로/로': 받침 없음·ㄹ받침은 '로', 그 외는 '으로'", () => {
    expect(koEuro('크롬')).toBe('으로')
    expect(koEuro('사파리')).toBe('로')
    expect(koEuro('웨일')).toBe('로')
    expect(koEuro('엣지')).toBe('로')
    expect(koEuro('Edge')).toBe('로')
  })
  it("'이/가'", () => {
    expect(koGa('용감한 여우')).toBe('가')
    expect(koGa('졸린 판다')).toBe('가')
    expect(koGa('행복한 곰')).toBe('이')
  })
})

describe('기기/브라우저 표기', () => {
  afterEach(() => setLocale('ko'))
  const fox = { adj: 1, animal: 1 }

  it('ko: "Android 크롬으로 접속한 용감한 여우"', () => {
    setLocale('ko')
    const d = { identity: fox, deviceLabel: 'android_phone', browser: 'Chrome' }
    expect(describeConnected(d, t)).toBe('Android 크롬으로 접속한 용감한 여우')
  })

  it('ko: 받침 없는 브라우저(사파리)는 "로"', () => {
    setLocale('ko')
    const d = { identity: fox, deviceLabel: 'iphone', browser: 'Safari' }
    expect(describeConnected(d, t)).toBe('iPhone 사파리로 접속한 용감한 여우')
  })

  it('en: "Brave Fox on Android Chrome"', () => {
    setLocale('en')
    const d = { identity: fox, deviceLabel: 'android_phone', browser: 'Chrome' }
    expect(describeConnected(d, t)).toBe('Brave Fox on Android Chrome')
  })

  it('안드로이드 기종명을 알면 기종명으로 표시, 삼성/갤럭시 라벨', () => {
    setLocale('en')
    expect(deviceName({ deviceLabel: 'android_phone', model: 'Pixel 8' }, t)).toBe('Pixel 8')
    expect(deviceName({ deviceLabel: 'galaxy' }, t)).toBe('Galaxy')
    expect(deviceAndBrowser({ deviceLabel: 'mac', browser: 'Samsung Internet' }, t)).toBe('Mac Samsung Internet')
    setLocale('ko')
    expect(deviceAndBrowser({ deviceLabel: 'mac', browser: 'Chrome' }, t)).toBe('Mac 크롬')
    expect(deviceAndBrowser({ deviceLabel: 'galaxy', browser: 'KakaoTalk' }, t)).toBe('갤럭시 카카오톡')
  })

  it('알 수 없는 라벨/브라우저는 일반 표기로', () => {
    setLocale('en')
    expect(deviceName({ deviceLabel: 'weird' }, t)).toBe('device')
    expect(deviceAndBrowser({ deviceLabel: 'mac', browser: 'Mystery' }, t)).toBe('Mac browser')
  })

  it('새 기기 토스트: "🦊 Android 크롬으로 접속한 용감한 여우가 들어왔어요"', () => {
    setLocale('ko')
    const d = { identity: fox, deviceLabel: 'android_phone', browser: 'Chrome' }
    expect(describeJoined(d, t)).toBe('🦊 Android 크롬으로 접속한 용감한 여우가 들어왔어요')
  })
})

describe('동물 자산', () => {
  it('동물 24종 모두 SVG URL을 갖는다', () => {
    expect(ANIMALS).toHaveLength(ANIMAL_COUNT)
    expect(ADJ_COUNT).toBe(24)
    for (let i = 0; i < ANIMAL_COUNT; i++) expect(animalSrc(i), `animal ${i}`).toBeTruthy()
    expect(animalSrc(99)).toBeNull()
  })
})

describe('identity 비교/검증', () => {
  it('유효성', () => {
    expect(isValidIdentity({ adj: 0, animal: 23 })).toBe(true)
    expect(isValidIdentity({ adj: 24, animal: 0 })).toBe(false)
    expect(isValidIdentity(undefined)).toBe(false)
  })
  it('같은 조합 비교 (suffix 포함)', () => {
    expect(sameIdentity({ adj: 1, animal: 2 }, { adj: 1, animal: 2 })).toBe(true)
    expect(sameIdentity({ adj: 1, animal: 2 }, { adj: 1, animal: 2, suffix: 2 })).toBe(false)
    expect(sameIdentity(null, { adj: 1, animal: 2 })).toBe(false)
  })
})

describe('상대 시간', () => {
  it('방금/분/시간/일 단위', () => {
    const now = 1_000_000_000_000
    expect(formatRelativeTime(now - 10_000, 'en', now)).toBe('now')
    expect(formatRelativeTime(now - 3 * 60_000, 'en', now)).toBe('3 minutes ago')
    expect(formatRelativeTime(now - 3 * 60_000, 'ko', now)).toBe('3분 전')
    expect(formatRelativeTime(now - 2 * 3600_000, 'en', now)).toBe('2 hours ago')
    expect(formatRelativeTime(now - 2 * 86400_000, 'en', now)).toBe('2 days ago')
  })
})

describe('저장된 정체성 (30일)', () => {
  beforeEach(() => localStorage.clear())

  it('저장 후 불러온다 (suffix는 저장하지 않는다)', () => {
    saveIdentity({ adj: 3, animal: 4, suffix: 2 }, 1000)
    expect(loadIdentity(1000 + 1000)).toEqual({ adj: 3, animal: 4 })
  })
  it('30일이 지나면 null', () => {
    saveIdentity({ adj: 3, animal: 4 }, 0)
    expect(loadIdentity(30 * 86400_000)).toEqual({ adj: 3, animal: 4 })
    expect(loadIdentity(30 * 86400_000 + 1)).toBeNull()
  })
  it('손상된 값/잘못된 identity는 무시', () => {
    localStorage.setItem('clipboard-identity', '{oops')
    expect(loadIdentity()).toBeNull()
    saveIdentity({ adj: 99, animal: 0 })
    expect(localStorage.getItem('clipboard-identity')).toBe('{oops')
  })
})

describe('collectClientHints', () => {
  it('터치 지점 수와 UA-CH 기종을 모은다', async () => {
    const hints = await collectClientHints({
      maxTouchPoints: 5,
      userAgentData: { getHighEntropyValues: vi.fn().mockResolvedValue({ model: 'Pixel 8' }) }
    })
    expect(hints).toEqual({ maxTouchPoints: 5, model: 'Pixel 8' })
  })
  it('UA-CH가 없거나 실패해도 조용히 넘어간다', async () => {
    expect(await collectClientHints({ maxTouchPoints: 0 })).toEqual({ maxTouchPoints: 0 })
    const failing = { userAgentData: { getHighEntropyValues: vi.fn().mockRejectedValue(new Error('x')) } }
    expect(await collectClientHints(failing)).toEqual({})
  })
  it('빈 model은 보내지 않는다', async () => {
    const hints = await collectClientHints({ userAgentData: { getHighEntropyValues: async () => ({ model: '' }) } })
    expect(hints).toEqual({})
  })
})
