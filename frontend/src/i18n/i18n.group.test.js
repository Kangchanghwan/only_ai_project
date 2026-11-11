import { describe, it, expect } from 'vitest'

const locales = import.meta.glob('./locales/*.json', { eager: true })

describe('i18n 그룹 방 문구', () => {
  const keys = [
    'create', 'createShort', 'defaultName', 'emptyCta', 'invite', 'inviteTitle', 'inviteCopy', 'inviteCopied', 'inviteExpiry',
    'inviteWarning', 'inviteInvalid', 'inviteExpired', 'joinTitle', 'joinBody', 'joinAction', 'cancel', 'close', 'joined',
    'alreadyIn', 'full', 'tooMany', 'members', 'alone', 'leave', 'leaveConfirm', 'unnamed',
    'textNote', 'expired', 'noRoom', 'leaveFailed', 'failed', 'dropTo'
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

  it('그룹 방 안에서 보이는 문구는 1:1 연결 표현을 쓰지 않는다 (group 블록 전체)', () => {
    for (const [path, mod] of Object.entries(locales)) {
      const json = mod.default || mod
      for (const [key, v] of Object.entries(json.group)) {
        expect(v, `${path} group.${key}`).not.toMatch(/1:1|１:１|۱:۱/)
      }
    }
  })

  it('ko: 방 이름이 이미 "방"으로 끝나므로 제목·토스트에 "방"을 또 붙이지 않는다', () => {
    const { group } = locales['./locales/ko.json'].default || locales['./locales/ko.json']
    expect(group.defaultName).toBe('{name}의 방')
    expect(group.inviteTitle).toBe("'{name}'에 초대하기")
    expect(group.joinTitle).toBe("'{name}'에 들어갈까요?")
    expect(group.joined).toBe("'{name}'에 들어왔어요")
    expect(group.textNote).toBe('방 키로 암호화해서 10분 보관')
    expect(group.expired).toBe('방 입장권이 만료됐어요. 초대를 다시 받아 주세요')
  })

  it('방 이름 뒤에 "방/room"을 또 붙이는 로케일이 없다 (기본 이름과 같은 단어가 제목에 반복되지 않는다)', () => {
    const roomWord = { tr: 'oda', vi: 'phòng' }
    for (const [loc, word] of Object.entries(roomWord)) {
      const { group } = locales[`./locales/${loc}.json`].default || locales[`./locales/${loc}.json`]
      for (const key of ['inviteTitle', 'joinTitle', 'joined']) {
        expect(group[key].replace('{name}', '').toLowerCase(), `${loc} group.${key}`).not.toContain(word)
      }
    }
  })
})
