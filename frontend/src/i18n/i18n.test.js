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
