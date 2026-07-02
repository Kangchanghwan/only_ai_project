import { ref } from 'vue'

const canInstall = ref(false)
const isInstalled = ref(false)

let deferredPrompt = null
let initialized = false

function isStandalone() {
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches
  return Boolean(mediaStandalone || window.navigator.standalone === true)
}

function init() {
  if (initialized) return
  initialized = true

  isInstalled.value = isStandalone()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    canInstall.value = false
    deferredPrompt = null
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
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
  }

  return { canInstall, isInstalled, promptInstall }
}
