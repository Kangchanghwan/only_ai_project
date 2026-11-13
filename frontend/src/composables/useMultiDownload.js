/**
 * @composable useMultiDownload
 * 선택한 여러 파일을 받는다: 작은 파일은 ZIP 하나로, 200MB 넘는 파일은 하나씩.
 * 다운로드가 2건 이상 필요하면 목록(sheet)을 열고 첫 건만 바로 시작한다.
 * 나머지는 사용자가 직접 눌러 받는다(브라우저는 사이트가 연달아 시작하는 다운로드를 막는다).
 * 설계서: docs/superpowers/specs/2026-11-13-multi-download-zip-design.md
 */
import { ref } from 'vue'
import { planDownload, zipEntryNames, zipFileName } from '../utils/downloadPlan.js'
import { downloadZip as defaultDownloadZip, zipInMemory as defaultZipInMemory } from '../services/zipDownloader.js'

/**
 * @param {object} deps
 * @param {{ downloadFile: (file:object)=>Promise<{success:boolean}> }} deps.download
 * @param {(key:string, params?:object)=>string} deps.t
 * @param {object} [deps.notification] useNotification() (없으면 진행 표시·토스트 생략)
 * @param {(count:number, method:'zip'|'native')=>void} [deps.onSuccess] 받기 성공(또는 브라우저 받기 시작) 시
 * @param {boolean} [deps.exactSizes=true] 파일 크기가 목록의 정확한 값인지 (QR 받기 화면은 추정값이라 false)
 */
export function useMultiDownload({ download, t, notification = null, onSuccess = () => {}, exactSizes = true, downloadZip = defaultDownloadZip, zipInMemory = defaultZipInMemory, now = () => new Date() }) {
  /** 열린 목록: { items } | null */
  const sheet = ref(null)

  function buildItems(files) {
    const { items } = planDownload(files, { inMemory: zipInMemory() })
    const zipCount = items.filter((i) => i.type === 'zip').length
    const date = now()
    let zipIndex = 0
    return items.map((item, key) => {
      const base = { ...item, key, state: 'idle', percent: 0 }
      if (item.type !== 'zip') return base
      const index = zipIndex++
      return { ...base, index, zipCount, zipName: zipFileName(date, index, zipCount), names: zipEntryNames(item.files) }
    })
  }

  async function runZip(item) {
    const id = `zip-${item.key}-${Date.now()}`
    notification?.addUpload(id, item.zipName)
    item.state = 'running'
    item.percent = 0
    try {
      await downloadZip({
        files: item.files,
        names: item.names,
        zipName: item.zipName,
        exactSizes,
        onProgress: (p) => {
          item.percent = p
          notification?.updateUpload(id, p)
        },
      })
      item.state = 'done'
      item.percent = 100
      notification?.completeUpload(id)
      setTimeout(() => notification?.removeUpload(id), 1500)
      notification?.showSuccess(t('multiDownload.zipDone', { count: item.files.length }))
      onSuccess(item.files.length, 'zip')
    } catch (err) {
      console.error('[useMultiDownload] ZIP 받기 실패:', err?.code || err)
      item.state = 'failed'
      notification?.failUpload(id, t('multiDownload.zipFailed'))
      setTimeout(() => notification?.removeUpload(id), 5000)
      notification?.showError(t('multiDownload.zipFailed'))
    }
  }

  async function runFile(item) {
    item.state = 'running'
    const result = await download.downloadFile(item.file)
    if (result?.success) {
      // 브라우저 다운로드 관리자에 넘겼다. 실제로 끝났는지는 사이트가 알 수 없다
      item.state = 'started'
      notification?.showSuccess(t('multiDownload.fileStarted'))
      onSuccess(1, 'native')
    } else {
      item.state = 'failed'
      notification?.showError(t('file.downloadFailed'))
    }
  }

  /** 항목 하나 받기 (목록의 버튼) */
  function run(item) {
    if (!item || item.state === 'running') return Promise.resolve()
    return item.type === 'zip' ? runZip(item) : runFile(item)
  }

  /** 선택한 파일 받기 시작 */
  async function start(files) {
    if (!files || files.length === 0) return
    const items = buildItems(files)
    if (items.length === 1) {
      await run(items[0])
      return
    }
    sheet.value = { items }
    // 반응형 프록시를 통해 바꿔야 목록이 다시 그려진다
    await run(sheet.value.items[0])
  }

  function close() {
    sheet.value = null
  }

  return { sheet, start, run, close, buildItems }
}
