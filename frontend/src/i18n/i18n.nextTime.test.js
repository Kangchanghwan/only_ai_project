import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })

describe('i18n 다음엔 더 빨리 안내(nextTime) 문구', () => {
  const keys = ['iosText', 'iosAction', 'installText', 'installAction', 'bookmarkText', 'close']
  const en = locales['./locales/en.json'].default || locales['./locales/en.json']

  it('21개 로케일 모두 nextTime 키가 있고, 영어 원문을 그대로 복사하지 않았다(en 제외)', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      for (const key of keys) {
        const v = json.nextTime?.[key]
        expect(typeof v, `${path}의 nextTime.${key} 없음`).toBe('string')
        expect(v.length).toBeGreaterThan(0)
        if (!path.endsWith('en.json')) expect(v, `${path}의 nextTime.${key}가 영어와 동일`).not.toBe(en.nextTime[key])
      }
    }
  })

  it('bookmarkText는 모든 로케일에서 {key}를 유지한다', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      expect(json.nextTime.bookmarkText, `${path} bookmarkText`).toContain('{key}')
    }
  })
})
