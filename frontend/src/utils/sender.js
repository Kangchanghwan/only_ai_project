/**
 * @file sender.js
 * @description 파일/텍스트의 보낸 사람 표시 상태 계산.
 */
import { isValidIdentity, sameIdentity } from './identity.js'

/**
 * @param {object|undefined} sender - 서버가 붙인 {socketId, identity, deviceLabel, browser}
 * @param {{mySocketId?:string|null, myIdentity?:object|null, devices?:Array}} ctx
 * @returns {'me'|'present'|'left'|null} null이면 표시를 생략한다 (정보 없음)
 */
export function senderState(sender, ctx = {}) {
  if (!sender || !isValidIdentity(sender.identity)) return null
  if ((ctx.mySocketId && sender.socketId === ctx.mySocketId) || sameIdentity(sender.identity, ctx.myIdentity)) return 'me'
  const devices = ctx.devices || []
  const present = devices.some((d) => d.socketId === sender.socketId || sameIdentity(d.identity, sender.identity))
  return present ? 'present' : 'left'
}
