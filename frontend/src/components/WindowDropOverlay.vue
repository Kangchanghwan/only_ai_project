<script setup>
/**
 * 창 어디에 파일을 끌어다 놓아도 올라가게 하는 전체 화면 오버레이.
 * - 'Files' 드래그에만 반응(텍스트·링크 드래그는 무시)
 * - 브라우저가 파일을 열어 페이지를 떠나지 않도록 dragover/drop의 기본 동작은 항상 막는다
 * - 업로드 카드 위 drop은 카드가 직접 처리하므로 여기서는 올리지 않고 닫기·측정만 한다(중복 업로드 방지)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { trackEvent } from '../utils/analytics'

const props = defineProps({
  /** 방 연결됨 && 모바일 아님 이어야 오버레이 표시 */
  enabled: { type: Boolean, default: true },
  /** 'ip' | 'global' | 'private' */
  scopeKind: { type: String, default: 'ip' },
  /** 확인창 등이 열려 있을 때 */
  blocked: { type: Boolean, default: false },
  /** 모바일 UA면 아무것도 하지 않는다 */
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['drop-files'])
const { t } = useI18n()

const visible = ref(false)
let depth = 0

const scopeText = computed(() =>
  props.scopeKind === 'global' ? t('dropOverlay.toGlobal')
    : props.scopeKind === 'private' ? t('dropOverlay.toPair')
      : t('dropOverlay.toIp')
)

const hasFiles = (e) => {
  const types = e?.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}
const modalOpen = () => !!document.querySelector('[aria-modal="true"], [role="dialog"]')
const canShow = () => props.enabled && !props.blocked && !modalOpen()
const close = () => { visible.value = false; depth = 0 }

function onDragEnter(e) {
  if (props.disabled || !hasFiles(e)) return
  e.preventDefault()
  depth += 1
  if (canShow()) visible.value = true
}
function onDragOver(e) {
  if (props.disabled || !hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  if (!visible.value && canShow()) visible.value = true
}
function onDragLeave(e) {
  if (props.disabled || !hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  const outside = e.relatedTarget === null && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)
  if (depth === 0 || outside) close()
}
function onDrop(e) {
  if (props.disabled || !hasFiles(e)) return
  e.preventDefault()
  const wasVisible = visible.value
  close()
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length === 0) return
  const onCard = !!e.target?.closest?.('[data-testid="upload-dropzone"]')
  try { trackEvent('window_drop', { file_count: files.length, on_card: onCard }) } catch { /* 무시 */ }
  // 카드 위 drop은 카드 handleDrop이 이미 올린다. 오버레이가 보이지 않던 상태(차단/미연결)도 올리지 않는다.
  if (onCard || !wasVisible) return
  emit('drop-files', files)
}
function onKey(e) { if (e.key === 'Escape' && visible.value) close() }

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('dragend', close)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('dragend', close)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <transition name="wdo-fade">
    <div v-if="visible && !disabled" class="wdo" role="presentation" data-testid="window-drop-overlay" data-prerender-strip>
      <div class="wdo__box">
        <svg class="wdo__icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
        </svg>
        <p class="wdo__title">{{ t('dropOverlay.title') }}</p>
        <p class="wdo__scope" data-testid="window-drop-scope">{{ scopeText }}</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.wdo {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.wdo__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 3rem;
  border: 3px dashed var(--color-primary);
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  color: var(--color-primary);
  text-align: center;
  max-width: calc(100vw - 3rem);
  pointer-events: none;
}
.wdo__title { margin: 0; font-size: 1.375rem; font-weight: 700; }
.wdo__scope { margin: 0; font-size: 0.875rem; color: var(--color-text-secondary); }
.wdo-fade-enter-active, .wdo-fade-leave-active { transition: opacity 0.15s ease; }
.wdo-fade-enter-from, .wdo-fade-leave-to { opacity: 0; }
</style>
