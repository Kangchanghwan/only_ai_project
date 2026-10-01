<script setup>
import { formatSizeMB } from '../utils/fileUtils'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

const props = defineProps({
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['upload-files'])

const {
  bg: accentBg,
  border: accentBorder,
  bgSoft10: accentBgSoft10
} = useScopeAccent(() => props.scope)

const fileInputRef = ref(null)
const isDragging = ref(false)

// 환경 변수에서 최대 파일 크기 가져오기 (기본값: 5120MB(5GB))
const maxFileSizeMB = computed(() => import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120)

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
  <!-- 파일 선택이 primary. PC에서는 드래그 앤 드롭 영역, 모바일은 간결한 안내 -->
  <div
    class="upload-drop relative rounded-xl cursor-pointer border-2 border-dashed transition-colors duration-200 p-4 sm:p-6 flex flex-col items-center gap-3 text-center"
    :class="isDragging ? [accentBorder, accentBgSoft10] : 'border-border bg-background'"
    data-testid="upload-dropzone"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="openFileDialog"
  >
    <input ref="fileInputRef" type="file" multiple class="hidden" tabindex="-1" @change="handleFileSelect" @click.stop />

    <button
      type="button"
      class="w-full sm:w-auto min-h-[48px] px-6 rounded-full text-white font-semibold text-base inline-flex items-center justify-center gap-2"
      :class="accentBg"
      data-testid="choose-files"
      @click.stop="openFileDialog"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {{ t('file.chooseFiles') }}
    </button>
    <p class="hidden sm:block text-sm text-text-secondary m-0">{{ t('file.dropHint') }}</p>
    <p class="text-xs text-text-secondary m-0" data-testid="upload-limit">
      {{ t('file.limitResume', { size: formatSizeMB(maxFileSizeMB) }) }}
    </p>
  </div>
</template>
