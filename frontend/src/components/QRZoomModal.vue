<script setup>
defineProps({
  qrCodeDataUrl: {
    type: String,
    default: null
  },
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Transition name="qr-zoom-modal">
    <div
      v-if="isOpen"
      class="qr-zoom-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      @click="handleOverlayClick"
    >
      <div class="qr-zoom-card relative bg-white rounded-2xl p-6 shadow-2xl" @click.stop>
        <button
          type="button"
          class="qr-zoom-close absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 text-2xl leading-none"
          aria-label="닫기"
          @click="emit('close')"
        >
          ×
        </button>
        <img
          v-if="qrCodeDataUrl"
          :src="qrCodeDataUrl"
          alt=""
          class="qr-zoom-image block"
          style="width: min(80vw, 420px); height: min(80vw, 420px);"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.qr-zoom-modal-enter-active,
.qr-zoom-modal-leave-active {
  transition: opacity 0.2s ease;
}
.qr-zoom-modal-enter-from,
.qr-zoom-modal-leave-to {
  opacity: 0;
}
</style>
