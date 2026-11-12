import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const mod = (code) => {
  const m = locales[`./locales/${code}.json`]
  return m.default || m
}

describe('i18n 방 합치기: 예전 방 초대 안내 문구', () => {
  const keys = ['room.legacyInviteTitle', 'room.legacyInviteBody', 'room.legacyInviteCreate']

  it('21개 로케일 모두 새 키가 있고, 영어와 다르다(en 제외)', () => {
    const entries = Object.entries(locales)
    expect(entries).toHaveLength(21)
    const en = mod('en')
    for (const [path, m] of entries) {
      const json = m.default || m
      for (const key of keys) {
        const v = get(json, key)
        expect(typeof v, `${path}의 ${key} 없음`).toBe('string')
        expect(v.length).toBeGreaterThan(0)
        if (!path.endsWith('en.json')) expect(v, `${path}의 ${key}가 영어와 동일`).not.toBe(get(en, key))
      }
    }
  })

  it('ko 문구는 정해진 그대로다', () => {
    const ko = mod('ko')
    expect(get(ko, 'room.legacyInviteTitle')).toBe('예전 방식으로 만든 방이라 초대할 수 없어요')
    expect(get(ko, 'room.legacyInviteBody')).toBe('새 방을 만들어 이 기기와 다른 기기를 함께 넣어 주세요')
    expect(get(ko, 'room.legacyInviteCreate')).toBe('새 방 만들기')
  })
})

describe('i18n 방 합치기: 화면 문구에 "1:1"이 없다', () => {
  for (const code of ['ko', 'en']) {
    for (const block of ['pair', 'group', 'text', 'dropOverlay']) {
      it(`${code}.${block} 블록`, () => {
        expect(JSON.stringify(mod(code)[block])).not.toContain('1:1')
      })
    }
  }
})
