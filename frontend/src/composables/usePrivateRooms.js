import { reactive } from 'vue'
import { useLockState } from './useLockState.js'
import { deriveRoomLock } from '../utils/pairCrypto.js'
import { encryptText, decryptText } from '../utils/privateText.js'

/**
 * 1:1 비공개 방 목록 (이번 접속 동안만).
 * 저장 계층은 privateRoomStore 인터페이스 뒤에 둔다: { get(roomId), set(roomId, record), delete(roomId), list() }
 * 지금은 메모리 구현만. E1(30일 유지)에서 IndexedDB 구현으로 바꿔 끼운다.
 */
export function createMemoryPrivateRoomStore() {
  const m = new Map()
  return {
    get: (id) => m.get(id) || null,
    set: (id, rec) => { m.set(id, rec) },
    delete: (id) => { m.delete(id) },
    list: () => [...m.values()],
    clear: () => m.clear()
  }
}

let privateRoomStore = createMemoryPrivateRoomStore()

/** @type {Array<{roomId: string, peer: object, status: 'online'|'left', lock: {salt: string, encKey: CryptoKey, vh: string}}>} */
const rooms = reactive([])

const find = (roomId) => rooms.find((r) => r.roomId === roomId)

/** E1용: 저장소 교체 */
function setStore(store) { privateRoomStore = store }

async function addRoom({ roomId, peer, roomSecret }) {
  const { salt, encKey, verifier, vh } = await deriveRoomLock(roomSecret, roomId)
  useLockState().rememberKey(salt, encKey, verifier)
  const rec = { roomId, peer, status: 'online', lock: { salt, encKey, vh } }
  privateRoomStore.set(roomId, rec)
  const i = rooms.findIndex((r) => r.roomId === roomId)
  if (i >= 0) rooms.splice(i, 1, rec)
  else rooms.push(rec)
  return rec
}

function removeRoom(roomId) {
  privateRoomStore.delete(roomId)
  const i = rooms.findIndex((r) => r.roomId === roomId)
  if (i >= 0) rooms.splice(i, 1)
}

const has = (roomId) => !!find(roomId)
const lockFor = (roomId) => find(roomId)?.lock || null
const peerFor = (roomId) => find(roomId)?.peer || null

function setStatus(roomId, status) {
  const r = find(roomId)
  if (r && (status === 'online' || status === 'left')) r.status = status
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
  privateRoomStore.clear?.()
}

export function usePrivateRooms() {
  return { rooms, addRoom, removeRoom, has, lockFor, peerFor, setStatus, encryptFor, decryptFor, setStore, resetPrivateRooms }
}
