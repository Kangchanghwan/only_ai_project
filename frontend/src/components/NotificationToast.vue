<script setup>
/**
 * 하단 단일 위치의 알림 토스트. 진행 패널은 작업 영역 안의 TransferProgress가 맡는다.
 * (uploads prop은 하위 호환용: 넘기면 토스트 위가 아니라 같은 TransferProgress 패널을 그대로 그린다.)
 */
import TransferProgress from './TransferProgress.vue'

defineProps({
  message: { type: String, default: null },
  uploads: { type: Map, default: () => new Map() }
})
const emit = defineEmits(['cancel-upload', 'cancel-all'])
</script>

<template>
  <transition name="fade">
    <div v-if="message" class="notification" role="status" aria-live="polite" data-prerender-strip>
      {{ message }}
    </div>
  </transition>

  <TransferProgress
    :uploads="uploads"
    @cancel-upload="emit('cancel-upload', $event)"
    @cancel-all="emit('cancel-all')"
  />
</template>

<style scoped>
/* 하단 중앙 단일 위치. 안전 영역 + 하단 고정 액션바(약 4.5rem) 위에 띄운다.
   왼쪽 기기 패널이 없어진 한 열 화면이라 모든 폭에서 화면 가운데에 둔다. */
.notification {
  position: fixed;
  left: 50%;
  bottom: calc(6rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100vw - 2rem);
  background: var(--color-ink);
  color: var(--color-on-ink);
  padding: 0.75rem 1.25rem;
  border-radius: 0;
  box-shadow: none;
  z-index: 1000;
  overflow-wrap: anywhere;
  text-align: center;
  font-size: 0.875rem;
}
.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
