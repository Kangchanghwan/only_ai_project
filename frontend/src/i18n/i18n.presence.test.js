import { describe, it, expect } from 'vitest'
import i18n from './index.js'

const locales = import.meta.glob('./locales/*.json', { eager: true })
const entries = Object.entries(locales).map(([path, mod]) => [path.match(/([a-z]+)\.json$/)[1], mod.default || mod])
const KEYS = { joinedIp: ['{who}'], leftIp: ['{who}'], joinedRoom: ['{room}', '{who}'], leftRoom: ['{room}', '{who}'] }

describe('i18n 입장·퇴장 토스트(presence)', () => {
  it('21개 로케일 모두 키와 자리표시자가 있다 (방 토스트는 방 이름 포함)', () => {
    expect(entries.length).toBe(21)
    for (const [lang, json] of entries) {
      for (const [key, ph] of Object.entries(KEYS)) {
        const v = json.presence?.[key]
        expect(typeof v === 'string' && v.length > 0, `${lang}.presence.${key}`).toBe(true)
        for (const x of ph) expect(v.includes(x), `${lang}.presence.${key} ${x}`).toBe(true)
      }
    }
  })

  it('한국어: 어느 방인지와 조사가 맞게 나온다', () => {
    const t = (k, p) => i18n.global.t(k, p)
    i18n.global.locale.value = 'ko'
    expect(t('presence.joinedIp', { who: '🐙 Mac 크롬으로 접속한 반짝이는 문어' })).toBe('같은 네트워크에 🐙 Mac 크롬으로 접속한 반짝이는 문어가 들어왔어요')
    expect(t('presence.leftRoom', { room: '날쌘 코알라의 방', who: '🐻 조용한 곰' })).toBe("'날쌘 코알라의 방'에서 🐻 조용한 곰이 나갔어요")
  })
})

describe('i18n 도착 알림(inRoom)', () => {
  it('21개 로케일 모두 {where}가 들어간 세 문구가 있다', () => {
    for (const [lang, json] of entries) {
      for (const key of ['textArrived', 'fileArrived', 'textsCleared']) {
        const v = json.inRoom?.[key]
        expect(typeof v === 'string' && v.includes('{where}'), `${lang}.inRoom.${key}`).toBe(true)
      }
    }
  })
})
