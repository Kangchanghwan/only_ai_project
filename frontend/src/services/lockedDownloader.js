/**
 * 잠긴 파일 풀기 + 받기.
 *
 * 1) 메타(salt) 조회 → 2) 비밀번호로 verifier 파생(이번 접속에서 같은 salt를 풀었으면 생략)
 * → 3) 서버가 verifier를 확인하면 60초 다운로드 URL과 감싼 키를 준다 → 4) 이 기기에서 키·파일명을 푼다
 * → 5) 받으면서 푼다: 서비스워커 스트리밍(큰 파일도 메모리에 올리지 않음), 안 되면 메모리 복호화(500MB까지).
 * 풀린 내용은 서버로 다시 보내지 않는다.
 */
import { r2Service } from './r2Service.js'
import { t } from '../i18n/translate.js'
import {
  LOCK_VERSION, RECORD_SIZE, deriveLock, unwrapFileKeyRaw, importRawKey, decryptName, fromB64u, createDecryptor
} from '../utils/lockCrypto.js'

const MB = 1024 * 1024
/** 메모리 복호화 상한 (평문). 넘으면 다른 기기에서 받도록 안내한다 */
export const MEMORY_DECRYPT_LIMIT = 500 * MB
const SW_REGISTER_TIMEOUT_MS = 3000
const SW_STALL_TIMEOUT_MS = 60000

const lockError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra })

/** iOS(아이패드 데스크톱 모드 포함)는 서비스워커 스트리밍 다운로드가 불안정해 메모리 방식으로 받는다 */
export function isIOS(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}

export function canStreamViaServiceWorker() {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller && !isIOS()
}

/** 서비스워커에 다운로드 작업을 등록한다 (키는 이 탭과 서비스워커 사이에서만 오간다) */
function registerJob(job) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => reject(lockError('LOCK_SW_TIMEOUT')), SW_REGISTER_TIMEOUT_MS)
    channel.port1.onmessage = (e) => {
      clearTimeout(timer)
      if (e.data?.ok) resolve()
      else reject(lockError('LOCK_SW_REJECTED'))
    }
    navigator.serviceWorker.controller.postMessage({ type: 'LOCKED_REGISTER', ...job }, [channel.port2])
  })
}

