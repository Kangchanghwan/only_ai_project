import { ref } from 'vue'
import { encryptText, decryptText } from '../utils/privateText.js'
import { deriveLock, b64u, randomBytes } from '../utils/lockCrypto.js'
import { textQueueService } from '../services/textQueueService.js'

/** 서버 보관 크기 상한 (평문 UTF-8, 서버 TEXT_QUEUE_MAX_BYTES와 같다). 넘으면 지금 열린 기기에만 간다 */
export const TEXT_QUEUE_MAX_BYTES = 96 * 1024
/** 같은 네트워크·전체 공유에서 보낸 쪽 하나가 보관할 수 있는 개수 (서버 TEXT_QUEUE_SENDER_QUOTA) */
export const TEXT_QUEUE_SENDER_QUOTA = 5

const utf8 = new TextEncoder()
/** 텍스트의 UTF-8 바이트 수 */
export const textBytes = (s) => utf8.encode(String(s ?? '')).length

/**
 * @composable useTextQueue
 * @description 텍스트 10분 보관(받는 기기가 없을 때 대기열)의 클라이언트 쪽.
 *
 * - 서버는 보낸 텍스트를 10분 보관한다. 1:1 방은 방 키 암호문, 같은 네트워크·전체 공유는
 *   잠금 꺼짐이면 평문 그대로, 잠금 켜짐이면 그 범위 비밀번호로 이 기기에서 암호화한 암호문으로.
 * - 잠긴 텍스트는 같은 비밀번호 묶음(salt)을 이번 접속에서 풀었거나 내가 잠갔으면 자동으로 풀고,
 *   아니면 "잠긴 텍스트" 카드로 둔다. 암호문은 서버가 비밀번호 확인값을 맞힌 기기에만 준다.
 * - 목록 항목: { id, content(string|null), timestamp, roomId, sender?, expiresAt?, locked?, salt?, enc?, notStored? }
 *   enc는 서버가 암호문을 실어 보낸 경우(구버전 백엔드 등)에만 있고, 풀면 지운다.
 *   notStored('TOO_LARGE'|'FULL')는 내가 보냈지만 보관되지 않아 지금 열린 기기에만 간 텍스트.
 *
 * @param {{textShare, privateRooms, lockState, t: Function, getMySocketId?: () => string|null, service?: typeof textQueueService}} deps
 */
