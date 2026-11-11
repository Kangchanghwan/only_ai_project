import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })

describe('i18n arrival 도착 알림(푸시) 문구', () => {
  const keys = ['pushEnable', 'pushOn', 'pushOff', 'pushEnabled', 'pushDisabled', 'pushError']
  const en = locales['./locales/en.json'].default || locales['./locales/en.json']

  it('21개 로케일 모두 arrival 푸시 키가 있고, 영어 원문을 그대로 복사하지 않았다(en 제외)', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      for (const key of keys) {
        const v = json.arrival?.[key]
        expect(typeof v, `${path}의 arrival.${key} 없음`).toBe('string')
        expect(v.length).toBeGreaterThan(0)
        if (!path.endsWith('en.json')) expect(v, `${path}의 arrival.${key}가 영어와 동일`).not.toBe(en.arrival[key])
      }
    }
  })

  it('기존 arrival 키 뒤에 이어 붙어 있다 (병합 충돌 방지용 위치)', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      const order = Object.keys(json.arrival)
      expect(order.slice(-keys.length), `${path} arrival 키 순서`).toEqual(keys)
      expect(order.slice(0, 6), `${path} 기존 키`).toEqual(['notifyPrompt', 'notifyEnable', 'notifyDismiss', 'notifyFile', 'notifyText', 'someDevice'])
    }
  })

  it('금지 문구와 em dash가 없다', () => {
    const banned = ['P2P로 직접 전송', '영구 보관', '완벽한 보안', '해킹 불가', '모든 데이터를 암호화', '최대 100MB', '—']
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      for (const key of keys) for (const b of banned) expect(json.arrival[key], `${path} ${key}`).not.toContain(b)
    }
  })
})
