import { describe, it, expect } from 'vitest'

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
