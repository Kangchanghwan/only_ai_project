/**
 * 잠긴 파일 QR·링크.
 *
 * 형식: {origin}/#/lk?r={roomId}&i={id}&v={verifier}&k={파일 키}
 * - v: 서버가 다운로드 URL을 내주는 확인값 (비밀번호에서 파생, 32B base64url)
 * - k: 이 파일 하나의 키 DK (32B base64url). 비밀번호 자체나 다른 파일을 푸는 encKey는 넣지 않는다.
 * - 전부 # 뒤(fragment)에 있어 서버·CDN 요청에는 실리지 않는다.
 *   index.html이 분석 스크립트보다 먼저 주소창에서 지우고 window.__csLockedLink에만 남긴다.
 * 이 링크(또는 QR 사진)를 가진 사람은 비밀번호 없이 이 파일을 받을 수 있다.
 */

export const LOCKED_LINK_PREFIX = '#/lk?'

const B64U_32 = /^[A-Za-z0-9_-]{43}$/
const ROOM_ID = /^[A-Za-z0-9-]{1,100}$/
const LOCK_ID = /^[0-9a-f]{32}$/

/** 링크를 만든다 */
export function buildLockedLink(origin, { roomId, id, verifier, key }) {
  const q = new URLSearchParams({ r: roomId, i: id, v: verifier, k: key })
  return `${origin}/${LOCKED_LINK_PREFIX}${q.toString()}`
}

/**
 * 해시를 읽는다. 형식이 맞지 않으면 null.
 * @param {string} hash '#/lk?...'
 * @returns {{roomId:string,id:string,verifier:string,key:string}|null}
 */
export function parseLockedLink(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(LOCKED_LINK_PREFIX)) return null
  const q = new URLSearchParams(hash.slice(LOCKED_LINK_PREFIX.length))
  const roomId = q.get('r') || ''
  const id = q.get('i') || ''
  const verifier = q.get('v') || ''
  const key = q.get('k') || ''
  if (!ROOM_ID.test(roomId) || !LOCK_ID.test(id) || !B64U_32.test(verifier) || !B64U_32.test(key)) return null
  return { roomId, id, verifier, key }
}
