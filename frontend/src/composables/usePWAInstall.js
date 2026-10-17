import { ref } from 'vue'
import { trackEvent } from '../utils/analytics'

const canInstall = ref(false)
const isInstalled = ref(false)

let deferredPrompt = null
let initialized = false
let launchTracked = false

/** 홈 화면/설치 앱으로 실행 중인지 */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
  return Boolean(mediaStandalone || window.navigator.standalone === true)
}

/** iPhone/iPad (iPadOS의 데스크톱 UA 포함) */
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1
}

/** iPad 계열 (공유 버튼이 위쪽에 있다) */
export function isIPad() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}

function init() {
  if (initialized) return
  initialized = true

  isInstalled.value = isStandalone()

  if (isInstalled.value && !launchTracked) {
    launchTracked = true
    trackEvent('pwa_launch_standalone')
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    canInstall.value = false
    deferredPrompt = null
    trackEvent('pwa_installed')
  })
}

/**
 * @composable usePWAInstall
 * @description beforeinstallprompt/appinstalled 이벤트를 캡처해
 *              PWA 설치 가능 여부와 설치 트리거를 제공한다.
 */
export function usePWAInstall() {
  init()

  async function promptInstall() {
    if (!deferredPrompt) return
    trackEvent('pwa_install_click', { platform: 'prompt' })
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice?.outcome) trackEvent('pwa_install_result', { outcome: choice.outcome })
    deferredPrompt = null
    canInstall.value = false
  }

  return { canInstall, isInstalled, promptInstall, isIOS: isIOS(), isStandalone }
}
