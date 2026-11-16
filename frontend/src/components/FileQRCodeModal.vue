<script setup>
import { useI18n } from 'vue-i18n'
import { useEscapeClose } from '../composables/useEscapeClose'
import { ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import { formatFileSize, getFileIcon, getFileType } from '../utils/fileUtils'
import { trackEvent } from '../utils/analytics'

const { t } = useI18n()

const props = defineProps({
  file: {
    type: Object,
    required: true
    // { name, url, size, created }
  },
  isOpen: {
    type: Boolean,
    default: false
  },
  // 잠긴 파일 링크처럼 다른 안내가 필요할 때 덮어쓴다
  scanText: { type: String, default: '' },
  hint: { type: String, default: '' },
  // 주소가 길면(잠긴 파일 링크) 오류 정정 수준을 낮춰 QR을 덜 빽빽하게 만든다
  errorCorrectionLevel: { type: String, default: 'H' },
  linkType: { type: String, default: 'file' }
})

const emit = defineEmits(['close', 'download'])
useEscapeClose(() => props.isOpen, () => emit('close'))

const canvasRef = ref(null)
const copySuccess = ref(false)

// QR 코드 생성: file.url을 직접 사용
async function generateQR() {
  if (!props.file?.url || !canvasRef.value) {
    console.error('[FileQRCodeModal] 파일 URL 또는 캔버스가 없습니다')
    return
  }

  try {
    await QRCode.toCanvas(canvasRef.value, props.file.url, {
      errorCorrectionLevel: props.errorCorrectionLevel,
      margin: 2,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
  } catch (error) {
    console.error('[FileQRCodeModal] QR 코드 생성 실패:', error)
  }
}

// 모달이 열릴 때마다 QR 코드 생성
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen && props.file?.url) {
    // 약간의 딜레이를 주어 캔버스가 DOM에 렌더링되도록 함
    await new Promise(resolve => setTimeout(resolve, 50))
    await generateQR()
  }
})

// 초기 마운트 시에도 생성 (모달이 이미 열려있는 경우)
onMounted(() => {
  if (props.isOpen && props.file?.url) {
    generateQR()
  }
})

function handleDownload() {
  if (!canvasRef.value) return

  const link = document.createElement('a')
  link.href = canvasRef.value.toDataURL('image/png')
  link.download = `qr-${props.file.name}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  emit('download')
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
    await navigator.clipboard.writeText(props.file.url)
    copySuccess.value = true
    trackEvent('link_copy', { link_type: props.linkType })
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
  <Teleport to="body">
  <Transition name="modal">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4"
      data-testid="qr-modal-overlay"
      @click="handleBackdropClick"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-qr-title"
        class="bg-surface rounded-none p-8 max-w-md w-full border-2 border-ink"
        @click.stop
      >
        <!-- 헤더 -->
        <div class="flex items-center justify-between mb-6">
          <h2 id="file-qr-title" class="text-2xl font-bold text-text-primary">
            {{ t('qrModal.fileTitle') }}
          </h2>
          <button
            class="text-text-secondary hover:text-text-primary transition-colors leading-none w-11 h-11 flex items-center justify-center"
            @click="handleClose"
            :aria-label="t('help.close')"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- QR 코드 영역 -->
        <div class="bg-white border border-border rounded-none p-6 flex flex-col items-center mb-6">
          <canvas
            ref="canvasRef"
            class="max-w-full"
          />

          <!-- 파일 정보 -->
          <div class="mt-4 text-center w-full">
            <p class="text-gray-600 text-sm mb-3">
              {{ scanText || t('qrModal.scanFile') }}
            </p>
            <div class="flex items-center justify-center gap-2 mb-1">
              <span class="text-2xl">{{ getFileIcon(file.name) }}</span>
              <p class="text-gray-800 font-bold text-lg truncate max-w-[250px]">
                {{ file.name }}
              </p>
            </div>
            <p class="text-gray-600 text-sm">
              {{ formatFileSize(file.size) }} · {{ getFileType(file.name) }}
            </p>
          </div>
        </div>

        <!-- URL 복사 영역 -->
        <div class="bg-tint border border-border rounded-none p-4 mb-6">
          <p class="text-text-secondary text-sm mb-2">{{ t('qrModal.address') }}</p>
          <div class="flex gap-2">
            <input
              type="text"
              :value="file.url"
              readonly
              class="flex-1 bg-surface text-text-primary px-3 py-2 rounded-none text-sm font-mono border border-border focus:outline-none focus:border-ink"
            />
            <button
              class="bg-ink text-on-ink px-4 py-2 min-h-[44px] rounded-none font-bold cursor-pointer hover:opacity-90 transition-colors text-sm whitespace-nowrap"
              @click="handleCopyUrl"
            >
              {{ copySuccess ? '✓ ' + t('qrModal.copied') : t('qrModal.copy') }}
            </button>
          </div>
        </div>

        <!-- 안내 메시지 -->
        <div class="bg-tint border border-ink rounded-none p-4 mb-6">
          <p class="text-text-primary text-sm leading-relaxed">
            {{ hint || t('qrModal.fileHint') }}
          </p>
        </div>

        <!-- 액션 버튼 -->
        <div class="flex gap-3">
          <button
            class="flex-1 bg-ink text-on-ink px-6 py-3 rounded-none font-bold cursor-pointer hover:opacity-90 transition-colors"
            @click="handleDownload"
          >
            {{ t('qrModal.download') }}
          </button>
          <button
            class="flex-1 bg-surface border-2 border-ink text-ink px-6 py-3 rounded-none font-bold cursor-pointer hover:bg-tint transition-colors"
            @click="handleClose"
          >
            {{ t('help.close') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
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
