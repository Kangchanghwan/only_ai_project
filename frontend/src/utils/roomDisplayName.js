import { isGroupRoomId } from './groupRoom.js'

/**
 * 같은 이름의 방이 2개 이상이면(1:1 방과 그룹 방을 모두 합쳐서) 목록 순서(만든/들어온 순서)대로 " 2", " 3"을 붙여 보여 준다.
 * 첫 번째는 이름 그대로. 표시 전용이며 저장된 이름이나 서버로 보내는 값은 바꾸지 않는다.
 * @param {Array<{roomId: string, name?: string}>} rooms 내 방 목록(순서 유지)
 * @param {string} roomId 표시할 방
 * @param {string} unnamed 이름이 비었을 때 보여 줄 기본 이름
 * @param {(room: object) => string} [legacyLabel] 이름이 없는 예전 1:1 방(prv-)의 표시 이름. 없으면 그 방은 세지 않는다
 */
export function roomDisplayName(rooms, roomId, unnamed, legacyLabel) {
  const list = Array.isArray(rooms) ? rooms : []
  const baseOf = (r) => {
    if (!r) return null
    if (isGroupRoomId(r.roomId) || r.name) return r.name || unnamed
    return legacyLabel ? legacyLabel(r) : null
  }
  const me = list.find((r) => r?.roomId === roomId)
  const base = baseOf(me)
  if (base === null) return unnamed ?? ''
  const same = list.filter((r) => baseOf(r) === base)
  if (same.length < 2) return base
  const idx = same.findIndex((r) => r.roomId === roomId)
  return idx > 0 ? `${base} ${idx + 1}` : base
}
