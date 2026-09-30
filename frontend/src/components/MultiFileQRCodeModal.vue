<script setup>
import { useI18n } from 'vue-i18n'
import { ref, watch, computed, onMounted } from 'vue'
import QRCode from 'qrcode'
import { generateDownloadUrl, validateUrlLength } from '../utils/router'
import { trackEvent } from '../utils/analytics'

const { t } = useI18n()

const props = defineProps({
  files: {
    type: Array,
    required: true,
    default: () => []
  },
  roomId: {
    type: String,
    required: true
  },
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'download'])

const canvasRef = ref(null)
const showUrlPreview = ref(false)
const copySuccess = ref(false)

// 다운로드 URL 생성
const downloadUrl = computed(() => {
  if (!props.files || props.files.length === 0 || !props.roomId) {
    return ''
  }

  const fileNames = props.files.map(f => f.name)
  return generateDownloadUrl(props.roomId, fileNames)
})

// URL 길이 검증
const urlValidation = computed(() => {
  return validateUrlLength(downloadUrl.value)
})

// 파일 목록 표시 (최대 10개, 나머지는 "외 N개")
const displayFiles = computed(() => {
  const maxDisplay = 10
  if (props.files.length <= maxDisplay) {
    return props.files
  }
  return props.files.slice(0, maxDisplay)
})

const remainingCount = computed(() => {
  const maxDisplay = 10
  return Math.max(0, props.files.length - maxDisplay)
})

// QR 코드 생성
async function generateQR() {
  if (!downloadUrl.value || !canvasRef.value) {
    console.error('[MultiFileQRCodeModal] URL 또는 캔버스가 없습니다')
    return
  }

  try {
    await QRCode.toCanvas(canvasRef.value, downloadUrl.value, {
      errorCorrectionLevel: 'M', // URL이 길 수 있으므로 'M' 사용
      margin: 2,
      width: 280,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
    console.log('[MultiFileQRCodeModal] QR 코드 생성 완료:', downloadUrl.value)
  } catch (error) {
    console.error('[MultiFileQRCodeModal] QR 코드 생성 실패:', error)
  }
}

// 모달이 열릴 때마다 QR 코드 생성
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen && downloadUrl.value) {
    // 약간의 딜레이를 주어 캔버스가 DOM에 렌더링되도록 함
    await new Promise(resolve => setTimeout(resolve, 50))
    await generateQR()
  }
})

// 초기 마운트 시에도 생성 (모달이 이미 열려있는 경우)
onMounted(() => {
  if (props.isOpen && downloadUrl.value) {
    generateQR()
  }
})

// QR 코드 이미지 다운로드
function handleDownload() {
  if (!canvasRef.value) return

  const link = document.createElement('a')
  link.href = canvasRef.value.toDataURL('image/png')
  link.download = `qr-download-${props.files.length}files.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  emit('download')
}

// 모달 닫기
function handleClose() {
  emit('close')
}

// 백드롭 클릭 시 닫기
function handleBackdropClick(event) {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}

// URL 미리보기 토글
function toggleUrlPreview() {
  showUrlPreview.value = !showUrlPreview.value
}

// URL 복사
async function handleCopyUrl() {
  try {
    await navigator.clipboard.writeText(downloadUrl.value)
    copySuccess.value = true
    trackEvent('link_copy', { link_type: 'multi_file' })
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
        class="bg-surface rounded-2xl p-8 max-w-md w-full border border-border shadow-2xl max-h-[90vh] overflow-y-auto"
        @click.stop
      >
        <!-- 헤더 -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-text-primary">
            {{ t('qrModal.multiTitle') }}
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

          <!-- 파일 개수 정보 -->
          <div class="mt-4 text-center w-full">
            <p class="text-gray-600 text-sm mb-3">
              {{ t('qrModal.multiScan', { count: files.length }) }}
            </p>
            <div class="flex items-center justify-center gap-2 mb-1">
              <span class="text-2xl">📦</span>
              <p class="text-gray-800 font-bold text-lg">
                {{ t('qrModal.filesCount', { count: files.length }) }}
              </p>
            </div>
          </div>
        </div>

        <!-- 파일 목록 -->
        <div class="bg-black/10 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
          <p class="text-sm font-semibold text-text-secondary mb-2">{{ t('qrModal.included') }}</p>
          <ul class="space-y-1">
            <li
              v-for="file in displayFiles"
              :key="file.name"
              class="text-sm text-text-primary truncate"
            >
              📄 {{ file.name }}
            </li>
          </ul>
          <p v-if="remainingCount > 0" class="text-sm text-text-secondary mt-2 italic">
            {{ t('qrModal.moreFiles', { count: remainingCount }) }}
          </p>
        </div>

        <!-- URL 길이 경고 -->
        <div v-if="urlValidation.isTooLong" class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
          <p class="text-yellow-400 text-sm leading-relaxed">
            ⚠️ {{ t('qrModal.tooLong', { length: urlValidation.length }) }}
          </p>
        </div>

        <!-- URL 복사 영역 -->
        <div class="bg-black/10 rounded-lg p-4 mb-4">
          <p class="text-text-secondary text-sm mb-2">{{ t('qrModal.address') }}</p>
          <div class="flex gap-2">
            <input
              type="text"
              :value="downloadUrl"
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

        <!-- URL 미리보기 -->
        <div class="mb-6">
          <button
            class="text-sm text-text-secondary hover:text-text-primary transition-colors mb-2"
            @click="toggleUrlPreview"
          >
            {{ showUrlPreview ? '▼' : '▶' }} {{ t('qrModal.urlDetail') }}
          </button>
          <div v-if="showUrlPreview" class="bg-black/20 rounded-lg p-3">
            <p class="text-xs text-text-secondary break-all font-mono">
              {{ downloadUrl }}
            </p>
            <p class="text-xs text-text-secondary mt-2">
              {{ t('qrModal.lengthDetail', { length: urlValidation.length, max: urlValidation.maxLength }) }}
            </p>
          </div>
        </div>

        <!-- 안내 메시지 -->
        <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
          <p class="text-text-primary text-sm leading-relaxed">
            💡 {{ t('qrModal.multiHint') }}
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

/* 스크롤바 스타일링 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(66, 184, 131, 0.3);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.5);
}
</style>
