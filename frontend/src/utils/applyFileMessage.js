/**
 * @file applyFileMessage.js
 * @description 소켓으로 받은 파일 관련 메시지를 로컬 파일 목록에 반영한다.
 *              메시지에 담긴 정보만으로 목록을 갱신하므로 업로드마다 전체 목록을
 *              다시 조회할 필요가 없다. 정보가 부족한(구버전) 메시지는 'reload'로
 *              알려 호출자가 전체 재조회로 폴백하게 한다.
 */

/**
 * @param {Object} message - 소켓 메시지
 * @param {{addFile: Function, removeFile: Function, clearRoomFiles: Function}} fileManager - useFileManager 인스턴스
 * @returns {'added'|'updated'|'removed'|'cleared'|'reload'|'ignored'}
 */
export function applyFileMessage(message, fileManager) {
  if (!message || typeof message !== 'object') return 'ignored'

  switch (message.type) {
    case 'file-uploaded': {
      const { fileName, url, roomId, size, created } = message
      if (!fileName || !url || !roomId || typeof size !== 'number' || !created) {
        return 'reload'
      }
      const added = fileManager.addFile({ name: fileName, url, size, created, roomId })
      return added ? 'added' : 'updated'
    }

    case 'file-deleted': {
      const { fileName, roomId } = message
      if (!fileName || !roomId) return 'ignored'
      return fileManager.removeFile(roomId, fileName) ? 'removed' : 'ignored'
    }

    case 'files-cleared': {
      if (!message.roomId) return 'ignored'
      fileManager.clearRoomFiles(message.roomId)
      return 'cleared'
    }

    default:
      return 'ignored'
  }
}
