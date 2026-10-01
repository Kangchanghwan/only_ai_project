import { isValidIdentity, sameIdentity } from './identity'

/** 기기 목록에서 "나"인지 판별 (소켓 ID 우선, 없으면 정체성 비교) */
export function isMeDevice(device, mySocketId, myIdentity) {
  return (!!mySocketId && device.socketId === mySocketId) ||
    (isValidIdentity(device.identity) && !!myIdentity && sameIdentity(device.identity, myIdentity))
}

/** 내 기기를 맨 위로, 나머지는 접속 순서 */
export function sortDevices(devices, mySocketId, myIdentity) {
  return [...devices].sort((a, b) => {
    const am = isMeDevice(a, mySocketId, myIdentity) ? 0 : 1
    const bm = isMeDevice(b, mySocketId, myIdentity) ? 0 : 1
    if (am !== bm) return am - bm
    return (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  })
}

/** "다른 기기 N대": 나를 제외한 수 (나 혼자면 0) */
export function countOtherDevices(devices, mySocketId, myIdentity) {
  return (devices || []).filter((d) => !isMeDevice(d, mySocketId, myIdentity)).length
}
