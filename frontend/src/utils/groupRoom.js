/**
 * 그룹 방 ID: `prv-g-<hex 24>` (1:1 방은 `prv-<hex 24>`). 방 종류는 ID로만 판단한다(저장 필드 없음).
 * 백엔드 utils/privateRoom.ts 의 isGroupRoomId 와 같은 규칙.
 */
export const GROUP_ROOM_RE = /^prv-g-[0-9a-f]{24}$/

export const isGroupRoomId = (roomId) => typeof roomId === 'string' && GROUP_ROOM_RE.test(roomId)
