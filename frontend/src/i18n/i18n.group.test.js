import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })

describe('i18n 그룹 방 문구', () => {
  const keys = [
    'create', 'createShort', 'defaultName', 'emptyCta', 'invite', 'inviteTitle', 'inviteCopy', 'inviteCopied', 'inviteExpiry',
    'inviteWarning', 'inviteInvalid', 'inviteExpired', 'joinTitle', 'joinBody', 'joinAction', 'cancel', 'close', 'joined',
    'alreadyIn', 'full', 'tooMany', 'members', 'alone', 'leave', 'leaveConfirm', 'unnamed'
  ]
  const en = locales['./locales/en.json'].default || locales['./locales/en.json']

  it('21개 로케일 모두 group 블록의 키가 있고, en이 아닌 로케일은 영어 원문과 다르다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      for (const key of keys) {
        const v = json.group?.[key]
        expect(typeof v, `${path}의 group.${key} 없음`).toBe('string')
        expect(v.length, `${path}의 group.${key} 비어 있음`).toBeGreaterThan(0)
        if (!path.endsWith('en.json')) expect(v, `${path}의 group.${key}가 영어와 동일`).not.toBe(en.group[key])
      }
    }
  })

  it('치환 자리표시자({name}, {n})가 모든 로케일에서 유지된다', () => {
    const need = { defaultName: '{name}', inviteTitle: '{name}', joinTitle: '{name}', joined: '{name}', members: '{n}' }
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      for (const [key, ph] of Object.entries(need)) expect(json.group[key], `${path} group.${key}`).toContain(ph)
    }
  })

  it('group 블록은 pair 블록이 있는 로케일에서 pair 바로 뒤에 온다', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const order = Object.keys(mod.default || mod)
      if (order.includes('pair')) expect(order[order.indexOf('pair') + 1], `${path} 블록 순서`).toBe('group')
    }
  })

  it('금지 문구(ops/content-rules.json)를 쓰지 않는다: 새 문구에 과장·보안 보증 표현이 없다', () => {
    const banned = ['P2P로 직접 전송', '영구 보관', '완벽한 보안', '해킹 불가', '모든 데이터를 암호화', '최대 100MB', 'peer-to-peer transfer']
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      for (const key of keys) for (const b of banned) expect(json.group[key], `${path} group.${key}`).not.toContain(b)
    }
  })
})
