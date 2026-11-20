/**
 * 편집 엔진(rhwp-studio, 약 28MB wasm) 미리 받기 + 진행률.
 * 빌드가 만든 /tools/hwp/studio/manifest.json 의 파일(해시 URL, immutable 캐시)을 스트리밍으로 받으며 진행률을 알린다.
 * studio가 나중에 같은 URL을 요청하면 HTTP 캐시에서 나온다. 진행률은 원본 바이트 기준이고 MB 표시는 전송량 추정치(brotli)다.
 * 이미 캐시에 있으면 받지 않는다. 실패해도 조용히 넘어간다(studio가 직접 받는다).
 */
const MANIFEST = '/tools/hwp/studio/manifest.json'

async function inCache(url) {
  try {
    const r = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin' })
    if (!r.ok) return false
    r.body?.cancel?.()
    return true
  } catch {
    return false
  }
}

const mb = (n) => (n / 1048576).toFixed(1)

/** 표시 문구 */
export function progressText(p, lang = 'ko') {
  const ko = lang === 'ko'
  if (p.phase === 'download') {
    return ko ? `편집 엔진 받는 중 ${mb(p.estLoaded)}MB / ${mb(p.estTotal)}MB (처음 한 번만)` : `Downloading the editor engine ${mb(p.estLoaded)} MB / ${mb(p.estTotal)} MB (first time only)`
  }
  return ko ? '문서 그리는 중…' : 'Rendering the document…'
}

/**
 * @param {(p:{phase:'download', loaded:number, total:number, estLoaded:number, estTotal:number})=>void} onProgress
 * @returns {Promise<{cached:boolean}>}
 */
export async function preloadEngine(onProgress) {
  let m
  try {
    m = await (await fetch(MANIFEST)).json()
  } catch {
    return { cached: false }
  }
  const wasm = m.files[0]
  if (wasm && (await inCache(wasm.url))) return { cached: true }
  const total = m.files.reduce((a, f) => a + f.raw, 0)
  const estTotal = m.files.reduce((a, f) => a + f.est, 0)
  let loaded = 0
  const tick = () => onProgress({ phase: 'download', loaded, total, estLoaded: (loaded / total) * estTotal, estTotal })
  tick()
  await Promise.all(m.files.map(async (f) => {
    try {
      const res = await fetch(f.url)
      if (!res.ok || !res.body) return
      const rd = res.body.getReader()
      for (;;) {
        const { done, value } = await rd.read()
        if (done) break
        loaded += value.length
        tick()
      }
    } catch { /* studio가 직접 받는다 */ }
  }))
  return { cached: false }
}
