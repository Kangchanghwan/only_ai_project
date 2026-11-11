/**
 * 그룹 방 초대 링크·QR.
 *
 * 형식: {origin}/#/pv?r={roomId}&t={초대 입장권}&k={방 비밀 32바이트 base64url}&n={방 이름}
 * - 전부 # 뒤(fragment)라 서버·CDN 요청에는 실리지 않는다.
 *   index.html이 분석 스크립트보다 먼저 주소창에서 지우고 window.__csGroupInvite에만 남긴다.
 * - 이 링크(또는 QR 사진)를 가진 사람은 누구나 초대 입장권이 살아 있는 동안(기본 10분) 방에 들어올 수 있다.
 *   링크를 열어도 자동으로 들어가지 않는다: 확인 시트에서 "들어가기"를 눌러야 한다.
 * - 방 비밀과 입장권은 로그·분석 이벤트에 남기지 않는다.
 */
import { b64u, fromB64u } from './lockCrypto.js'
import { isGroupRoomId } from './groupRoom.js'

export const GROUP_INVITE_PREFIX = '#/pv?'
export const INVITE_NAME_MAX = 20
const TICKET_MAX = 200
const B64U_32 = /^[A-Za-z0-9_-]{43}$/
// 제어문자(C0·DEL·C1), 줄바꿈 계열 구분자, 글자 방향을 바꾸는 문자(이름이 다른 글자 위로 뒤집혀 보이는 것을 막는다)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g

/** 방 이름 정리: 제어문자 제거 → trim → 20자(코드포인트 기준)까지 */
export function sanitizeRoomName(name) {
  const cleaned = String(name ?? '').replace(CONTROL_CHARS, '').trim()
  return Array.from(cleaned).slice(0, INVITE_NAME_MAX).join('').trim()
}

/**
 * 초대 링크를 만든다.
 * @param {string} origin
 * @param {{roomId: string, ticket: string, secret: Uint8Array, name?: string}} p
 */
export function buildInviteUrl(origin, { roomId, ticket, secret, name = '' }) {
  const q = new URLSearchParams({ r: roomId, t: ticket, k: b64u(secret) })
  const n = sanitizeRoomName(name)
  if (n) q.set('n', n)
  return `${origin}/${GROUP_INVITE_PREFIX}${q.toString()}`
}

/**
 * 해시를 읽는다. 형식이 하나라도 틀리면 null.
 * @param {string} hash '#/pv?...'
 * @returns {{roomId: string, ticket: string, secret: Uint8Array, name: string}|null} name은 없으면 ''
 */
export function parseInvite(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(GROUP_INVITE_PREFIX)) return null
  const q = new URLSearchParams(hash.slice(GROUP_INVITE_PREFIX.length))
  const roomId = q.get('r') || ''
  const ticket = q.get('t') || ''
  const k = q.get('k') || ''
  if (!isGroupRoomId(roomId)) return null
  if (!ticket.startsWith('pv1.') || ticket.length > TICKET_MAX) return null
  if (!B64U_32.test(k)) return null
  let secret
  try { secret = fromB64u(k) } catch { return null }
  if (secret.length !== 32) return null
  return { roomId, ticket, secret, name: sanitizeRoomName(q.get('n') || '') }
}