async function streamViaServiceWorker({ url, size, ctSize, dkRaw, np, name, onProgress }) {
  const token = (globalThis.crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '')
  await registerJob({ token, url, size, ctSize, dk: dkRaw, np, name })
  return new Promise((resolve, reject) => {
    let stall
    const frame = document.createElement('iframe')
    const cleanup = () => {
      clearTimeout(stall)
      navigator.serviceWorker.removeEventListener('message', onMessage)
      setTimeout(() => frame.remove(), 1000)
    }
    const arm = () => {
      clearTimeout(stall)
      stall = setTimeout(() => { cleanup(); reject(lockError('LOCK_DOWNLOAD_STALLED')) }, SW_STALL_TIMEOUT_MS)
    }
    function onMessage(e) {
      const d = e.data
      if (!d || d.type !== 'LOCKED_PROGRESS' || d.token !== token) return
      arm()
      if (d.error) { cleanup(); reject(lockError(d.error)); return }
      onProgress?.(ctSize ? Math.min(100, Math.floor((d.loaded / ctSize) * 100)) : 0)
      if (d.done) { cleanup(); resolve() }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    arm()
    frame.style.display = 'none'
    frame.src = `/__locked/${token}`
    document.body.appendChild(frame)
  })
}

/** 메모리 복호화 (서비스워커를 못 쓸 때) */
export async function decryptInMemory({ url, size, ctSize, dkRaw, np, onProgress, fetchImpl = fetch }) {
  if (size > MEMORY_DECRYPT_LIMIT) throw lockError('LOCK_TOO_LARGE_FOR_DEVICE')
  const dk = await importRawKey(dkRaw)
  const response = await fetchImpl(url)
  if (!response.ok || !response.body) throw lockError('LOCK_DOWNLOAD_FAILED', { status: response.status })
  const reader = response.body.getReader()
  const decryptor = createDecryptor(dk, np, size)
  const parts = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.length
    parts.push(...(await decryptor.push(value)))
    onProgress?.(ctSize ? Math.min(100, Math.floor((loaded / ctSize) * 100)) : 0)
  }
  decryptor.finish()
  return new Blob(parts, { type: 'application/octet-stream' })
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

/** 받으면서 풀어 저장한다 */
export async function downloadLocked(job) {
  if (canStreamViaServiceWorker()) {
    try {
      return await streamViaServiceWorker(job)
    } catch (err) {
      // 등록 단계에서 실패하면 메모리 방식으로 넘어간다. 전송 중 실패는 그대로 알린다
      if (err?.code !== 'LOCK_SW_TIMEOUT' && err?.code !== 'LOCK_SW_REJECTED') throw err
    }
  }
  const blob = await decryptInMemory(job)
  saveBlob(blob, job.name)
}

/**
 * 잠긴 파일을 푼다.
 * @param {object} p
 * @param {string} p.roomId
 * @param {string} p.id 서버 파일 id
 * @param {string} [p.password] 없으면 이번 접속에서 같은 salt를 푼 적이 있을 때만 성공 (아니면 NEED_PASSWORD)
 * @param {ReturnType<import('../composables/useLockState').useLockState>} p.lockState
 * @param {(name:string)=>void} [p.onName] 파일명을 푼 순간
 * @param {(percent:number)=>void} [p.onProgress]
 * @param {boolean} [p.download=true]
 * @returns {Promise<{name:string}>}
 */
/**
 * 잠긴 파일을 증명과 함께 지운다.
 * 내가 올린 파일이면 삭제 키, 아니면 이번 접속에서 확인한 비밀번호(같은 salt)의 확인값을 쓴다.
 * 둘 다 없으면 서버에 묻지 않고 NEED_PASSWORD를 던진다 (화면에는 삭제 버튼이 없어야 하는 경우).
 */
export async function deleteLockedWithProof({ roomId, id, lockState }) {
  const deleteKey = lockState.deleteKeyFor(roomId, id)
  if (deleteKey) return r2Service.deleteLockedFile(roomId, id, { deleteKey })
  const meta = await r2Service.lockedMeta(roomId, id)
  const entry = lockState.keyFor(meta.salt)
  if (!entry) throw Object.assign(new Error(t('lock.errors.deleteForbidden')), { code: 'NEED_PASSWORD' })
  return r2Service.deleteLockedFile(roomId, id, { verifier: entry.verifier })
}

export async function openLockedFile({ roomId, id, password, lockState, onName, onProgress, download = true }) {
  const meta = await r2Service.lockedMeta(roomId, id)
  if (meta.v !== LOCK_VERSION || (meta.rs && meta.rs !== RECORD_SIZE)) throw lockError('LOCK_UNSUPPORTED')
  if (meta.remaining === 0) throw lockError('LOCKED_OUT', { remaining: 0 })
  // 스트리밍을 못 쓰는 기기에서 너무 큰 파일은 비밀번호를 묻기 전에 안내한다
  if (download && !canStreamViaServiceWorker() && meta.size > MEMORY_DECRYPT_LIMIT) throw lockError('LOCK_TOO_LARGE_FOR_DEVICE')

  let entry = lockState.keyFor(meta.salt)
  let derived = null
  if (!entry) {
    if (!password) throw lockError('NEED_PASSWORD', { remaining: meta.remaining })
    derived = await deriveLock(password, meta.salt)
    entry = { encKey: derived.encKey, verifier: derived.verifier }
  }

  const res = await r2Service.lockedUnlock(roomId, id, entry.verifier)
  if (derived) lockState.rememberKey(meta.salt, derived.encKey, derived.verifier)

  const dkRaw = await unwrapFileKeyRaw(entry.encKey, res.wk, res.wkIv)
  const dk = await importRawKey(dkRaw)
  const name = await decryptName(dk, res.en, res.enIv)
  lockState.rememberName(roomId, id, name)
  onName?.(name)

  if (download) {
    await downloadLocked({
      url: res.url,
      size: res.size,
      ctSize: res.ctSize,
      dkRaw,
      np: fromB64u(res.np),
      name,
      onProgress
    })
  }
  return { name }
}
