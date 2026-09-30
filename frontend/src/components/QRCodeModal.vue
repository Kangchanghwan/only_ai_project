<script setup>
import { useI18n } from 'vue-i18n'
import { ref, watch, onMounted, computed } from 'vue'
import { useQRCode } from '../composables/useQRCode'

const { t } = useI18n()

const props = defineProps({
  roomCode: {
    type: String,
    required: true
  },
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'download'])

const qrCode = useQRCode()
const canvasRef = ref(null)
const copySuccess = ref(false)

// 룸 URL 생성
const roomUrl = computed(() => {
  const origin = window.location.origin
  const path = window.location.pathname
  return `${origin}${path}#/${props.roomCode}`
})

// QR 코드 생성
async function generateQR() {
  if (props.roomCode && canvasRef.value) {
    await qrCode.generateQRCodeToCanvas(props.roomCode, canvasRef.value)
  }
}

// 모달이 열릴 때마다 QR 코드 생성
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen && props.roomCode) {
    // 약간의 딜레이를 주어 캔버스가 DOM에 렌더링되도록 함
    await new Promise(resolve => setTimeout(resolve, 50))
    await generateQR()
  }
})

// 초기 마운트 시에도 생성 (모달이 이미 열려있는 경우)
onMounted(() => {
  if (props.isOpen && props.roomCode) {
    generateQR()
  }
})

function handleDownload() {
  if (canvasRef.value) {
    const link = document.createElement('a')
    link.href = canvasRef.value.toDataURL('image/png')
    link.download = `room-${props.roomCode}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    emit('download')
  }
}

function handleClose() {
  emit('close')
}

function handleBackdropClick(event) {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}

// URL 복사
async function handleCopyUrl() {
  try {
    await navigator.clipboard.writeText(roomUrl.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('URL 복사 실패:', error)
    alert(t('qrModal.copyUrlFailed'))
  }
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      @click="handleBackdropClick"
    >
      <div
        class="bg-surface rounded-2xl p-8 max-w-md w-full border border-border shadow-2xl"
        @click.stop
      >
        <!-- 헤더 -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-text-primary">
            {{ t('qrModal.roomTitle') }}
          </h2>
          <button
            class="text-text-secondary hover:text-text-primary transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center"
            @click="handleClose"
            :aria-label="t('help.close')"
          >
            ×
          </button>
        </div>

        <!-- QR 코드 영역 -->
        <div class="bg-white rounded-xl p-6 flex flex-col items-center mb-6">
          <canvas
            ref="canvasRef"
            class="max-w-full"
          />
          <div class="mt-4 text-center">
            <p class="text-gray-600 text-sm mb-2">
              {{ t('qrModal.scanRoom') }}
            </p>
            <p class="text-gray-800 font-bold text-xl">
              {{ t('qrModal.roomCode', { code: roomCode }) }}
            </p>
          </div>
        </div>

        <!-- URL 복사 영역 -->
        <div class="bg-black/10 rounded-lg p-4 mb-6">
          <p class="text-text-secondary text-sm mb-2">{{ t('qrModal.address') }}</p>
          <div class="flex gap-2">
            <input
              type="text"
              :value="roomUrl"
              readonly
              class="flex-1 bg-black/20 text-text-primary px-3 py-2 rounded-lg text-sm font-mono border border-border focus:outline-none focus:border-primary"
            />
            <button
              class="bg-primary text-white px-4 py-2 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors text-sm whitespace-nowrap"
              @click="handleCopyUrl"
            >
              {{ copySuccess ? '✓ ' + t('qrModal.copied') : t('qrModal.copy') }}
            </button>
          </div>
        </div>

        <!-- 안내 메시지 -->
        <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
          <p class="text-text-primary text-sm leading-relaxed">
            💡 {{ t('qrModal.roomHint') }}
          </p>
        </div>

        <!-- 액션 버튼 -->
        <div class="flex gap-3">
          <button
            class="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors"
            @click="handleDownload"
          >
            {{ t('qrModal.download') }}
          </button>
          <button
            class="flex-1 bg-transparent border border-border text-text-primary px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-border transition-colors"
            @click="handleClose"
          >
            {{ t('help.close') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .bg-surface,
.modal-leave-active .bg-surface {
  transition: transform 0.2s ease;
}

.modal-enter-from .bg-surface,
.modal-leave-to .bg-surface {
  transform: scale(0.95);
}
</style>
