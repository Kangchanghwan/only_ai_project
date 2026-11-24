/**
 * 수정 시트가 방과 맞닿는 부분 (지연 로드): 방 파일의 평문 바이트, 방에 이미 있는 이름, 같은 방으로 올리기.
 * 평문은 이 브라우저 안에서만 다룬다 (잠긴 파일은 기존 복호화 경로로 브라우저에서 푼다).
 */
import { prepareLockedEntry, decryptInMemory } from './lockedDownloader.js'
import { r2Service } from './r2Service.js'
import { storedNameOf } from '../utils/editTarget.js'

export function createEditRoomHooks({ lockState, files, upload, remove, lockFor }) {
  const realName = (f) => (f.locked ? lockState.nameFor(f.roomId, f.name) : f.name)
  return {
    maxBytes: (import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120) * 1024 * 1024,
    // 잠긴 파일을 잠금 없이 다시 올리면 평문이 되므로, 그 범위의 잠금이 켜져 있을 때만 저장한다
    canSave: (file, scope) => !file.locked || !!lockFor(scope, file.roomId),
    /**
     * 원본 자리에 덮어쓰기: 같은 이름으로 올린다(서버 키가 같으면 그대로 덮임).
     * 저장 키가 달라지는 경우(잠긴 파일은 매번 새 id, doc→docx 처럼 확장자 변환)에는 올린 뒤 원본을 지운다.
     */
    async replace(current, file, scope) {
      const before = new Set(files().filter((f) => f.roomId === current.roomId).map((f) => f.name))
      const ok = await upload(file, scope)
      if (!ok) return { ok: false }
      const stored = storedNameOf(file.name)
      const sameKey = !current.locked && String(current.name).toLowerCase() === stored.toLowerCase()
      if (sameKey) return { ok: true, next: current, removed: true }
      const added = files().find((f) => f.roomId === current.roomId && !before.has(f.name) && storedNameOf(realName(f) || '') === stored)
      let removed = true
      try { await remove(current) } catch { removed = false }
      return { ok: true, next: added || { ...current, name: stored, locked: false }, removed }
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
