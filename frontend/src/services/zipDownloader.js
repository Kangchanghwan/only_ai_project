/**
 * 여러 파일을 ZIP 하나로 받는다 (압축 없이 묶기만).
 *
 * - 서비스워커를 쓸 수 있으면 `/__zip/<token>`을 숨은 iframe으로 열고, 서비스워커가 파일을 차례로 받으면서
 *   바로 ZIP으로 내보낸다(메모리에 모으지 않는다). 각 파일 주소는 받기 직전에 서비스워커가 새로 받는다.
 * - 아이폰이거나 서비스워커가 없으면 메모리에 모아 Blob으로 저장한다(묶음 한도 300MB, downloadPlan.js).
 */
import { r2Service } from './r2Service'
import { canStreamViaServiceWorker } from './lockedDownloader.js'
import { buildZipParts, encodeName, zipSize } from '../utils/zipWriter.js'

const SW_REGISTER_TIMEOUT_MS = 3000
const SW_STALL_TIMEOUT_MS = 60000

const zipError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra })

/** 이 기기가 메모리 방식으로 ZIP을 만드는지 (묶음 한도 결정에 쓴다) */
export const zipInMemory = () => !canStreamViaServiceWorker()

function registerZipJob(job) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => reject(zipError('ZIP_SW_TIMEOUT')), SW_REGISTER_TIMEOUT_MS)
    channel.port1.onmessage = (e) => {
      clearTimeout(timer)
      if (e.data?.ok) resolve()
      else reject(zipError('ZIP_SW_REJECTED'))
    }
    navigator.serviceWorker.controller.postMessage({ type: 'ZIP_REGISTER', ...job }, [channel.port2])
  })
}

function streamViaServiceWorker({ entries, zipName, total, exact, onProgress }) {
  const token = (globalThis.crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '')
  return registerZipJob({ token, apiUrl: r2Service.apiUrl, zipName, entries, exact }).then(
    () =>
      new Promise((resolve, reject) => {
        let stall
        const frame = document.createElement('iframe')
        const cleanup = () => {
          clearTimeout(stall)
          navigator.serviceWorker.removeEventListener('message', onMessage)
          setTimeout(() => frame.remove(), 1000)
        }
        const arm = () => {
          clearTimeout(stall)
          stall = setTimeout(() => { cleanup(); reject(zipError('ZIP_STALLED')) }, SW_STALL_TIMEOUT_MS)
        }
        function onMessage(e) {
          const d = e.data
          if (!d || d.type !== 'ZIP_PROGRESS' || d.token !== token) return
          arm()
          if (d.error) { cleanup(); reject(zipError(d.error)); return }
          onProgress?.(total ? Math.min(100, Math.floor((d.loaded / total) * 100)) : 0)
          if (d.done) { cleanup(); resolve() }
        }
        navigator.serviceWorker.addEventListener('message', onMessage)
        arm()
        frame.style.display = 'none'
        frame.src = `/__zip/${token}`
        document.body.appendChild(frame)
      })
  )
}

function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 60000)
}

/** 메모리 방식: 파일을 차례로 받아 모은 뒤 ZIP Blob으로 저장한다 */
export async function zipInMemoryDownload({ entries, zipName, total, exact = true, onProgress, fetchImpl = fetch, getUrl = (e) => r2Service.getDownloadUrl(e.roomId, e.file) }) {
  const items = []
  let loaded = 0
  for (const entry of entries) {
    let response
    try {
      response = await fetchImpl(await getUrl(entry))
    } catch {
      throw zipError('ZIP_DOWNLOAD_FAILED')
    }
    if (!response.ok || !response.body) throw zipError('ZIP_DOWNLOAD_FAILED', { status: response.status })
    const reader = response.body.getReader()
    const chunks = []
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      got += value.length
      loaded += value.length
      onProgress?.(total ? Math.min(99, Math.floor((loaded / total) * 100)) : 0)
    }
    if (exact && got !== entry.size) throw zipError('ZIP_SIZE_MISMATCH')
    items.push({ name: entry.name, chunks })
  }
  const blob = new Blob(buildZipParts(items), { type: 'application/zip' })
  saveBlob(blob, zipName)
  onProgress?.(100)
}

/**
 * @param {object} p
 * @param {Array<{roomId:string,name:string,size:number}>} p.files 받을 파일 (목록의 이름·크기)
 * @param {string[]} p.names ZIP 안 이름 (zipEntryNames 결과, files와 같은 순서)
 * @param {string} p.zipName 저장 파일 이름
 * @param {boolean} [p.exactSizes=true] 크기가 정확하면 받은 바이트 수를 검사하고 ZIP 길이를 미리 알린다
 * @param {(percent:number)=>void} [p.onProgress]
 */
export async function downloadZip({ files, names, zipName, exactSizes = true, onProgress }) {
  const entries = files.map((f, i) => ({ roomId: f.roomId, file: f.name, name: names[i], size: f.size }))
  const total = zipSize(entries.map((e) => ({ nameBytes: encodeName(e.name), size: e.size })))
  if (canStreamViaServiceWorker()) {
    try {
      return await streamViaServiceWorker({ entries, zipName, total, exact: exactSizes, onProgress })
    } catch (err) {
      // 등록 단계에서 실패하면 메모리 방식으로 넘어간다. 받는 중 실패는 그대로 알린다
      if (err?.code !== 'ZIP_SW_TIMEOUT' && err?.code !== 'ZIP_SW_REJECTED') throw err
    }
  }
  return zipInMemoryDownload({ entries, zipName, total, exact: exactSizes, onProgress })
}
