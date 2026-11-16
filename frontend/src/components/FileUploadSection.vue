<script setup>
import { formatSizeMB } from '../utils/fileUtils'
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'
import LockChip from './LockChip.vue'
import { isPrivateScope } from '../composables/useShareScope'

const { t } = useI18n()

const props = defineProps({
  scope: {
    type: String,
    default: 'ip'
  },
  /** 파일이 이미 있으면 한 줄짜리 얇은 막대로 접는다 */
  compact: {
    type: Boolean,
    default: false
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
  <!-- 파일이 없으면 큰 드롭 영역(PC) / 큰 버튼(모바일), 있으면 한 줄 막대 -->
  <div
    class="upload-drop relative rounded-none cursor-pointer transition-colors duration-200 bg-tint"
    :class="[
      compact
        ? 'border border-dashed px-3 py-2 min-h-[56px] flex flex-wrap items-center gap-x-3 gap-y-2'
        : 'p-4 sm:p-6 sm:min-h-[300px] sm:border sm:border-dashed flex flex-col items-center justify-center gap-3 text-center',
      isDragging ? 'border-ink' : 'sm:border-ink/30 border-ink/30'
    ]"
    :data-state="compact ? 'compact' : 'big'"
    data-testid="upload-dropzone"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="openFileDialog"
  >
    <input ref="fileInputRef" type="file" multiple class="sr-only" tabindex="-1" :aria-label="t('file.inputLabel')" data-testid="file-input" @change="handleFileSelect" @click.stop />

    <!-- 컴팩트 막대: 왼쪽 안내 -->
    <p v-if="compact" class="m-0 hidden sm:block flex-1 min-w-[8rem] truncate text-sm text-text-secondary" data-testid="upload-compact-hint">{{ t('dropOverlay.title') }}</p>
    <!-- 큰 상태: 큰 선 아이콘 (넓은 화면만) -->
    <svg v-else class="hidden sm:block w-12 h-12 text-ink-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>

    <template v-if="compact">
      <div class="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center justify-end gap-2" @click.stop>
        <LockChip v-if="!isPrivateScope(scope)" :scope="scope" />
        <slot />
        <button
          type="button"
          class="order-first w-full sm:order-none sm:w-auto min-h-[44px] px-4 rounded-none text-white font-extrabold text-sm whitespace-nowrap inline-flex items-center justify-center gap-2"
          :class="accentBg"
          data-testid="choose-files"
          @click.stop="openFileDialog"
        >
          {{ t('file.chooseFiles') }}
        </button>
      </div>
    </template>
    <template v-else>
      <button
        type="button"
        class="w-full sm:w-auto min-h-[52px] sm:min-h-[56px] px-10 rounded-none text-white font-extrabold text-base sm:text-lg inline-flex items-center justify-center gap-2"
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
      <!-- '또는 여기로 끌어다 놓으세요'는 버튼 뒤에 와야 자연스럽다 (모바일은 끌어다 놓기가 없어 스크린리더용) -->
      <p class="m-0 sr-only sm:not-sr-only sm:text-[15px] sm:font-semibold sm:text-ink-2" data-testid="upload-heading">{{ t('file.dropHint') }}</p>
      <p class="text-xs text-text-secondary m-0" data-testid="upload-limit">
        {{ t('file.limitResume', { size: formatSizeMB(maxFileSizeMB) }) }}
      </p>
      <!-- 1:1 방은 자동 암호화라 비밀번호 잠금 칩을 숨긴다 -->
      <LockChip v-if="!isPrivateScope(scope)" :scope="scope" />
      <p v-else class="text-xs text-scope-private m-0" data-testid="private-upload-hint"><svg class="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{{ t('pair.uploadHint') }}</p>
      <div class="w-full sm:w-auto" @click.stop><slot /></div>
    </template>
  </div>
</template>