export function useTextQueue({ textShare, privateRooms, lockState, t, getMySocketId = () => null, service = textQueueService }) {
  /** 서버가 대기열을 지원하는지: null 아직 모름, false 구버전 백엔드(목록 404) */
  const supported = ref(null)
  const texts = textShare.sharedTexts
  const find = (id) => texts.value.find((x) => x.id === id)

  /**
   * 범위 잠금으로 텍스트를 봉인한다. 삭제 키는 이 기기 메모리에만 두고 서버에는 해시(dh)만 보낸다.
   * @returns {Promise<{enc: object, lock: object, deleteKey: string}>}
   */
  async function sealForScope(lock, roomId, content) {
    const enc = await encryptText(lock.encKey, roomId, content)
    const keyBytes = randomBytes(32)
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', keyBytes))
    const dh = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
    return { enc, lock: { v: 1, salt: lock.salt, vh: lock.vh, dh }, deleteKey: b64u(keyBytes) }
  }

  /**
   * text-shared 메시지(실시간·목록 공통)를 목록에 넣는다. 같은 textId는 다시 넣지 않고 만료 시각만 반영한다.
   * @returns {Promise<object|null>} 새로 넣었으면 그 항목
   */
  async function ingest(message) {
    if (!message || typeof message.textId !== 'string' || !message.roomId) return null
    const existing = find(message.textId)
    if (existing) {
      // 내가 보낸 텍스트가 서버를 거쳐 되돌아오면 보관 만료 시각이 붙어 있다
      if (typeof message.expiresAt === 'number' && existing.roomId === message.roomId) existing.expiresAt = message.expiresAt
      return null
    }
    const entry = {
      id: message.textId,
      content: null,
      timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
      roomId: message.roomId,
      // 서버가 붙인 보낸 사람 (구버전 백엔드는 없음 → 표시 생략)
      ...(message.sender ? { sender: message.sender } : {}),
      ...(typeof message.expiresAt === 'number' ? { expiresAt: message.expiresAt } : {})
    }
    if (privateRooms.has(message.roomId)) {
      // 1:1 방은 암호문(enc)만 오며 평문 content는 쓰지 않는다
      try {
        entry.content = await privateRooms.decryptFor(message.roomId, message.enc)
      } catch {
        entry.content = t('pair.unreadableText')
      }
    } else if (message.locked === true && typeof message.lock?.salt === 'string') {
      entry.locked = true
      entry.salt = message.lock.salt
      if (message.enc) entry.enc = message.enc
    } else if (typeof message.content === 'string') {
      entry.content = message.content
    } else {
      return null
    }
    // 복호화 사이에 같은 항목이 들어왔는지 다시 확인
    if (find(entry.id)) return null
    texts.value.push(entry)
    if (entry.locked) unlockKnown()
    return find(entry.id)
  }

  /**
   * 방들의 보관 중 텍스트를 불러온다 (접속·재연결·1:1 방 재입장 뒤). 이미 있는 textId는 건너뛴다.
   * @returns {Promise<number>} 새로 들어온 개수
   */
  async function loadRooms(roomIds) {
    let added = 0
    await Promise.all([...new Set(roomIds)].filter(Boolean).map(async (roomId) => {
      try {
        const list = await service.list(roomId)
        if (list === null) {
          supported.value = false
          return
        }
        supported.value = true
        for (const m of list) if (await ingest({ ...m, roomId })) added++
      } catch (error) {
        console.warn('[TextQueue] 보관 텍스트 불러오기 실패:', error?.message || error)
      }
    }))
    return added
  }

  const wrongPassword = () => Object.assign(new Error('WRONG_PASSWORD'), { code: 'WRONG_PASSWORD' })

  /** 한 방·한 비밀번호 묶음의 잠긴 텍스트를 key({encKey, verifier})로 푼다. 푼 개수 */
  async function unlockGroup(roomId, salt, key) {
    const targets = texts.value.filter((x) => x.roomId === roomId && x.locked && x.content == null && x.salt === salt)
    let n = 0
    for (const x of targets.filter((y) => y.enc)) {
      try {
        x.content = await decryptText(key.encKey, roomId, x.enc)
      } catch {
        throw wrongPassword()
      }
      delete x.enc
      n++
    }
    const remote = targets.filter((y) => !y.enc && y.content == null)
    if (remote.length > 0) {
      const got = await service.unlock(roomId, remote.map((x) => x.id), key.verifier)
      for (const { textId, enc } of got) {
        const x = find(textId)
        if (!x || x.content != null) continue
        x.content = await decryptText(key.encKey, roomId, enc)
        n++
      }
    }
    return n
  }

  const running = new Set()
  /** 이번 접속에서 비밀번호를 확인한 묶음(keyring에 있는 salt)의 잠긴 텍스트를 자동으로 푼다 */
  async function unlockKnown() {
    const groups = new Map()
    for (const x of texts.value) {
      if (!x.locked || x.content != null || !x.salt || !lockState.keyFor(x.salt)) continue
      groups.set(`${x.roomId}|${x.salt}`, { roomId: x.roomId, salt: x.salt })
    }
    for (const [k, { roomId, salt }] of groups) {
      if (running.has(k)) continue
      running.add(k)
      try {
        await unlockGroup(roomId, salt, lockState.keyFor(salt))
      } catch (error) {
        console.warn('[TextQueue] 잠긴 텍스트 자동 풀기 실패:', error?.code || error?.message || error)
      } finally {
        running.delete(k)
      }
    }
  }

  /**
   * 비밀번호로 잠긴 텍스트를 푼다. 맞으면 이 범위의 비밀번호를 keyring에 기억해 같은 묶음의
   * 다른 텍스트·잠긴 파일도 다시 묻지 않는다.
   * 실패: code WRONG_PASSWORD(+remaining) | LOCKED_OUT | TEXT_NOT_FOUND(만료, 목록에서도 뺀다)
   */
  async function unlockWithPassword(textId, password) {
    const x = find(textId)
    if (!x || !x.locked || x.content != null || !x.salt) return
    const derived = await deriveLock(password, x.salt)
    const key = { encKey: derived.encKey, verifier: derived.verifier }
    try {
      await unlockGroup(x.roomId, x.salt, key)
    } catch (error) {
      if (error?.code === 'TEXT_NOT_FOUND' || error?.status === 404) textShare.removeText(textId)
      throw error
    }
    lockState.rememberKey(x.salt, key.encKey, key.verifier)
    await unlockKnown()
  }

  /** 서버에 보관 중인지 (만료 시각이 남아 있는지) */
  const isQueued = (x, now = Date.now()) => typeof x?.expiresAt === 'number' && x.expiresAt > now

  /**
   * 보관 취소 버튼: 1:1 방, 잠긴 텍스트는 지울 증명이 있을 때(보낸 기기·같은 비밀번호를 확인한 기기),
   * 평문 텍스트는 내가 보낸 것에만 보인다 (서버는 방 멤버면 지울 수 있다).
   */
  function canCancel(x, now = Date.now()) {
    if (!isQueued(x, now)) return false
    if (privateRooms.has(x.roomId)) return true
    if (!x.locked) return !!x.sender?.socketId && x.sender.socketId === getMySocketId()
    return !!lockState.deleteKeyFor(x.roomId, x.id) || (!!x.salt && !!lockState.keyFor(x.salt))
  }

  /** 내가 보낸 텍스트가 보관되지 않았음을 표시한다 (지금 열린 기기에만 전달됨) */
  function markNotStored(id, reason) {
    const x = find(id)
    if (!x) return
    x.notStored = reason
    delete x.expiresAt
  }

  /** 보낸 쪽 몫을 넘어 서버에서 밀려난 내 보관분: 화면에는 남기고 보관 표시만 지운다 */
  function markEvicted(ids) {
    for (const id of ids || []) {
      const x = find(id)
      if (x) delete x.expiresAt
    }
  }

  function proofsFor(roomId, entries) {
    const deleteKeys = {}
    const proofs = []
    for (const x of entries) {
      const k = lockState.deleteKeyFor(roomId, x.id)
      if (k) deleteKeys[x.id] = k
      const key = x.salt ? lockState.keyFor(x.salt) : null
      if (key && !proofs.some((p) => p.salt === x.salt)) proofs.push({ salt: x.salt, verifier: key.verifier })
    }
    return { deleteKeys, proofs: proofs.slice(0, 5) }
  }

  /**
   * 서버 대기열에서 지운다 (항목 삭제·보관 취소·전체 삭제). 보관 중이 아닌 것만이면 요청하지 않는다.
   * @returns {Promise<{deleted: string[], forbidden: string[]}|null>} 실패·구버전 백엔드면 null
   */
  async function removeFromServer(roomId, { textIds, all = false } = {}) {
    if (supported.value === false) return null
    const entries = all ? texts.value.filter((x) => x.roomId === roomId) : (textIds || []).map(find).filter(Boolean)
    if (!all && !entries.some((x) => isQueued(x))) return { deleted: [], forbidden: [] }
    try {
      return await service.remove(roomId, {
        ...(all ? { all: true } : { textIds: entries.map((x) => x.id) }),
        ...proofsFor(roomId, entries)
      })
    } catch (error) {
      console.warn('[TextQueue] 보관 텍스트 삭제 실패:', error?.message || error)
      return null
    }
  }

  /** 만료된 잠긴 텍스트(더는 풀 수 없음)를 목록에서 뺀다. 이미 보이는 텍스트는 남긴다 */
  function expire(now = Date.now()) {
    const stale = texts.value.filter((x) => x.locked && x.content == null && !x.enc && typeof x.expiresAt === 'number' && x.expiresAt <= now)
    for (const x of stale) textShare.removeText(x.id)
    return stale.length
  }

  return {
    supported,
    sealForScope,
    ingest,
    loadRooms,
    unlockKnown,
    unlockWithPassword,
    isQueued,
    canCancel,
    removeFromServer,
    markNotStored,
    markEvicted,
    expire
  }
}
