/**
 * 도착 알림 (Web Push): 탭이 닫혀 있어도 파일·텍스트가 도착하면 알림을 받는다.
 * 서버에 VAPID 키가 없으면(GET /api/push/key 404) 지원하지 않는 것으로 보고 UI를 숨긴다.
 * 모든 호출은 실패해도 앱 동작에 영향을 주지 않는다. 분석 이벤트에 방 ID·입장권·키는 넣지 않는다.
 */
import { ref } from 'vue'
import { trackEvent } from '../utils/analytics'
import { currentLocale } from '../i18n/translate'
import { socketService } from '../services/socketService'
import { usePrivateRooms } from './usePrivateRooms'

export const PUSH_ID_KEY = 'cs_push_id'
export const PUSH_STATE_KEY = 'cs_push'
const SW_READY_TIMEOUT_MS = 5000
const SYNC_DEBOUNCE_MS = 1000

/** 서버에 키가 있고 이 브라우저가 푸시를 지원하는지 (init 뒤에 확정) */
const supported = ref(false)
/** 이 기기에서 도착 알림을 켜 둔 상태 (cs_push === 'on') */
const enabled = ref(false)
/** 'default' | 'granted' | 'denied' | 'unsupported' */
const permission = ref('default')

let supportPromise = null
let syncTimer = null
let syncRunning = null
let syncAgain = false

const apiUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3001'

function store(key) { try { return localStorage.getItem(key) } catch { return null } }
function storeSet(key, v) { try { localStorage.setItem(key, v) } catch { /* 무시 */ } }

function safeTrack(name, params) {
  try { if (params === undefined) trackEvent(name); else trackEvent(name, params) } catch { /* 측정 실패 무시 */ }
}

/** 브라우저 기능 감지 (iOS는 홈 화면에 추가한 웹 앱에서만 PushManager가 있다) */
function featureDetect() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window
    && typeof Notification !== 'undefined'
}

function readPermission() {
  permission.value = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  return permission.value
}

/** 이 기기의 구독 식별자. 서버가 기기를 구분하는 용도일 뿐 사람과 연결되지 않는다 */
export function getPushId() {
  const cur = store(PUSH_ID_KEY)
  if (cur && /^[0-9a-f]{32}$/.test(cur)) return cur
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const pid = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  storeSet(PUSH_ID_KEY, pid)
  return pid
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function fetchKey() {
  try {
    const res = await fetch(`${apiUrl()}/api/push/key`)
    if (!res.ok) return null
    const body = await res.json()
    return typeof body?.key === 'string' && body.key ? body.key : null
  } catch {
    return null
  }
}

let serverKey = null

/** 지원 여부: 기능 감지 + 서버 키(200). 결과는 한 번만 확인한다 */
function isSupported() {
  if (!supportPromise) {
    supportPromise = (async () => {
      if (!featureDetect()) { supported.value = false; return false }
      serverKey = await fetchKey()
      supported.value = !!serverKey
      return supported.value
    })()
  }
  return supportPromise
}

async function swReady() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SW_TIMEOUT')), SW_READY_TIMEOUT_MS)),
  ])
}

function ticketsNow() {
  try {
    return usePrivateRooms().rooms.filter((r) => r.status !== 'left' && r.ticket).map((r) => r.ticket).slice(0, 10)
  } catch {
    return []
  }
}

async function postJson(path, body) {
  const res = await fetch(`${apiUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUSH_HTTP_${res.status}`)
  return res
}

async function subscribeBrowser(reg) {
  const opts = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(serverKey) }
  try {
    return await reg.pushManager.subscribe(opts)
  } catch (e) {
    // 서버 키가 바뀐 뒤에는 기존 구독이 막힌다: 지우고 다시 만든다
    const old = await reg.pushManager.getSubscription()
    if (!old) throw e
    await old.unsubscribe()
    return reg.pushManager.subscribe(opts)
  }
}

