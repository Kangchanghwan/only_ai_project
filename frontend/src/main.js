import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import i18n from './i18n'
import { useTheme } from './composables/useTheme'

// 앱이 마운트되기 전에 테마 초기화
const { initTheme } = useTheme()
initTheme()

createApp(App)
  .use(i18n)
  .mount('#app')
