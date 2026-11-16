import { ref, watch } from 'vue'

const STORAGE_KEY = 'clipboard-share-theme'
const THEME_LIGHT = 'light'
const THEME_DARK = 'dark'

// Reactive theme state (shared across all components)
const currentTheme = ref(THEME_DARK)

/**
 * Theme composable for managing light/dark theme
 */
export function useTheme() {
  /**
   * Initialize theme from localStorage or system preference
   */
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY)

    if (savedTheme) {
      currentTheme.value = savedTheme
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      currentTheme.value = prefersDark ? THEME_DARK : THEME_LIGHT
    }

    applyTheme(currentTheme.value)
  }

  /**
   * Apply theme to document
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme
    // 브라우저 주소창·앱 제목줄 색을 고른 테마의 배경색에 맞춘다(시스템 설정과 다르게 골랐을 때도)
    if (window.__PRERENDER__) return // 정적 HTML에는 시스템 설정별(media) 값을 그대로 남긴다
    const themeColor = theme === THEME_DARK ? '#0A1430' : '#FFFFFF'
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.removeAttribute('media')
      meta.setAttribute('content', themeColor)
    })
  }

  /**
   * Toggle between light and dark theme
   */
  function toggleTheme() {
    const newTheme = currentTheme.value === THEME_LIGHT ? THEME_DARK : THEME_LIGHT
    currentTheme.value = newTheme
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
  }

  /**
   * Set specific theme
   */
  function setTheme(theme) {
    if (theme !== THEME_LIGHT && theme !== THEME_DARK) {
      console.warn(`Invalid theme: ${theme}`)
      return
    }

    currentTheme.value = theme
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
  }

  // Watch for theme changes
  watch(currentTheme, (newTheme) => {
    applyTheme(newTheme)
  })

  return {
    currentTheme,
    initTheme,
    toggleTheme,
    setTheme,
    isLight: () => currentTheme.value === THEME_LIGHT,
    isDark: () => currentTheme.value === THEME_DARK
  }
}
