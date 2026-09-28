<script setup>
import { ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import { formatFileSize, getFileIcon, getFileType } from '../utils/fileUtils'
import { trackEvent } from '../utils/analytics'

const props = defineProps({
  file: {
    type: Object,
    required: true
    // { name, url, size, created }
  },
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'download'])

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
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
    console.log('[FileQRCodeModal] QR 코드 생성 완료:', props.file.url)
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
    trackEvent('link_copy', { link_type: 'file' })
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('URL 복사 실패:', error)
    alert('URL 복사에 실패했습니다.')
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
            파일 다운로드 QR 코드
          </h2>
          <button
            class="text-text-secondary hover:text-text-primary transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center"
            @click="handleClose"
            aria-label="닫기"
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

          <!-- 파일 정보 -->
          <div class="mt-4 text-center w-full">
            <p class="text-gray-600 text-sm mb-3">
              모바일에서 QR 코드를 스캔하면 파일이 다운로드됩니다
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
        <div class="bg-black/10 rounded-lg p-4 mb-6">
          <p class="text-text-secondary text-sm mb-2">주소 (PC에서 복사하여 공유):</p>
          <div class="flex gap-2">
            <input
              type="text"
              :value="file.url"
              readonly
              class="flex-1 bg-black/20 text-text-primary px-3 py-2 rounded-lg text-sm font-mono border border-border focus:outline-none focus:border-primary"
            />
            <button
              class="bg-primary text-white px-4 py-2 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors text-sm whitespace-nowrap"
              @click="handleCopyUrl"
            >
              {{ copySuccess ? '✓ 복사됨' : '복사' }}
            </button>
          </div>
        </div>

        <!-- 안내 메시지 -->
        <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
          <p class="text-text-primary text-sm leading-relaxed">
            💡 모바일 기기에서 QR 코드를 스캔하면<br>
            파일이 자동으로 다운로드됩니다.
          </p>
        </div>

        <!-- 액션 버튼 -->
        <div class="flex gap-3">
          <button
            class="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors"
            @click="handleDownload"
          >
            QR 코드 다운로드
          </button>
          <button
            class="flex-1 bg-transparent border border-border text-text-primary px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-border transition-colors"
            @click="handleClose"
          >
            닫기
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
