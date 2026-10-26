/**
 * 텍스트 대기열(10분 보관) API. 모두 룸 토큰(X-Room-Token)이 필요하다.
 *
 * 서버는 암호문만 보관한다 (1:1 방 키 또는 범위 비밀번호 잠금으로 이 기기에서 암호화한 것).
 * 백엔드는 프론트보다 늦게 배포되므로, 목록이 404면 구버전 백엔드로 보고 null을 돌려준다
 * (보관 없이 실시간 전달만 하는 기존 동작).
 */
import { r2Service } from './r2Service.js'

const api = () => r2Service.apiUrl

const postJson = (roomId, path, body) =>
  r2Service.fetchWithRoomAuth(roomId, `${api()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

async function readError(response) {
  let body = {}
  try { body = (await response.json()) || {} } catch { /* 본문 없음 */ }
  return Object.assign(new Error(body.error || `HTTP ${response.status}`), {
    code: body.code,
    status: response.status,
    remaining: typeof body.remaining === 'number' ? body.remaining : undefined
  })
}

export const textQueueService = {
  /**
   * 방의 보관 중 텍스트. 구버전 백엔드(404)면 null.
   * @returns {Promise<Array<object>|null>} text-shared 메시지 모양 (잠긴 텍스트는 enc 없이 lock.salt만)
   */
  async list(roomId) {
    const response = await r2Service.fetchWithRoomAuth(roomId, `${api()}/api/texts/${encodeURIComponent(roomId)}`)
    if (response.status === 404) return null
    if (!response.ok) throw await readError(response)
    const body = await response.json()
    return Array.isArray(body?.texts) ? body.texts : []
  },

  /**
   * 같은 비밀번호 묶음(salt)의 잠긴 텍스트 암호문을 받는다.
   * 틀리면 code=WRONG_PASSWORD(+remaining), 시도 초과면 LOCKED_OUT, 만료됐으면 TEXT_NOT_FOUND.
   * @returns {Promise<Array<{textId: string, enc: object}>>}
   */
  async unlock(roomId, textIds, verifier) {
    const response = await postJson(roomId, '/api/texts/unlock', { roomId, textIds, verifier })
    if (!response.ok) throw await readError(response)
    const body = await response.json()
    return Array.isArray(body?.texts) ? body.texts : []
  },

  /**
   * 보관 중 텍스트를 지운다. 증명(보낸 기기의 삭제 키, 비밀번호 확인값)이 맞는 것만 지워진다.
   * @param {{textIds?: string[], all?: boolean, deleteKeys?: Record<string,string>, proofs?: Array<{salt:string, verifier:string}>}} opts
   * @returns {Promise<{deleted: string[], forbidden: string[]}|null>} 구버전 백엔드면 null
   */
  async remove(roomId, opts) {
    const body = { roomId }
    if (opts.all) body.all = true
    else body.textIds = opts.textIds
    if (opts.deleteKeys && Object.keys(opts.deleteKeys).length > 0) body.deleteKeys = opts.deleteKeys
    if (opts.proofs && opts.proofs.length > 0) body.proofs = opts.proofs
    const response = await postJson(roomId, '/api/texts/delete', body)
    if (response.status === 404) return null
    if (!response.ok) throw await readError(response)
    return response.json()
  }
}
