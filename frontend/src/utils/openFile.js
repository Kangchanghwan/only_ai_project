import { r2Service } from '../services/r2Service.js'

/**
 * 파일을 새 탭으로 연다. 공개 store 도메인은 presigned보다 느리므로 presigned URL을 우선하고,
 * 발급에 실패했을 때만 store URL을 쓴다.
 * 팝업 차단을 피하려고 탭을 먼저 동기적으로 열고, URL이 정해지면 location을 설정한다.
 *
 * @param {{name: string, url: string, roomId?: string}} file
 * @param {{open?: Function}} [deps]
 */
export async function openFileInNewTab(file, { open = (...a) => window.open(...a) } = {}) {
  const tab = open('', '_blank')
  let url = file.url
  if (file.roomId) {
    try {
      url = (await r2Service.getDownloadUrl(file.roomId, file.name)) || file.url
    } catch (err) {
      console.warn('[openFile] presigned URL 발급 실패, store URL로 폴백:', err)
    }
  }
  if (tab) {
    tab.location.href = url
  } else {
    // 탭을 못 열었으면(차단) 한 번 더 직접 시도한다
    open(url, '_blank')
  }
  return url
}
