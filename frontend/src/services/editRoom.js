/**
 * 수정 시트가 방과 맞닿는 부분 (지연 로드): 방 파일의 평문 바이트, 방에 이미 있는 이름, 같은 방으로 올리기.
 * 평문은 이 브라우저 안에서만 다룬다 (잠긴 파일은 기존 복호화 경로로 브라우저에서 푼다).
 */
import { prepareLockedEntry, decryptInMemory } from './lockedDownloader.js'
import { r2Service } from './r2Service.js'
import { storedNameOf } from '../utils/editTarget.js'
import { fromB64u } from '../utils/lockCrypto.js'

/** 이번 접속에서 이미 푼 비밀번호 묶음(salt)으로 업로드용 잠금을 다시 만든다 (없으면 null) */
export async function lockFromKeyring(lockState, salt) {
  const entry = salt && lockState.keyFor(salt)
  if (!entry) return null
  const digest = await globalThis.crypto.subtle.digest('SHA-256', fromB64u(entry.verifier))
  const vh = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return { salt, encKey: entry.encKey, verifier: entry.verifier, vh }
}

export function createEditRoomHooks({ lockState, files, upload, remove, isPrivate = () => false, lockedMeta = (roomId, id) => r2Service.lockedMeta(roomId, id) }) {
  const realName = (f) => (f.locked ? lockState.nameFor(f.roomId, f.name) : f.name)
  return {
    maxBytes: (import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120) * 1024 * 1024,
    /**
     * 원본 자리에 덮어쓰기. 원본의 잠금 상태를 그대로 지킨다:
     *  - 잠기지 않은 원본은 잠그지 않고 같은 이름으로 올린다(서버 키가 같으면 그대로 덮임).
     *  - 잠긴 원본은 원본과 같은 비밀번호 묶음(이번 접속에서 풀어 둔 키)으로 다시 잠가 올린다. 범위 잠금이 꺼져 있어도 된다.
     *    1:1/그룹 방은 언제나 방 키로 잠긴다(App.uploadFiles).
     *  - 저장 키가 달라지면(잠긴 파일은 매번 새 id, doc→docx 처럼 확장자 변환) 올린 뒤 원본을 지운다.
     * 반환: { ok, next, removed } 또는 { ok:false, code:'LOCK' } (원본 키를 이번 접속에서 모름)
     */
    async replace(current, file, scope) {
      let lock = false
      if (isPrivate(scope)) lock = undefined
      else if (current.locked) {
        let meta = null
        try { meta = await lockedMeta(current.roomId, current.name) } catch { meta = null }
        lock = await lockFromKeyring(lockState, meta && meta.salt)
        if (!lock) return { ok: false, code: 'LOCK' }
      }
      const before = new Set(files().filter((f) => f.roomId === current.roomId).map((f) => f.name))
      const ok = await upload(file, scope, lock)
      if (!ok) return { ok: false }
      const stored = storedNameOf(file.name)
      const sameKey = !current.locked && String(current.name).toLowerCase() === stored.toLowerCase()
      if (sameKey) return { ok: true, next: current, removed: true }
      const added = files().find((f) => f.roomId === current.roomId && !before.has(f.name) && storedNameOf(realName(f) || '') === stored)
      let removed = true
      try { await remove(current) } catch { removed = false }
      return { ok: true, next: added || { ...current, name: stored, locked: !!current.locked }, removed }
    },
    async getBytes(file) {
      if (file.locked) {
        const entry = await prepareLockedEntry({ roomId: file.roomId, id: file.name, lockState })
        const blob = await decryptInMemory(entry)
        return { name: entry.name, bytes: await blob.arrayBuffer() }
      }
      const url = (await r2Service.getDownloadUrl(file.roomId, file.name).catch(() => null)) || file.url
      const res = await fetch(url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return { name: file.name, bytes: await res.arrayBuffer() }
    },
  }
}
