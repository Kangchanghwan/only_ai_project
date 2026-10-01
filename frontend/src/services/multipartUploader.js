/**
 * R2 멀티파트(조각) 업로드 + 이어올리기.
 *
 * - 100MB 초과 파일은 64MiB 파트로 잘라 동시에 N개씩 PUT 한다 (모바일 UA는 2개).
 * - 파트별 재시도(최대 4회, 지수 백오프 1s/2s/4s/8s), 서명 만료 대비 재서명.
 * - 오프라인이면 일시정지했다가 online 이벤트에 재개한다 (재시도 횟수를 소모하지 않음).
 * - localStorage의 지문(fingerprint)으로 같은 파일을 다시 고르면 완료된 파트를 건너뛴다.
 */

const MB = 1024 * 1024

/** 이 크기를 넘는 파일은 멀티파트, 이하는 단일 PUT (서버 단일 presign 상한과 동일) */
export const MULTIPART_THRESHOLD = 100 * MB
export const DEFAULT_PART_SIZE = 64 * MB
export const MAX_SIGN_BATCH = 20
export const MAX_PART_RETRIES = 4
export const RETRY_BASE_DELAY_MS = 1000
/** 서명 URL은 1시간 유효 — 50분이 지나면 재서명 */
export const SIGN_TTL_MS = 50 * 60 * 1000
export const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const STORAGE_PREFIX = 'mpu:'

export const isMultipartFile = (size) => size > MULTIPART_THRESHOLD

/** 모바일 UA는 동시 2개, 그 외 4개 */
export function uploadConcurrency(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? 2 : 4
}

/** 파트 목록 [{partNumber, start, end, length}] (마지막 파트는 나머지 크기) */
export function splitParts(size, partSize = DEFAULT_PART_SIZE) {
  const parts = []
  const count = Math.ceil(size / partSize)
  for (let i = 0; i < count; i++) {
    const start = i * partSize
    const end = Math.min(start + partSize, size)
    parts.push({ partNumber: i + 1, start, end, length: end - start })
  }
  return parts
}

export const fingerprintOf = (roomId, file) => `${STORAGE_PREFIX}${roomId}|${file.name}|${file.size}|${file.lastModified}`

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function readSaved(storage, fp, now) {
  if (!storage) return null
  try {
    const raw = storage.getItem(fp)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved?.uploadId || !saved?.key || now - saved.createdAt > RESUME_MAX_AGE_MS) {
      storage.removeItem(fp)
      return null
    }
    return saved
  } catch {
    return null
  }
}

/** 24시간이 지난 저장 항목을 모두 정리한다 */
export function pruneStaleUploads(storage = defaultStorage(), now = Date.now()) {
  if (!storage) return
  try {
    const keys = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k)
    }
    for (const k of keys) readSaved(storage, k, now)
  } catch {
    /* 저장소 접근 불가는 무시 */
  }
}

function waitForOnline() {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve()
  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener('online', handler)
      resolve()
    }
    window.addEventListener('online', handler)
  })
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const cancelError = () => Object.assign(new Error('Upload canceled'), { code: 'UPLOAD_CANCELED' })

/**
 * 파트 하나를 XHR로 PUT 하고 ETag를 돌려준다 (진행률: 바이트).
 * ETag를 못 읽으면(CORS expose 누락) NO_ETAG 에러.
 */
export function putPartXhr(url, blob, { onProgress, signal, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')
        if (!etag) reject(Object.assign(new Error('ETag header missing'), { code: 'NO_ETAG', retryable: false }))
        else resolve(etag)
      } else {
        reject(Object.assign(new Error(`Part upload failed: ${xhr.status}`), { status: xhr.status }))
      }
    })
    xhr.addEventListener('error', () => reject(Object.assign(new Error('Network error'), { network: true })))
    xhr.addEventListener('timeout', () => reject(Object.assign(new Error('Timeout'), { network: true })))
    xhr.addEventListener('abort', () => reject(cancelError()))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.open('PUT', url)
    xhr.timeout = timeoutMs
    xhr.send(blob)
  })
}

/**
 * @param {string} roomId
 * @param {File} file
 * @param {object} opts
 * @param {object} opts.api  { create, sign, parts, complete, abort } (r2Service의 multipart* 래퍼)
 * @param {(percent:number)=>void} [opts.onProgress]
 * @param {()=>void} [opts.onResume]  이어올리기 시작 시 1회
 * @param {AbortSignal} [opts.signal]  취소 시 서버 abort + 저장 항목 삭제
 * @param {number} [opts.concurrency]
 * @param {object} [opts.deps]  테스트 주입: putPart, storage, sleep, now
 * @returns {Promise<{fileName,fileUrl,size,parts,retries,resumed}>}
 */
