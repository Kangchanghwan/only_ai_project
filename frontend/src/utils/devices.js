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
  devices = mergeSameDevice(devices, mySocketId, priorityIds)
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
  return mergeSameDevice(devices, mySocketId).filter((d) => !isMeDevice(d, mySocketId, myIdentity)).length
}

/**
 * 같은 브라우저의 탭 여러 개는 같은 이름(identity)으로 들어온다. 이름이 같은 항목은 카드 한 장으로 합친다.
 * 대표는 나(소켓 ID 일치) → 연결 중인 기기 → 가장 최근 접속 순. 자리 비움은 모든 탭이 비웠을 때만 표시한다.
 * 이름이 없거나 올바르지 않은 항목은 합치지 않는다.
 */
export function mergeSameDevice(devices, mySocketId = null, priorityIds = null) {
  const list = devices || []
  const groups = new Map()
  const out = []
  for (const d of list) {
    if (!isValidIdentity(d?.identity)) { out.push(d); continue }
    const key = `${d.identity.adj}:${d.identity.animal}:${d.identity.suffix ?? 0}`
    const g = groups.get(key)
    if (g) g.push(d)
    else { const arr = [d]; groups.set(key, arr); out.push(arr) }
  }
  const score = (d) => (mySocketId && d.socketId === mySocketId ? 2 : priorityIds?.has?.(d.socketId) ? 1 : 0)
  return out.map((x) => {
    if (!Array.isArray(x) || x.length === 1) return Array.isArray(x) ? x[0] : x
    const rep = [...x].sort((a, b) => score(b) - score(a) || (b.joinedAt ?? 0) - (a.joinedAt ?? 0))[0]
    const allAway = x.every((d) => d.away === true)
    return { ...rep, away: allAway ? true : false }
  })
}