async function postSubscribe(sub) {
  const json = typeof sub.toJSON === 'function' ? sub.toJSON() : sub
  const lang = (() => { try { return currentLocale() } catch { return 'en' } })()
  await postJson('/api/push/subscribe', {
    pid: getPushId(),
    subscription: { endpoint: json.endpoint, keys: json.keys },
    lang,
    tickets: ticketsNow(),
  })
}

function bindSocket() {
  try { socketService.pushBind?.(getPushId()) } catch { /* 무시 */ }
}

/** 앱 시작 때 한 번: 지원 여부와 저장된 상태를 읽는다 */
async function init() {
  readPermission()
  enabled.value = store(PUSH_STATE_KEY) === 'on' && permission.value === 'granted'
  return isSupported()
}

/**
 * 도착 알림 켜기. 사용자 동작(클릭) 안에서 불러야 한다.
 * 권한 요청이 첫 await이어야 Safari가 사용자 동작으로 인정한다.
 * @returns {Promise<{ok: boolean, reason?: 'unsupported'|'denied'|'error'}>}
 */
async function enable() {
  if (!featureDetect()) return { ok: false, reason: 'unsupported' }
  let result = 'default'
  try {
    const r = Notification.requestPermission()
    result = (r && typeof r.then === 'function' ? await r : r) || Notification.permission
  } catch { /* 무시 */ }
  readPermission()
  if (result !== 'granted') {
    safeTrack('push_subscribe', { result: 'denied' })
    return { ok: false, reason: 'denied' }
  }
  try {
    if (!(await isSupported())) return { ok: false, reason: 'unsupported' }
    const reg = await swReady()
    const sub = await subscribeBrowser(reg)
    await postSubscribe(sub)
    storeSet(PUSH_STATE_KEY, 'on')
    enabled.value = true
    bindSocket()
    safeTrack('push_subscribe', { result: 'ok' })
    return { ok: true }
  } catch (e) {
    console.warn('[Push] 켜기 실패:', e?.message || e)
    safeTrack('push_subscribe', { result: 'error' })
    return { ok: false, reason: 'error' }
  }
}

async function doSync() {
  if (store(PUSH_STATE_KEY) !== 'on') return
  if (!featureDetect() || readPermission() !== 'granted') return
  try {
    if (!(await isSupported())) return
    const reg = await swReady()
    const sub = (await reg.pushManager.getSubscription()) || (await subscribeBrowser(reg))
    await postSubscribe(sub)
    enabled.value = true
    bindSocket()
  } catch {
    /* 조용히 무시: 다음 기회에 다시 맞춘다 */
  }
}

/** 구독 확인 + 서버 등록 + 소켓 묶기. 동시에 여러 번 불러도 한 번 더 돌 뿐이다 */
function sync() {
  if (syncRunning) { syncAgain = true; return syncRunning }
  syncRunning = doSync().finally(() => {
    syncRunning = null
    if (syncAgain) { syncAgain = false; sync() }
  })
  return syncRunning
}

/** 비공개 방 목록 변경처럼 짧은 시간에 여러 번 불리는 경우 */
function syncSoon() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { syncTimer = null; sync() }, SYNC_DEBOUNCE_MS)
}

/** 도착 알림 끄기 */
async function disable() {
  let endpoint = null
  try {
    if (featureDetect()) {
      const reg = await swReady()
      const sub = await reg.pushManager.getSubscription()
      endpoint = sub?.endpoint || null
      if (sub) await sub.unsubscribe()
    }
  } catch { /* 무시 */ }
  if (endpoint) {
    try { await postJson('/api/push/unsubscribe', { pid: getPushId(), endpoint }) } catch { /* 서버 쪽 정리는 만료로 처리된다 */ }
  }
  storeSet(PUSH_STATE_KEY, 'off')
  enabled.value = false
  safeTrack('push_unsubscribe')
  return { ok: true }
}

/** 테스트용: 모듈 상태를 되돌린다 */
export function _resetPushForTests() {
  supportPromise = null
  serverKey = null
  supported.value = false
  enabled.value = false
  permission.value = 'default'
  syncRunning = null
  syncAgain = false
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
}

export function usePush() {
  return { supported, enabled, permission, init, isSupported, enable, disable, sync, syncSoon, readPermission }
}
