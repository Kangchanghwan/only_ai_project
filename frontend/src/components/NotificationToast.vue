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
   넓은 화면(>=1100px)에서는 왼쪽 240px 패널을 뺀 작업 영역 중앙에 맞춘다. */
.notification {
  position: fixed;
  left: 50%;
  bottom: calc(6rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100vw - 2rem);
  background: rgba(20, 18, 16, 0.92);
  color: #fff;
  padding: 0.75rem 1.25rem;
  border-radius: 0.75rem;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow-wrap: anywhere;
  text-align: center;
  font-size: 0.875rem;
}
@media (min-width: 1100px) {
  .notification { left: calc(50% + 140px); }
}
.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
