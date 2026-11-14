/**
 * 전송이 성공한 직후 "다음엔 더 빨리 열 수 있는 길" 한 줄을 보여 준다 (설치/단축어/즐겨찾기).
 * 규칙: 저장소의 {shows, done}, 최대 3회, 페이지 로드당 1회, 도착 알림 안내가 떠 있으면 건너뜀.
 * 저장·측정 실패는 동작에 영향을 주지 않는다.
 */
import { ref, getCurrentInstance, onUnmounted } from 'vue'
import { trackEvent } from '../utils/analytics'
import { isMobileUa } from '../services/p2pProbe'
import { usePWAInstall, isIOS, isStandalone } from './usePWAInstall'

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

/**
 * @param {{ isBlocked?: () => boolean }} opts isBlocked: 다른 안내(도착 알림 요청)가 떠 있으면 true
 */
export function useNextTimeHint({ isBlocked = () => false } = {}) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall()
  const visible = ref(false)
  const variant = ref(null)
  const kind = ref(null)
  let used = false // 이번 페이지 로드에서 이미 보여 줬다
  let showTimer = null
  let hideTimer = null

  /** 지금 환경에 맞는 종류. 보여 주지 않을 환경이면 null */
  function computeVariant() {
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

  function show(k) {
    showTimer = null
    if (used) return
    const state = load()
    if (state.done || state.shows >= MAX_SHOWS) return
    if (isBlocked()) return
    const v = computeVariant()
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

  /** 전송 성공 지점에서 호출한다. kind: upload | download | text | copy */
  function markSuccess(k) {
    try {
      if (used || showTimer) return
      const state = load()
      if (state.done || state.shows >= MAX_SHOWS) return
      showTimer = setTimeout(() => show(k), SHOW_DELAY_MS)
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
    if (v === 'install') promptInstall()
    finish()
  }

  if (getCurrentInstance()) onUnmounted(clearTimers)

  return { visible, variant, kind, markSuccess, dismiss, act, hide }
}
