<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits(['upload-files'])

const fileInputRef = ref(null)
const isDragging = ref(false)

// 환경 변수에서 최대 파일 크기 가져오기 (기본값: 10MB)
const maxFileSizeMB = computed(() => import.meta.env.VITE_MAX_FILE_SIZE_MB || 10)

function openFileDialog() {
  fileInputRef.value?.click()
}

function handleFileSelect(event) {
  const files = event.target.files
  if (files && files.length > 0) {
    emit('upload-files', Array.from(files))
    // 입력 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = ''
  }
}

function handleDragOver(event) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event) {
  event.preventDefault()
  isDragging.value = false
}

function handleDrop(event) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    emit('upload-files', Array.from(files))
  }
}
</script>

<template>
  <!-- 파일 카드 형태의 업로드 섹션 -->
  <div
    class="relative rounded-lg overflow-hidden cursor-pointer border-2 border-dashed transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/30"
    :class="{
      'border-primary bg-primary/10': isDragging,
      'border-border bg-background': !isDragging
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="openFileDialog"
  >
    <!-- 숨겨진 파일 입력 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />

    <!-- 메인 컨텐츠 영역 -->
    <div class="w-full h-[200px] flex flex-col items-center justify-center gap-3 bg-surface/50">
      <!-- SVG 아이콘으로 대체하여 LCP 성능 개선 -->
      <svg
        class="w-20 h-20 text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p class="text-sm font-semibold text-text-primary">{{ t('file.uploadTitle') }}</p>
      <p class="text-xs text-text-secondary px-4 text-center">
        {{ t('file.uploadHint') }}<br />
        {{ t('file.uploadPasteHint') }}
      </p>
    </div>

    <!-- 상단 정보 오버레이 -->
    <div class="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📁</span>
        <div class="flex items-center gap-2 text-xs text-white/90">
          <span>{{ t('file.maxSize', { size: maxFileSizeMB }) }}</span>
        </div>
      </div>
    </div>

    <!-- 하단 액션 오버레이 (호버시 표시) -->
    <div
      class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-end opacity-0 transition-opacity duration-200 hover:opacity-100"
    >
      <span class="text-xs font-medium text-white">{{ t('file.uploadClickHint') }}</span>
    </div>
  </div>
</template>
