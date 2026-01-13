<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { languages } from '../i18n'

const { locale } = useI18n()
const isOpen = ref(false)

const currentLanguage = computed(() => {
  return languages.find(lang => lang.code === locale.value) || languages[0]
})

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectLanguage(langCode) {
  console.log('Selecting language:', langCode)
  locale.value = langCode
  localStorage.setItem('user-locale', langCode)
  isOpen.value = false
}

// 외부 클릭 시 드롭다운 닫기
function handleClickOutside(event) {
  const dropdown = event.target.closest('.language-selector')
  if (!dropdown) {
    isOpen.value = false
  }
}

// 마운트 시 이벤트 리스너 등록
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// 언마운트 시 이벤트 리스너 제거
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="language-selector">
    <div class="langs-area">
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 512 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
        class="lang-icon"
      >
        <path
          d="M363 176L246 464h47.24l24.49-58h90.54l24.49 58H480zm-26.69 186L363 279.85 389.69 362zM272 320c-.25-.19-20.59-15.77-45.42-42.67 39.58-53.64 62-114.61 71.15-143.33H352V90H214V48h-44v42H32v44h219.25c-9.52 26.95-27.05 69.5-53.79 108.36-32.68-43.44-47.14-75.88-47.33-76.22L143 152l-38 22 6.87 13.86c.89 1.56 17.19 37.9 54.71 86.57.92 1.21 1.85 2.39 2.78 3.57-49.72 56.86-89.15 79.09-89.66 79.47L64 368l23 36 19.3-11.47c2.2-1.67 41.33-24 92-80.78 24.52 26.28 43.22 40.83 44.3 41.67L255 362z"
        ></path>
      </svg>
      <nav class="magictool-langselector-dropdown">
        <button
          class="dropdown-toggle"
          @click.stop="toggleDropdown"
          :aria-expanded="isOpen"
        >
          {{ currentLanguage.name }}
        </button>
        <ul
          v-show="isOpen"
          class="langselector-dropdown-menu"
        >
          <li
            v-for="lang in languages"
            :key="lang.code"
            class="dropdown-item"
            :class="{ active: lang.code === locale.value }"
          >
            <a
              href="#"
              @click.prevent="selectLanguage(lang.code)"
            >
              {{ lang.name }}
            </a>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.language-selector {
  position: relative;
  display: inline-block;
}

.langs-area {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: currentColor;
}

.lang-icon {
  width: 1.25rem;
  height: 1.25rem;
  opacity: 0.7;
}

.magictool-langselector-dropdown {
  position: relative;
}

.dropdown-toggle {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: currentColor;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  min-width: 100px;
  text-align: left;
}

.dropdown-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.langselector-dropdown-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
  list-style: none;
  padding: 0.5rem 0;
  margin: 0;
  min-width: 150px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.dropdown-item {
  padding: 0;
}

.dropdown-item a {
  display: block;
  padding: 0.5rem 1rem;
  color: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.dropdown-item a:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.dropdown-item.active a {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  font-weight: 500;
}

/* 스크롤바 스타일링 */
.langselector-dropdown-menu::-webkit-scrollbar {
  width: 6px;
}

.langselector-dropdown-menu::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.langselector-dropdown-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.langselector-dropdown-menu::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>