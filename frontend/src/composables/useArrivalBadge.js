/**
 * 탭이 뒤에 있을 때 다른 기기에서 도착한 파일·텍스트를 표시한다.
 * 탭 제목 숫자, 파비콘 주황 점, (선택) 브라우저 알림. 측정/표시 실패는 동작에 영향을 주지 않는다.
 */
import { ref, getCurrentInstance, onUnmounted } from 'vue'
import { setTitleBadge } from './useTitleBadge'
import { trackEvent } from '../utils/analytics'
import { identityName } from '../utils/identity'
import { t } from '../i18n/translate'

export const NOTIFY_PREF_KEY = 'cs_arrival_notify'
const MAX_HIDDEN_EVENTS = 20
export const NOTIFY_ICON = '/icon-192.png'

function safeTrack(name, params) {
  try { trackEvent(name, params) } catch { /* 측정 실패 무시 */ }
}
function prefGet() { try { return localStorage.getItem(NOTIFY_PREF_KEY) } catch { return null } }
function prefSet(v) { try { localStorage.setItem(NOTIFY_PREF_KEY, v) } catch { /* 무시 */ } }

/** 창이 보이지 않거나 포커스가 없는 상태 */
function isAway() {
  if (typeof document === 'undefined') return false
  return document.hidden || !document.hasFocus()
}

/** 보낸 기기 이름 (이름 없으면 모델/브라우저, 그것도 없으면 일반 문구) */
export function senderName(sender) {
  try {
    const n = sender?.identity ? identityName(sender.identity, t) : ''
    if (n) return n
  } catch { /* 무시 */ }
  return sender?.model || sender?.browser || t('arrival.someDevice')
}

/**
 * @param {{ getMySocketId?: () => string|undefined, isMobile?: boolean }} opts
 */
export function useArrivalBadge({ getMySocketId = () => undefined, isMobile = false } = {}) {
  const count = ref(0)
  const promptVisible = ref(false)
  let hiddenSince = 0
  let hiddenEvents = 0
  let promptShown = false
  let iconState = null // { links: [{el, href, type}], token }

  const notifySupported = () => !isMobile && typeof Notification !== 'undefined'

  // ── 파비콘 점 ──
  function setFaviconDot(on) {
    try {
      if (typeof document === 'undefined') return
      if (!on) {
        if (iconState) {
          for (const l of iconState.links) {
            l.el.href = l.href
            if (l.type == null) l.el.removeAttribute('type'); else l.el.type = l.type
          }
          iconState = null
        }
        return
      }
      if (iconState) return
      const els = Array.from(document.querySelectorAll('link[rel~="icon"]'))
      if (els.length === 0) return
      const links = els.map((el) => ({ el, href: el.getAttribute('href'), type: el.getAttribute('type') }))
      iconState = { links }
      const src = (els.find((e) => e.getAttribute('sizes') === '32x32') || els[0]).href
      const img = new Image()
      img.onload = () => {
        try {
          if (iconState?.links !== links) return
          const c = document.createElement('canvas')
          c.width = 32; c.height = 32
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0, 32, 32)
          ctx.beginPath()
          ctx.arc(24, 8, 7, 0, Math.PI * 2)
          ctx.fillStyle = '#f97316'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
          const url = c.toDataURL('image/png')
          for (const l of links) { l.el.href = url; l.el.type = 'image/png' }
        } catch { /* 조용히 무시 */ }
      }
      img.onerror = () => { /* 무시 */ }
      img.src = src
    } catch { /* 조용히 무시 */ }
  }

  function render() {
    setTitleBadge('arrival', count.value)
    setFaviconDot(count.value > 0)
  }

  // ── 도착 처리 ──
  /**
   * @param {{kind:'file'|'text', count?:number, sender?:{socketId?:string}}} arrival
   */
  function onArrival({ kind, count: n = 1, sender } = {}) {
    try {
      const me = getMySocketId()
      if (me && sender?.socketId && sender.socketId === me) return
      if (!isAway()) return
      const add = Math.max(1, Math.floor(n) || 1)
      if (count.value === 0) hiddenSince = Date.now()
      count.value += add
      render()
      if (hiddenEvents < MAX_HIDDEN_EVENTS) {
        hiddenEvents += 1
        safeTrack('arrival_hidden', { kind, count: add })
      }
      if (notifySupported() && Notification.permission === 'granted') {
        const name = senderName(sender)
        const body = kind === 'file' ? t('arrival.notifyFile', { name, count: add }) : t('arrival.notifyText', { name })
        try {
          const nt = new Notification('Clipboard Share', { body, tag: 'cs-arrival', icon: NOTIFY_ICON })
          nt.onclick = () => {
            safeTrack('notify_click')
            try { window.focus() } catch { /* 무시 */ }
            try { nt.close() } catch { /* 무시 */ }
          }
        } catch { /* 무시 */ }
      }
    } catch { /* 표시 실패는 무시 */ }
  }

  // ── 돌아옴 ──
  function onReturn() {
    if (isAway()) return
    if (count.value > 0) {
      const had = count.value
      safeTrack('arrival_seen', { wait_sec: Math.round((Date.now() - hiddenSince) / 1000), count: had })
      count.value = 0
      render()
      maybeShowPrompt()
    }
  }

  function maybeShowPrompt() {
    if (promptShown || !notifySupported()) return
    if (prefGet()) return
    if (Notification.permission !== 'default') return
    promptShown = true
    promptVisible.value = true
    safeTrack('notify_prompt', { action: 'shown' })
  }

  async function enableNotifications() {
    promptVisible.value = false
    safeTrack('notify_prompt', { action: 'enable' })
    let result = 'default'
    try {
      const r = Notification.requestPermission()
      result = (r && typeof r.then === 'function' ? await r : r) || Notification.permission
    } catch { /* 무시 */ }
    safeTrack('notify_permission', { result })
    if (result !== 'granted') prefSet(result === 'denied' ? 'denied' : 'dismissed')
    else prefSet('granted')
  }

  function dismissPrompt() {
    promptVisible.value = false
    prefSet('dismissed')
    safeTrack('notify_prompt', { action: 'dismiss' })
  }

  const onVisibility = () => { if (!document.hidden) onReturn() }
  const onFocus = () => onReturn()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)

  function destroy() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    count.value = 0
    render()
  }
  if (getCurrentInstance()) onUnmounted(destroy)

  return { count, promptVisible, onArrival, enableNotifications, dismissPrompt, destroy }
}
