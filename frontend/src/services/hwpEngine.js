/**
 * 편집 엔진(rhwp-studio, 약 28MB wasm) 미리 받기 + 진행률.
 * 편집기 출처의 manifest.json 에 적힌 파일(해시 URL, immutable 캐시)을 스트리밍으로 받으며 진행률을 알린다.
 * manifest 안의 주소는 /assets/... 같은 루트 기준이라 manifest 주소를 기준으로 풀어 쓴다.
 * studio가 나중에 같은 URL을 요청하면 HTTP 캐시에서 나온다. 진행률은 원본 바이트 기준이고 MB 표시는 전송량 추정치(brotli)다.
 *
 * 캐시 확인: 다른 출처라 cache:'only-if-cached'(same-origin 전용)를 쓸 수 없다.
 * 끝까지 받은 파일 주소를 이 사이트 localStorage 에 적어 두고, 다음 방문에 엔진(wasm) 주소가 모두 적혀 있으면 받지 않는다.
 * 받은 직후 Resource Timing 의 transferSize===0 (Timing-Allow-Origin 이 있어 다른 출처도 보임) 이면 이미 캐시에 있던 것이다.
 * 실패해도 조용히 넘어간다(studio가 직접 받는다).
 */
import { editorConfig } from './hwpStudio.js'

export const RECORD_KEY = 'cb-hwp-engine-cached'

const mb = (n) => (n / 1048576).toFixed(1)

/** 표시 문구 */
export function progressText(p, lang = 'ko') {
  const ko = lang === 'ko'
  if (p.phase === 'download') {
    return ko ? `편집 엔진 받는 중 ${mb(p.estLoaded)}MB / ${mb(p.estTotal)}MB (처음 한 번만)` : `Downloading the editor engine ${mb(p.estLoaded)} MB / ${mb(p.estTotal)} MB (first time only)`
  }
  return ko ? '문서 그리는 중…' : 'Rendering the document…'
}

/** manifest 의 파일 주소를 manifest 주소 기준 절대 주소로 */
export function resolveFiles(manifest, manifestUrl) {
  return (manifest?.files || []).map((f) => ({ ...f, url: new URL(f.url, manifestUrl).href }))
}

/** 캐시 여부를 판단할 파일: wasm 전부 (없으면 첫 파일) */
export function keyFiles(files) {
  const w = files.filter((f) => /\.wasm(\?|$)/.test(f.url))
  return w.length ? w : files.slice(0, 1)
}

export function readRecord(storage) {
  try {
    const v = JSON.parse(storage?.getItem(RECORD_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** 지금 manifest 에 있는 주소만 남기고 done 을 더해 적는다 (옛 해시 주소는 지워짐) */
export function writeRecord(storage, files, done) {
  try {
    const now = new Set(files.map((f) => f.url))
    const keep = readRecord(storage).filter((u) => now.has(u))
    const next = [...new Set([...keep, ...done])]
    storage?.setItem(RECORD_KEY, JSON.stringify(next))
  } catch { /* 저장소를 못 쓰면 다음에도 받는다 */ }
}

export function isRecorded(files, record) {
  const keys = keyFiles(files)
  if (!keys.length) return false
  const set = new Set(record)
  return keys.every((f) => set.has(f.url))
}

/** Resource Timing 으로 본 캐시 적중: 전송 0바이트이면서 본문이 있음 */
export function servedFromCache(url, perf = globalThis.performance) {
  try {
    const list = perf?.getEntriesByName?.(url) || []
    const e = list[list.length - 1]
    return !!e && e.transferSize === 0 && e.decodedBodySize > 0
  } catch {
    return false
  }
}

const safeStorage = () => {
  try { return globalThis.localStorage } catch { return null }
}

/**
 * @param {(p:{phase:'download', loaded:number, total:number, estLoaded:number, estTotal:number})=>void} onProgress
 * @param {{ base?: string, storage?: Storage|null, perf?: Performance }} [opts]
 * @returns {Promise<{cached:boolean, fromHttpCache?:boolean}>}
 */
export async function preloadEngine(onProgress, { base, storage = safeStorage(), perf = globalThis.performance } = {}) {
  let files
  try {
    const manifestUrl = new URL('manifest.json', base || editorConfig().base).href
    files = resolveFiles(await (await fetch(manifestUrl)).json(), manifestUrl)
  } catch {
    return { cached: false }
  }
  if (!files.length) return { cached: false }
  if (isRecorded(files, readRecord(storage))) return { cached: true }
  const total = files.reduce((a, f) => a + f.raw, 0)
  const estTotal = files.reduce((a, f) => a + f.est, 0)
  let loaded = 0
  const done = []
  const tick = () => onProgress({ phase: 'download', loaded, total, estLoaded: (loaded / total) * estTotal, estTotal })
  tick()
  await Promise.all(files.map(async (f) => {
    try {
      const res = await fetch(f.url)
      if (!res.ok || !res.body) return
      const rd = res.body.getReader()
      for (;;) {
        const { done: end, value } = await rd.read()
        if (end) break
        loaded += value.length
        tick()
      }
      done.push(f.url)
    } catch { /* studio가 직접 받는다 */ }
  }))
  writeRecord(storage, files, done)
  const fromHttpCache = keyFiles(files).every((f) => servedFromCache(f.url, perf))
  return { cached: false, fromHttpCache }
}
