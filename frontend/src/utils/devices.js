import { isValidIdentity, sameIdentity } from './identity'

/** 기기 목록에서 "나"인지 판별 (소켓 ID 우선, 없으면 정체성 비교) */
export function isMeDevice(device, mySocketId, myIdentity) {
  return (!!mySocketId && device.socketId === mySocketId) ||
    (isValidIdentity(device.identity) && !!myIdentity && sameIdentity(device.identity, myIdentity))
}

/**
 * 정렬: 나 → 1:1 연결 요청을 주고받는 중인 기기(priorityIds) → 최근 접속 순(방금 들어온 기기가 앞).
 * 오래 열어 둔 기기가 앞을 차지해 새로 들어온 기기가 모바일 가로 줄 뒤로 밀리지 않게 한다.
 */
export function sortDevices(devices, mySocketId, myIdentity, priorityIds = null) {
  const rank = (d) => (isMeDevice(d, mySocketId, myIdentity) ? 0 : priorityIds?.has?.(d.socketId) ? 1 : 2)
  return [...devices].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    const dt = (b.joinedAt ?? 0) - (a.joinedAt ?? 0)
    if (dt !== 0) return dt
    return String(a.socketId ?? '') < String(b.socketId ?? '') ? -1 : String(a.socketId ?? '') > String(b.socketId ?? '') ? 1 : 0
  })
}

/** "다른 기기 N대": 나를 제외한 수 (나 혼자면 0) */
export function countOtherDevices(devices, mySocketId, myIdentity) {
  return (devices || []).filter((d) => !isMeDevice(d, mySocketId, myIdentity)).length
}
