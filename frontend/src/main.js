import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import i18n from './i18n'
import { useTheme } from './composables/useTheme'
import { initActivationMetrics } from './utils/activationMetrics'
import { initInappMetric } from './utils/uploadMeta'

// 앱이 마운트되기 전에 테마 초기화
const { initTheme } = useTheme()
initTheme()
// 주소의 utm_*가 앱 시작 때 지워지기 전에 첫 주소를 읽는다 (측정 전용, 화면 변화 없음)
initActivationMetrics()
initInappMetric()

createApp(App)
  .use(i18n)
  .mount('#app')

// Service Worker 등록 (Web Share Target API 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}
