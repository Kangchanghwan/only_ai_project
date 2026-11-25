/**
 * 전송이 성공한 직후 "다음엔 와이파이가 달라도 보낼 수 있게 이 기기와 방으로 연결해 두기" 한 줄을 보여 준다 (variant 'pair').
 * 설치/단축어/즐겨찾기 변형은 클릭 1.6%라 노출하지 않는다(코드만 남김).
 * 규칙: 저장소의 {shows, done}, 최대 3회, 페이지 로드당 1회, 도착 알림 안내가 떠 있으면 건너뜀.
 * 저장·측정 실패는 동작에 영향을 주지 않는다.
 */
import { ref, getCurrentInstance, onUnmounted } from 'vue'
import { trackEvent } from '../utils/analytics'
import { isMobileUa } from '../services/p2pProbe'
import { usePWAInstall, isIOS, isStandalone } from './usePWAInstall'
import { sameIdentity } from '../utils/identity'

export const NEXT_TIME_KEY = 'cs_next_time_hint'
export const MAX_SHOWS = 3
export const SHOW_DELAY_MS = 1200
export const AUTO_HIDE_MS = 20000

function safeTrack(name, params) {
  try { trackEvent(name, params) } catch { /* 측정 실패 무시 */ }
}

function load() {
  try {
    const raw = localStorage.getItem(NEXT_TIME_KEY)
    if (!raw) return { shows: 0, done: false }
    const v = JSON.parse(raw)
    const shows = Number.isFinite(v?.shows) && v.shows > 0 ? Math.floor(v.shows) : 0
    return { shows, done: v?.done === true }
  } catch {
    return { shows: 0, done: false }
  }
}

function save(state) {
  try { localStorage.setItem(NEXT_TIME_KEY, JSON.stringify(state)) } catch { /* 무시 */ }
}

/** Mac은 ⌘D, 그 외는 Ctrl+D */
export function bookmarkKey() {
  if (typeof navigator === 'undefined') return 'Ctrl+D'
  return /Mac/i.test(navigator.platform || navigator.userAgent || '') ? '⌘D' : 'Ctrl+D'
}

/** 예전 변형(설치·단축어·즐겨찾기)을 다시 보여 줄 때 true로 바꾼다 */
const LEGACY_VARIANTS_ENABLED = false

/**
 * '방으로 연결' 힌트를 보여 줄 상대 기기. 아래를 모두 만족할 때만 그 기기, 아니면 null.
 * 1) 같은 네트워크 탭에서 성공  2) 그 탭의 다른 기기가 정확히 1대  3) 그 기기와 아직 1:1 방이 없음  4) 진행 중인 다른 초대가 없음
 * @param {{ scope: string|null, devices: object[], mySocketId: string|null, pairStates: object, rooms: object[], busy: boolean }} p
 */
export function pickPairTarget({ scope, devices, mySocketId, pairStates = {}, rooms = [], busy = false }) {
  if (scope !== 'ip') return null
  const others = (Array.isArray(devices) ? devices : []).filter((d) => d?.socketId && d.socketId !== mySocketId)
  if (others.length !== 1) return null
  const dev = others[0]
  if (pairStates[dev.socketId]) return null
  if (rooms.some((r) => r?.peer && (r.peer.socketId === dev.socketId || (dev.identity && sameIdentity(r.peer.identity, dev.identity))))) return null
  if (busy || Object.values(pairStates).some((st) => st?.state !== 'paired')) return null
  return dev
}

/**
 * @param {{ isBlocked?: () => boolean, getPairTarget?: (scope: string|null) => object|null, onPair?: (device: object) => void }} opts
 *   isBlocked: 다른 창이 떠 있으면 true. getPairTarget: pickPairTarget으로 고른 상대. onPair: 기기 카드 '연결'과 같은 초대 흐름
 */
export function useNextTimeHint({ isBlocked = () => false, getPairTarget = () => null, onPair = () => {} } = {}) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall()
  const visible = ref(false)
  const variant = ref(null)
  const kind = ref(null)
  const peer = ref(null) // variant 'pair'의 상대 기기
  let used = false // 이번 페이지 로드에서 이미 보여 줬다
  let showTimer = null
  let hideTimer = null

  /** 지금 환경에 맞는 종류. 보여 주지 않을 환경이면 null */
  function computeVariant(scope) {
    try {
      const dev = getPairTarget(scope)
      if (dev) { peer.value = dev; return 'pair' }
    } catch { /* 무시 */ }
    if (!LEGACY_VARIANTS_ENABLED) return null
    if (isStandalone() || isInstalled.value) return null
    if (isIOS()) return 'ios_shortcut'
    if (canInstall.value) return 'install'
    if (!isMobileUa()) return 'bookmark'
    return null
  }

  function clearTimers() {
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  }

  function show(k, scope) {
    showTimer = null
    if (used) return
    const state = load()
    if (state.done || state.shows >= MAX_SHOWS) return
    if (isBlocked()) return
    const v = computeVariant(scope)
    if (!v) return
    used = true
    state.shows += 1
    save(state)
    variant.value = v
    kind.value = k
    visible.value = true
    safeTrack('next_time_hint_view', { variant: v, kind: k })
    hideTimer = setTimeout(() => { hideTimer = null; visible.value = false }, AUTO_HIDE_MS)
  }

  /** 전송 성공 지점에서 호출한다. kind: upload | download | text | copy, scope: 'ip' | 'global' | 방 ID */
  function markSuccess(k, scope = null) {
    try {
      if (used || showTimer) return
      const state = load()
      if (state.done || state.shows >= MAX_SHOWS) return
      showTimer = setTimeout(() => show(k, scope), SHOW_DELAY_MS)
    } catch { /* 무시 */ }
  }

  /** 닫기·버튼 클릭: 더 이상 보여 주지 않는다 */
  function finish() {
    clearTimers()
    visible.value = false
    const state = load()
    state.done = true
    save(state)
  }

  /** 다른 창이 떠서 안내가 버튼을 가릴 때: 이번 페이지에서만 숨긴다 (기기 기록은 그대로) */
  function hide() {
    clearTimers()
    visible.value = false
  }

  /** 닫기 버튼 */
  function dismiss() {
    if (variant.value) safeTrack('next_time_hint_dismiss', { variant: variant.value })
    finish()
  }

  /** 안내 버튼 클릭 (install이면 설치 창을 연다) */
  function act() {
    const v = variant.value
    if (v) safeTrack('next_time_hint_click', { variant: v })
    const dev = peer.value
    finish()
    if (v === 'install') promptInstall()
    if (v === 'pair' && dev) { try { onPair(dev) } catch { /* 무시 */ } }
  }

  if (getCurrentInstance()) onUnmounted(clearTimers)

  return { visible, variant, kind, peer, markSuccess, dismiss, act, hide }
}
