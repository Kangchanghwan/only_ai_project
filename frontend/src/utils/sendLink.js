/**
 * 텍스트 미리 채우기 링크: https://www.clipboardapp.org/#/send?t=<encodeURIComponent(text)>
 * - AI 어시스턴트·사람이 링크만 만들어 주면 열자마자 텍스트 입력란이 채워진다.
 * - 자동 전송하지 않는다. 사용자가(또는 사용자의 브라우저 에이전트가) '공유'를 눌러야 보낸다.
 * - 공유 범위(같은 네트워크/전체 공유)는 링크로 바꿀 수 없다. 지금 고른 탭 그대로.
 * - '#' 뒤라 서버로 가지 않고, index.html이 분석 스크립트보다 먼저 주소창·기록에서 지운다.
 */
export const SEND_LINK_PREFIX = '#/send?'
export const SEND_LINK_MAX_CHARS = 20000

/** @returns {string|null} 미리 채울 텍스트 (형식이 틀리거나 비어 있으면 null) */
export function parseSendLink(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(SEND_LINK_PREFIX)) return null
  try {
    const text = new URLSearchParams(hash.slice(SEND_LINK_PREFIX.length)).get('t')
    if (!text || !text.trim()) return null
    return text.slice(0, SEND_LINK_MAX_CHARS)
  } catch {
    return null
  }
}

/** @returns {string} origin + '/#/send?t=...' */
export function buildSendLink(origin, text) {
  return `${origin}/${SEND_LINK_PREFIX}t=${encodeURIComponent(text)}`
}
