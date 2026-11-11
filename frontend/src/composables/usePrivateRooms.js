import { reactive } from 'vue'
import { useLockState } from './useLockState.js'
import { deriveRoomLock, importRoomSecretKey } from '../utils/pairCrypto.js'
import { encryptText, decryptText } from '../utils/privateText.js'
import { createPrivateRoomStore, createMemoryPrivateRoomStore, ROOM_TTL_MS } from '../utils/privateRoomDb.js'
import { isGroupRoomId } from '../utils/groupRoom.js'
import { sanitizeRoomName } from '../utils/groupInvite.js'

export { createMemoryPrivateRoomStore }

/** 상대 상태: online 접속 중 | offline 오프라인 | connecting 연결 중 | left 상대가 연결을 끊음 */
const STATUSES = ['online', 'offline', 'connecting', 'left']

/** 저장 계층: { save, load, remove, updateTicket, clear }. 기본은 IndexedDB(없거나 실패하면 메모리) */
let privateRoomStore = createPrivateRoomStore()

/**
 * 그룹 방(prv-g-…)은 peer가 null이고 name이 있다. 방 비밀 원본(inviteSecret)은 메모리 목록에 두지 않고 저장소에만 있다.
 * @type {Array<{roomId: string, peer: object|null, name?: string, ticket: string|null, status: string, lock: {salt: string, encKey: CryptoKey, vh: string}}>}
 */
const rooms = reactive([])

const find = (roomId) => rooms.find((r) => r.roomId === roomId)

function setStore(store) { privateRoomStore = store }

/** 저장·구조화 복제를 위해 반응형 프록시를 평범한 객체로 */
const plain = (o) => {
  try { return JSON.parse(JSON.stringify(o ?? {})) } catch { return {} }
}

const safe = async (fn) => {
  try { return await fn() } catch (e) { console.warn('[privateRooms] 저장소 오류:', e?.message || e); return undefined }
}

function put(rec) {
  const i = rooms.findIndex((r) => r.roomId === rec.roomId)
  if (i >= 0) rooms.splice(i, 1, rec)
  else rooms.push(rec)
}

async function addRoom({ roomId, peer = null, roomSecret, ticket = null, name = '' }) {
  const secretKey = await importRoomSecretKey(roomSecret)
  const { salt, encKey, verifier, vh } = await deriveRoomLock(secretKey, roomId)
  useLockState().rememberKey(salt, encKey, verifier)
  const group = isGroupRoomId(roomId)
  const roomName = group ? sanitizeRoomName(name) : ''
  const rec = { roomId, peer, ...(group ? { name: roomName } : {}), ticket, status: 'online', lock: { salt, encKey, vh } }
  put(rec)
  const now = Date.now()
  await safe(() => privateRoomStore.save({
    roomId, ticket, secretKey, peer: plain(peer), createdAt: now, lastUsedAt: now, expiresAt: now + ROOM_TTL_MS,
    // 그룹 방만: 나중에 초대 QR을 만들 수 있도록 원본 비밀과 이름을 보관 (복사본: 호출자 버퍼와 분리)
    ...(group ? { inviteSecret: new Uint8Array(roomSecret), name: roomName } : {})
  }))
  return find(roomId) || rec
}

let hydrating = null
/** 앱 시작: 저장된 방을 불러와 "연결 중" 상태로 바로 올린다 (만료분은 저장소가 지움) */
function hydrate(force = false) {
  if (force) hydrating = null
  if (!hydrating) {
    hydrating = (async () => {
      const recs = (await safe(() => privateRoomStore.load())) || []
      const out = []
      for (const r of recs) {
        if (find(r.roomId)) continue
        try {
          const { salt, encKey, verifier, vh } = await deriveRoomLock(r.secretKey, r.roomId)
          useLockState().rememberKey(salt, encKey, verifier)
          const group = isGroupRoomId(r.roomId)
          const rec = {
            roomId: r.roomId,
            peer: group ? null : r.peer || {},
            ...(group ? { name: typeof r.name === 'string' ? r.name : '' } : {}),
            ticket: r.ticket || null,
            status: 'connecting',
            lock: { salt, encKey, vh }
          }
          put(rec)
          out.push(rec)
        } catch {
          await safe(() => privateRoomStore.remove(r.roomId))
        }
      }
      return out
    })()
  }
  return hydrating
}

function removeRoom(roomId) {
  safe(() => privateRoomStore.remove(roomId))
  const i = rooms.findIndex((r) => r.roomId === roomId)
  if (i >= 0) rooms.splice(i, 1)
}

const has = (roomId) => !!find(roomId)
const lockFor = (roomId) => find(roomId)?.lock || null
const peerFor = (roomId) => find(roomId)?.peer || null

/** 그룹 방 초대 QR용 방 비밀 원본 (저장소에서 읽는다). 1:1 방이거나 없으면 null */
async function inviteSecretFor(roomId) {
  if (!isGroupRoomId(roomId)) return null
  const rec = await safe(async () => {
    if (typeof privateRoomStore.get === 'function') return privateRoomStore.get(roomId)
    return (await privateRoomStore.load()).find((r) => r.roomId === roomId) || null
  })
  const s = rec?.inviteSecret
  return s instanceof Uint8Array && s.length === 32 ? new Uint8Array(s) : null
}

function setStatus(roomId, status) {
  const r = find(roomId)
  if (!r || !STATUSES.includes(status)) return
  r.status = status
  // 상대가 연결을 끊었으면 내 저장소에서도 지운다 (화면에는 안내용으로 남는다)
  if (status === 'left') safe(() => privateRoomStore.remove(roomId))
}

function setPeer(roomId, peer) {
  const r = find(roomId)
  if (r && peer) r.peer = { ...r.peer, ...plain(peer) }
}

/** 입장권 갱신 (private:join 응답) */
function setTicket(roomId, ticket) {
  const r = find(roomId)
  if (!r || typeof ticket !== 'string' || !ticket) return
  r.ticket = ticket
  safe(() => privateRoomStore.updateTicket(roomId, ticket))
}

async function encryptFor(roomId, plaintext) {
  const lock = lockFor(roomId)
  if (!lock) throw new Error('PRIVATE_ROOM_UNKNOWN')
  return encryptText(lock.encKey, roomId, plaintext)
}

async function decryptFor(roomId, enc) {
  const lock = lockFor(roomId)
  if (!lock) throw new Error('PRIVATE_ROOM_UNKNOWN')
  return decryptText(lock.encKey, roomId, enc)
}

function resetPrivateRooms() {
  rooms.splice(0, rooms.length)
  hydrating = null
  safe(() => privateRoomStore.clear?.())
}

export function usePrivateRooms() {
  return {
    rooms, addRoom, hydrate, removeRoom, has, lockFor, peerFor, setStatus, setPeer, setTicket, inviteSecretFor,
    encryptFor, decryptFor, setStore, resetPrivateRooms
  }
}
