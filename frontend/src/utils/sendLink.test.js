import { describe, it, expect } from 'vitest'
import { parseSendLink, buildSendLink, SEND_LINK_MAX_CHARS } from './sendLink.js'

describe('sendLink', () => {
  it('#/send?t= 텍스트를 디코딩한다', () => {
    expect(parseSendLink('#/send?t=' + encodeURIComponent('안녕 https://a.b/?x=1&y=2'))).toBe('안녕 https://a.b/?x=1&y=2')
  })
  it('다른 해시·빈 값·공백만 있으면 null', () => {
    expect(parseSendLink('')).toBeNull()
    expect(parseSendLink('#/lk?r=1')).toBeNull()
    expect(parseSendLink('#/send?t=')).toBeNull()
    expect(parseSendLink('#/send?t=%20%20')).toBeNull()
    expect(parseSendLink(undefined)).toBeNull()
  })
  it('최대 길이로 자른다', () => {
    expect(parseSendLink('#/send?t=' + 'a'.repeat(SEND_LINK_MAX_CHARS + 50)).length).toBe(SEND_LINK_MAX_CHARS)
  })
  it('build → parse 왕복', () => {
    const link = buildSendLink('https://www.clipboardapp.org', '줄1\n줄2 #태그 100%')
    expect(link.startsWith('https://www.clipboardapp.org/#/send?t=')).toBe(true)
    expect(parseSendLink(link.slice(link.indexOf('#')))).toBe('줄1\n줄2 #태그 100%')
  })
})

describe('consumePendingSendLink', () => {
  it('window.__csSendLink를 한 번만 꺼내고 지운다', async () => {
    const { consumePendingSendLink } = await import('./sendLink.js')
    const win = { __csSendLink: '#/send?t=' + encodeURIComponent('두 번째 링크') }
    expect(consumePendingSendLink(win)).toBe('두 번째 링크')
    expect(win.__csSendLink).toBeUndefined()
    expect(consumePendingSendLink(win)).toBeNull()
  })
})
