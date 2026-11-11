import { describe, it, expect } from 'vitest'
import { buildInviteUrl, parseInvite, sanitizeRoomName, GROUP_INVITE_PREFIX } from './groupInvite.js'
import { isGroupRoomId } from './groupRoom.js'
import { b64u } from './lockCrypto.js'
import { buildLockedLink, parseLockedLink } from './lockedLink.js'
import { parseRoute } from './router.js'

const ROOM = 'prv-g-' + 'ab12'.repeat(6)
const secret = () => Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 1)
const TICKET = 'pv1.' + ROOM + '.1800000000.' + 'A'.repeat(43)
const hashOf = (url) => url.slice(url.indexOf('#'))

describe('isGroupRoomId', () => {
  it('prv-g-<hex24>만 그룹 방, 1:1 형식과 잘못된 형식은 아니다', () => {
    expect(isGroupRoomId(ROOM)).toBe(true)
    expect(isGroupRoomId('prv-' + 'a'.repeat(24))).toBe(false)
    expect(isGroupRoomId('prv-g-' + 'a'.repeat(23))).toBe(false)
    expect(isGroupRoomId('prv-g-' + 'A'.repeat(24))).toBe(false)
    expect(isGroupRoomId('prv-g-' + 'a'.repeat(24) + 'x')).toBe(false)
    expect(isGroupRoomId(undefined)).toBe(false)
  })
})

describe('그룹 방 초대 링크', () => {
  it('왕복: 만든 링크를 읽으면 같은 값이 나온다 (전부 # 뒤라 서버로 가지 않는다)', () => {
    const url = buildInviteUrl('https://www.clipboardapp.org', { roomId: ROOM, ticket: TICKET, secret: secret(), name: '내 방 & 친구들' })
    expect(url.startsWith('https://www.clipboardapp.org/#/pv?')).toBe(true)
    expect(new URL(url).search).toBe('')
    const p = parseInvite(hashOf(url))
    expect(p.roomId).toBe(ROOM)
    expect(p.ticket).toBe(TICKET)
    expect(Array.from(p.secret)).toEqual(Array.from(secret()))
    expect(p.name).toBe('내 방 & 친구들')
  })

  it('이름이 없으면 name은 빈 문자열(기본 이름은 화면이 정한다)', () => {
    const url = buildInviteUrl('https://x.test', { roomId: ROOM, ticket: TICKET, secret: secret() })
    expect(url).not.toContain('&n=')
    expect(parseInvite(hashOf(url)).name).toBe('')
  })

  it('이름은 제어문자 제거·trim·20자 제한', () => {
    expect(sanitizeRoomName('  a\u0000b\nc\u202e  ')).toBe('abc')
    expect(sanitizeRoomName('가'.repeat(30))).toBe('가'.repeat(20))
    expect(sanitizeRoomName('\n\t ')).toBe('')
    const p = parseInvite(`${GROUP_INVITE_PREFIX}r=${ROOM}&t=${TICKET}&k=${b64u(secret())}&n=${encodeURIComponent('x\u0007y' + 'z'.repeat(40))}`)
    expect(p.name).toBe('xy' + 'z'.repeat(18))
  })

  const base = () => ({ r: ROOM, t: TICKET, k: b64u(secret()) })
  const hash = (o) => GROUP_INVITE_PREFIX + new URLSearchParams(o).toString()

  it('형식이 하나라도 틀리면 null', () => {
    expect(parseInvite(hash(base()))).not.toBeNull()
    expect(parseInvite(undefined)).toBeNull()
    expect(parseInvite('#/lk?r=x')).toBeNull()
    expect(parseInvite(hash({ ...base(), r: 'prv-' + 'a'.repeat(24) }))).toBeNull() // 1:1 방 ID
    expect(parseInvite(hash({ ...base(), r: 'room-shared' }))).toBeNull()
    expect(parseInvite(hash({ ...base(), r: '' }))).toBeNull()
    expect(parseInvite(hash({ ...base(), t: 'xx.' + ROOM }))).toBeNull() // pv1. 로 시작하지 않음
    expect(parseInvite(hash({ ...base(), t: 'pv1.' + 'a'.repeat(200) }))).toBeNull() // 200자 초과
    expect(parseInvite(hash({ ...base(), t: '' }))).toBeNull()
    expect(parseInvite(hash({ ...base(), k: b64u(new Uint8Array(31)) }))).toBeNull() // 32바이트가 아님
    expect(parseInvite(hash({ ...base(), k: b64u(new Uint8Array(33)) }))).toBeNull()
    expect(parseInvite(hash({ ...base(), k: 'not base64!' }))).toBeNull()
    expect(parseInvite(hash({ r: ROOM, t: TICKET }))).toBeNull() // k 없음
  })
})

describe('roomId 형식 검사 지점: 그룹 방 ID도 받는다', () => {
  it('잠긴 파일 링크(lockedLink.js)는 prv-g- roomId를 받는다', () => {
    const verifier = b64u(secret())
    const url = buildLockedLink('https://x.test', { roomId: ROOM, id: 'a'.repeat(32), verifier, key: verifier })
    expect(parseLockedLink(hashOf(url))).toMatchObject({ roomId: ROOM })
    expect(parseRoute(hashOf(url))).toMatchObject({ type: 'locked', roomId: ROOM })
  })

  it('router는 초대 링크(#/pv?)를 일반 화면(home)으로 둔다: 주소창에서 이미 지워져 있어야 한다', () => {
    expect(parseRoute(hashOf(buildInviteUrl('https://x.test', { roomId: ROOM, ticket: TICKET, secret: secret() }))).type).toBe('home')
  })
})
