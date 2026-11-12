import { describe, it, expect } from 'vitest'
import { PICTURE_IDS } from '../utils/pictureCode.js'

const locales = import.meta.glob('./locales/*.json', { eager: true })
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const en = locales['./locales/en.json'].default || locales['./locales/en.json']

const KEYS = [
  'tabPicture', 'tabQr', 'tabLink', 'showTitle', 'expiresIn', 'renew', 'enter', 'enterTitle', 'clear', 'confirm',
  'waiting', 'wrong', 'warn', 'wait', 'declined', 'timeout', 'busy', 'requestTitle', 'requestDevice', 'approve',
  'reject', 'approved', 'slotLabel', 'slotEmpty', 'pickerLabel', 'openFailed',
  'addTitle', 'addCreateTitle', 'addCreateDesc', 'addEnterDesc', 'showNote'
].map((k) => `code.${k}`)
const PIC_KEYS = PICTURE_IDS.map((id) => `code.pic.${id}`)
/** 로케일과 무관하게 같을 수 있는 키(약어 QR, 외래어 Link, 자리표시자만 있는 키) */
const MAY_EQUAL_EN = new Set(['code.tabQr', 'code.tabLink', 'code.requestDevice'])
/** 영어와 같은 단어를 쓰는 언어가 흔한 라틴 문자 로케일(그림 이름 일부: Pizza, Hamburger 등)은 영어와 달라야 한다고 요구하지 않는다 */
const NON_LATIN = ['ko', 'ja', 'zh', 'ru', 'uk', 'ar', 'fa']

const entries = Object.entries(locales).map(([path, mod]) => [path.match(/([a-z]+)\.json$/)[1], mod.default || mod])

describe('i18n 그림 코드(code) 블록', () => {
  it('로케일 21개가 모두 있다', () => {
    expect(entries.length).toBe(21)
  })

  it('21개 로케일 모두 code 블록 키가 있고, 영어 원문을 그대로 복사하지 않았다(en 제외)', () => {
    for (const [lang, json] of entries) {
      for (const key of KEYS) {
        const v = get(json, key)
        expect(typeof v, `${lang}의 ${key} 없음`).toBe('string')
        expect(v.length, `${lang}의 ${key} 빈 문자열`).toBeGreaterThan(0)
        if (lang !== 'en' && !MAY_EQUAL_EN.has(key)) expect(v, `${lang}의 ${key}가 영어와 동일`).not.toBe(get(en, key))
      }
    }
  })

  it('그림 이름 24개가 21개 로케일에 모두 있고, 비라틴 문자 로케일은 영어와 다르다', () => {
    expect(PIC_KEYS).toHaveLength(24)
    for (const [lang, json] of entries) {
      for (const key of PIC_KEYS) {
        const v = get(json, key)
        expect(typeof v, `${lang}의 ${key} 없음`).toBe('string')
        expect(v.trim().length).toBeGreaterThan(0)
        if (NON_LATIN.includes(lang)) expect(v, `${lang}의 ${key}가 영어와 동일`).not.toBe(get(en, key))
      }
    }
  })

  it('치환 자리표시자가 모든 로케일에서 유지된다', () => {
    const need = {
      'code.expiresIn': ['{min}', '{sec}'],
      'code.wait': ['{sec}'],
      'code.requestTitle': ['{name}'],
      'code.requestDevice': ['{device}'],
      'code.approved': ['{name}'],
      'code.slotLabel': ['{n}', '{name}'],
      'code.slotEmpty': ['{n}']
    }
    for (const [lang, json] of entries) {
      for (const [key, phs] of Object.entries(need)) for (const ph of phs) expect(get(json, key), `${lang} ${key}`).toContain(ph)
    }
  })

  it('code 블록은 group 블록 바로 뒤에 있다(다른 작업과의 병합 충돌을 줄이기 위한 위치)', () => {
    for (const [lang, json] of entries) {
      const keys = Object.keys(json)
      expect(keys[keys.indexOf('group') + 1], `${lang}`).toBe('code')
    }
  })

  it('code 블록의 마지막 키는 pic 뒤에 추가한 방 추가 시트 문구다(append 위치)', () => {
    for (const [lang, json] of entries) {
      const keys = Object.keys(json.code)
      expect(keys.slice(-6), `${lang}`).toEqual(['pic', 'addTitle', 'addCreateTitle', 'addCreateDesc', 'addEnterDesc', 'showNote'])
    }
  })

  it('한국어 문구에 em dash가 없다', () => {
    const ko = entries.find(([l]) => l === 'ko')[1]
    expect(JSON.stringify(ko.code)).not.toContain('—')
  })
})

describe('code.showNote는 각 언어의 승인 버튼 이름을 그대로 담는다', () => {
  for (const file of Object.keys(locales)) {
    const lang = file.match(/([a-z]{2})\.json$/)[1]
    it(lang, () => {
      const c = (locales[file].default || locales[file]).code
      expect(c.showNote.includes(c.approve), lang).toBe(true)
    })
  }
})