export async function multipartUpload(roomId, file, opts) {
  const { api, onProgress, onResume, signal } = opts
  const deps = opts.deps || {}
  const putPart = deps.putPart || putPartXhr
  const sleep = deps.sleep || defaultSleep
  const now = deps.now || Date.now
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const concurrency = opts.concurrency ?? uploadConcurrency()
  const contentType = file.type || 'application/octet-stream'
  const fp = fingerprintOf(roomId, file)

  const save = (session) => {
    try { storage?.setItem(fp, JSON.stringify(session)) } catch { /* 용량/권한 오류는 이어올리기만 포기 */ }
  }
  const forget = () => {
    try { storage?.removeItem(fp) } catch { /* ignore */ }
  }

  // === 1. 세션 준비 (이어올리기 or 새로 시작) ===
  const done = new Map() // partNumber -> ETag
  let session = null
  let resumed = false
  const saved = readSaved(storage, fp, now())
  if (saved) {
    try {
      const listed = await api.parts(roomId, { uploadId: saved.uploadId, key: saved.key, size: file.size })
      const partSize = saved.partSize
      const expected = splitParts(file.size, partSize)
      for (const p of listed.parts || []) {
        const spec = expected[p.PartNumber - 1]
        if (spec && p.Size === spec.length) done.set(p.PartNumber, p.ETag)
      }
      session = { ...saved }
      resumed = true
    } catch {
      forget() // 서버에서 사라진 업로드 → 새로 시작
    }
  }
  if (!session) {
    const created = await api.create(roomId, { fileName: file.name, contentType, size: file.size })
    session = { uploadId: created.uploadId, key: created.key, partSize: created.partSize, createdAt: now() }
    save(session)
  }
  if (resumed) onResume?.()

  const parts = splitParts(file.size, session.partSize)
  const target = { uploadId: session.uploadId, key: session.key, size: file.size }
  const startedAt = now()
  let retries = 0

  // === 2. 진행률 (바이트 합산) ===
  const inflight = new Map() // partNumber -> loaded
  let doneBytes = 0
  for (const n of done.keys()) doneBytes += parts[n - 1].length
  let lastPercent = -1
  const report = () => {
    let loaded = doneBytes
    for (const v of inflight.values()) loaded += v
    const percent = Math.min(100, Math.floor((loaded / file.size) * 100))
    if (percent !== lastPercent) {
      lastPercent = percent
      onProgress?.(percent)
    }
  }
  report()

  // === 3. 서명 URL 캐시 (배치 요청 + 만료 대비) ===
  const urls = new Map() // partNumber -> { url, at }
  const queue = parts.filter((p) => !done.has(p.partNumber)).map((p) => p.partNumber)
  let signLock = Promise.resolve()
  const fresh = (n) => urls.has(n) && now() - urls.get(n).at < SIGN_TTL_MS

  const getUrl = (partNumber) => {
    const run = signLock.then(async () => {
      if (fresh(partNumber)) return urls.get(partNumber).url
      const batch = [partNumber]
      for (const n of queue) {
        if (batch.length >= MAX_SIGN_BATCH) break
        if (n !== partNumber && !fresh(n) && !done.has(n)) batch.push(n)
      }
      const res = await api.sign(roomId, { ...target, partNumbers: batch })
      const at = now()
      for (const u of res.urls) urls.set(u.partNumber, { url: u.url, at })
      return urls.get(partNumber).url
    })
    signLock = run.catch(() => {})
    return run
  }

  const throwIfCanceled = () => {
    if (signal?.aborted) throw cancelError()
  }

  // === 4. 파트 업로드 (재시도) ===
  async function uploadPart(partNumber) {
    const spec = parts[partNumber - 1]
    const blob = file.slice(spec.start, spec.end)
    let attempt = 0
    for (;;) {
      throwIfCanceled()
      await waitForOnline()
      throwIfCanceled()
      try {
        const url = await getUrl(partNumber)
        inflight.set(partNumber, 0)
        const etag = await putPart(url, blob, {
          signal,
          onProgress: (loaded) => {
            inflight.set(partNumber, Math.min(loaded, spec.length))
            report()
          },
        })
        inflight.delete(partNumber)
        done.set(partNumber, etag)
        doneBytes += spec.length
        report()
        return
      } catch (err) {
        inflight.delete(partNumber)
        report()
        if (err?.code === 'UPLOAD_CANCELED' || signal?.aborted) throw cancelError()
        if (err?.retryable === false) throw err
        // 서명 만료/거절은 재서명
        if (err?.status === 403 || err?.status === 400) urls.delete(partNumber)
        // 오프라인 중 발생한 실패는 재시도 횟수를 소모하지 않고 online 대기
        if (typeof navigator !== 'undefined' && navigator.onLine === false) continue
        if (attempt >= MAX_PART_RETRIES) throw err
        retries++
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
        attempt++
      }
    }
  }

  // === 5. 제한 병렬 실행 ===
  let failure = null
  const pending = [...queue]
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (!failure) {
      const n = pending.shift()
      if (n === undefined) return
      try {
        await uploadPart(n)
      } catch (err) {
        failure = failure || err
      }
    }
  })
  await Promise.all(workers)

  const partsDone = done.size
  if (failure) {
    if (failure.code === 'UPLOAD_CANCELED') {
      forget()
      try { await api.abort(roomId, target) } catch { /* 서버 정리는 룸 종료 시에도 수행 */ }
    }
    // 그 외 실패는 저장 항목을 남겨 같은 파일 재선택 시 이어올리기
    throw Object.assign(failure, { partsDone, totalParts: parts.length, retries })
  }

  // === 6. 완료 ===
  const completeParts = [...done.entries()].sort((a, b) => a[0] - b[0]).map(([PartNumber, ETag]) => ({ PartNumber, ETag }))
  try {
    const result = await api.complete(roomId, { ...target, parts: completeParts })
    forget()
    return {
      fileName: result.fileName,
      fileUrl: result.fileUrl,
      size: result.size ?? file.size,
      parts: parts.length,
      retries,
      resumed,
      durationS: Math.round((now() - startedAt) / 1000),
    }
  } catch (err) {
    if (err?.code === 'SIZE_MISMATCH' || err?.code === 'UPLOAD_NOT_FOUND') forget()
    throw Object.assign(err, { partsDone, totalParts: parts.length, retries })
  }
}
