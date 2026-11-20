/**
 * 미리보기 시트가 방과 맞닿는 부분 (지연 로드): 방 파일의 평문 바이트, 방에 이미 있는 이름, 같은 방으로 올리기.
 * 평문은 이 브라우저 안에서만 다룬다 (잠긴 파일은 기존 복호화 경로로 브라우저에서 푼다).
 */
import { prepareLockedEntry, decryptInMemory } from './lockedDownloader.js'
import { r2Service } from './r2Service.js'

export function createHwpRoomHooks({ lockState, files, upload }) {
  return {
    maxBytes: (import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120) * 1024 * 1024,
    upload,
    existingNames: (roomId) => files()
      .filter((f) => f.roomId === roomId)
      .map((f) => (f.locked ? lockState.nameFor(roomId, f.name) : f.name)),
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
