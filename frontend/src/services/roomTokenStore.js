/**
 * 룸 토큰 저장소
 *
 * 백엔드는 소켓 등록(registered) 때 룸별 토큰을 주고, 파일 목록 조회·업로드·삭제 API는
 * X-Room-Token 헤더로 이 토큰을 요구한다. roomId는 공유 링크에 노출되므로 roomId만으로는
 * 다른 사람 룸의 파일을 건드릴 수 없게 하기 위함이다.
 *
 * - 토큰은 메모리에만 둔다 (URL·localStorage에 남기지 않음).
 * - 만료 시각은 서버 시계가 아니라 "받은 시점 + ttl" 로 계산해 기기 시계 오차에 영향받지 않는다.
 * - 구버전 백엔드는 토큰을 주지 않는다. 그때는 헤더를 아예 보내지 않아 CORS preflight가
 *   깨지지 않게 한다 (프론트가 먼저 배포돼도 안전).
 */

/** 만료까지 이 시간 이하로 남으면 미리 재발급한다 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/** @type {Map<string, {token: string, expiresAt: number}>} */
const tokens = new Map()

/** 서버가 한 번이라도 토큰을 발급했는지 (구버전 백엔드 판별) */
let issuedByServer = false

/** @type {null | (() => Promise<{roomTokens?: Record<string,string>, roomTokenTtlSec?: number}>)} */
let refresher = null

/** 진행 중인 재발급 요청 (동시 요청 합치기) */
let inflightRefresh = null

/**
 * 서버가 준 토큰 묶음을 저장한다.
 * @param {{roomTokens?: Record<string,string>, roomTokenTtlSec?: number} | null | undefined} payload
 */
export function setRoomTokens(payload) {
  const roomTokens = payload?.roomTokens
  const ttlSec = Number(payload?.roomTokenTtlSec)
  if (!roomTokens || typeof roomTokens !== 'object' || !(ttlSec > 0)) return

  const expiresAt = Date.now() + ttlSec * 1000
  for (const [roomId, token] of Object.entries(roomTokens)) {
    if (typeof token === 'string' && token) {
      tokens.set(roomId, { token, expiresAt })
      issuedByServer = true
    }
  }
}

/**
 * 토큰 재발급 함수를 등록한다 (socketService가 소켓 ack로 구현).
 * @param {null | (() => Promise<object>)} fn
 */
export function setRoomTokenRefresher(fn) {
  refresher = typeof fn === 'function' ? fn : null
}

/** 특정 룸 토큰을 버린다 (401을 받았을 때 다음 호출에서 재발급하도록) */
export function invalidateRoomToken(roomId) {
  tokens.delete(roomId)
}

/** 모든 토큰을 지운다 (의도적 연결 해제 시) */
export function clearRoomTokens() {
  tokens.clear()
  issuedByServer = false
  inflightRefresh = null
}

async function refreshTokens() {
  if (!refresher) return
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        setRoomTokens(await refresher())
      } catch (error) {
        console.warn('[roomTokenStore] 룸 토큰 재발급 실패:', error?.message || error)
      } finally {
        inflightRefresh = null
      }
    })()
  }
  await inflightRefresh
}

/**
 * roomId의 유효한 토큰을 돌려준다. 만료가 가까우면 재발급을 시도한다.
 * 서버가 토큰을 발급한 적이 없으면(구버전 백엔드) null.
 * @param {string} roomId
 * @returns {Promise<string|null>}
 */
export async function getRoomToken(roomId) {
  if (!roomId) return null

  const entry = tokens.get(roomId)
  if (entry && entry.expiresAt - Date.now() > REFRESH_MARGIN_MS) return entry.token

  if (!issuedByServer) return null

  await refreshTokens()
  const next = tokens.get(roomId)
  if (next && next.expiresAt > Date.now()) return next.token

  // 재발급에 실패했더라도 아직 만료 전이면 기존 토큰을 쓴다
  return entry && entry.expiresAt > Date.now() ? entry.token : null
}

/**
 * fetch 헤더에 합칠 인증 헤더. 토큰이 없으면 빈 객체 (헤더 자체를 보내지 않음).
 * @param {string} roomId
 * @returns {Promise<Record<string, string>>}
 */
export async function roomAuthHeaders(roomId) {
  const token = await getRoomToken(roomId)
  return token ? { 'X-Room-Token': token } : {}
}

/** 테스트 전용: 내부 상태 확인 */
export function _hasRoomToken(roomId) {
  return tokens.has(roomId)
}
