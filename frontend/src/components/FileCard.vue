<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, getFileIcon, getFileType, formatUploadTime } from '../utils/fileUtils'
import { r2Service } from '../services/r2Service'
import FileQRCodeModal from './FileQRCodeModal.vue'
import SenderLabel from './SenderLabel.vue'
import { trackEvent } from '../utils/analytics'
import { trackStoreFallback } from '../utils/storeFallback'
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  },
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['copy-image', 'toggle-selection', 'download-file', 'delete-file'])

const {
  bg: accentBg,
  borderL: accentBorderL,
  bgSoft10: accentBgSoft10,
  bgSoft5: accentBgSoft5,
  hoverBorder50: accentHoverBorder50,
  accentColor
} = useScopeAccent(() => props.scope)

// QR 모달 상태 관리
const isQRModalOpen = ref(false)

// Web Share API 지원 여부
const canShare = ref(typeof navigator !== 'undefined' && !!navigator.share)

// 파일 메타데이터 계산
const fileMetadata = computed(() => {
  const type = getFileType(props.file.name)
  return {
    icon: getFileIcon(props.file.name),
    type: type,
    isImage: type === 'image',
    size: formatFileSize(props.file.size),
    uploadTime: formatUploadTime(props.file.created)
  }
})

// 이미지 미리보기: 원본(최대 수십 MB) 대신 업로드 시 생성된 썸네일(thumbs/…jpg)을 쓰고,
// 썸네일이 없으면(구버전 업로드·생성 실패) 원본으로 한 번만 폴백한다.
const thumbFailed = ref(false)

watch(() => `${props.file.roomId}::${props.file.name}`, () => {
  thumbFailed.value = false
})

// 원본이 이 크기보다 크면 썸네일 실패 시 원본으로 폴백하지 않고 아이콘을 보여준다
// (큰 원본을 미리보기로 내려받거나 presigned를 남발하지 않기 위함).
const MAX_ORIGINAL_PREVIEW_BYTES = 5 * 1024 * 1024

const showImagePreview = computed(() => {
  if (!fileMetadata.value.isImage) return false
  if (!thumbFailed.value) return true
  return (props.file.size || 0) <= MAX_ORIGINAL_PREVIEW_BYTES
})

const previewSrc = computed(() => {
  if (thumbFailed.value) return props.file.url
  if (props.file.thumbUrl) return props.file.thumbUrl
  if (props.file.roomId) return r2Service.getThumbUrl(props.file.roomId, props.file.name)
  return props.file.url
})

function handleThumbError() {
  if (!thumbFailed.value && previewSrc.value !== props.file.url) {
    thumbFailed.value = true
    if (showImagePreview.value) trackStoreFallback('preview', props.file.size, 'thumb_failed')
  }
}

function handleDownload(event) {
  event.stopPropagation()
  emit('download-file', props.file)
}

function handleDelete(event) {
  event.stopPropagation()
  emit('delete-file', props.file)
}

function openQRModal(event) {
  event.stopPropagation()
  isQRModalOpen.value = true
  trackEvent('qr_open', { qr_type: 'file' })
}

function closeQRModal() {
  isQRModalOpen.value = false
}

// 모바일 더보기 액션 시트 상태 관리
const isActionsSheetOpen = ref(false)

function openActionsSheet(event) {
  event.stopPropagation()
  isActionsSheetOpen.value = true
}

function closeActionsSheet() {
  isActionsSheetOpen.value = false
}

function handleActionsSheetBackdropClick(event) {
  if (event.target === event.currentTarget) {
    closeActionsSheet()
  }
}

function handleSheetShare(event) {
  handleShare(event)
  closeActionsSheet()
}

function handleSheetQR(event) {
  openQRModal(event)
  closeActionsSheet()
}

function handleSheetCopy() {
  emit('copy-image', props.file.url)
  closeActionsSheet()
}

function handleSheetDownload(event) {
  handleDownload(event)
  closeActionsSheet()
}

function handleSheetDelete(event) {
  handleDelete(event)
  closeActionsSheet()
}

async function handleShare(event) {
  event.stopPropagation()
  if (navigator.share) {
    try {
      await navigator.share({
        title: props.file.name,
        url: props.file.url
      })
      trackEvent('file_native_share')
    } catch (e) {
      // 사용자가 공유 취소 시 무시
    }
  }
}
</script>

<template>
  <!-- 행 전체 클릭으로 복사하지 않는다. 받기(primary)와 더보기(복사/QR/공유/삭제)를 명시 버튼으로 둔다. -->
  <div
    class="file-row flex items-center gap-2 p-2 sm:gap-3 sm:p-3 rounded-lg border border-border bg-surface transition-colors duration-200"
    :class="[accentHoverBorder50, isSelected ? ['border-l-4', accentBgSoft5, accentBorderL] : '']"
  >
    <!-- 체크박스: 44px 터치 영역의 label로 감싸 접근 가능한 이름을 준다 -->
    <label class="inline-flex items-center justify-center w-11 h-11 -mx-1 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        class="select-checkbox w-5 h-5 cursor-pointer"
        :class="accentColor"
        :checked="isSelected"
        :aria-label="t('file.selectFile', { name: file.name })"
        @change="$emit('toggle-selection', file)"
      />
    </label>

    <img
      v-if="showImagePreview"
      :src="previewSrc"
      :alt="file.name"
      loading="lazy"
      decoding="async"
      width="40"
      height="40"
      class="w-8 h-8 sm:w-10 sm:h-10 rounded-md object-cover flex-shrink-0"
      @error="handleThumbError"
    />
    <div
      v-else
      class="w-8 h-8 sm:w-10 sm:h-10 rounded-md flex items-center justify-center flex-shrink-0"
      :class="accentBgSoft10"
    >
      <span class="text-xl" :title="fileMetadata.type">{{ fileMetadata.icon }}</span>
    </div>

    <!-- 파일명(ellipsis, 전체는 title) + 2행 "보낸 사람 · 용량 · 시간" (시간은 한 번만) -->
    <div class="flex-1 min-w-0">
      <p class="file-name text-sm font-medium text-text-primary truncate m-0" :title="file.name" data-testid="file-name">{{ file.name }}</p>
      <p class="file-meta flex items-center gap-1 text-xs text-text-secondary mt-0.5 m-0 min-w-0" data-testid="file-meta">
        <SenderLabel v-if="file.uploader" :sender="file.uploader" class="shrink min-w-0" />
        <span v-if="file.uploader" aria-hidden="true">·</span>
        <span class="whitespace-nowrap">{{ fileMetadata.size }}</span>
        <span aria-hidden="true">·</span>
        <span class="whitespace-nowrap">{{ fileMetadata.uploadTime }}</span>
      </p>
    </div>

    <!-- 받기 (primary) -->
    <button
      type="button"
      class="download-btn shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-full text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
      :class="accentBg"
      :aria-label="`${t('file.receive')}: ${file.name}`"
      data-testid="file-receive"
      @click="handleDownload"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="hidden sm:inline">{{ t('file.receive') }}</span>
    </button>

    <!-- 더보기 (복사/QR/공유/삭제) -->
    <button
      type="button"
      class="more-btn shrink-0 w-11 h-11 flex items-center justify-center rounded-full border border-border bg-background text-text-primary"
      :title="t('file.moreActions')"
      :aria-label="t('file.moreActions')"
      aria-haspopup="dialog"
      @click="openActionsSheet"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>

    <Teleport to="body">
      <FileQRCodeModal :file="file" :is-open="isQRModalOpen" @close="closeQRModal" />
    </Teleport>

    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="isActionsSheetOpen"
          class="file-actions-sheet fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          :aria-label="file.name"
          @click="handleActionsSheetBackdropClick"
          @keydown.esc="closeActionsSheet"
        >
          <div class="w-full sm:w-80 bg-surface rounded-t-2xl sm:rounded-2xl p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]" @click.stop>
            <p class="px-4 py-2 text-xs text-text-secondary truncate m-0">{{ file.name }}</p>
            <button
              v-if="fileMetadata.isImage"
              class="sheet-copy w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetCopy"
            >
              <span aria-hidden="true">📋</span>
              <span class="text-sm font-medium">{{ t('file.copyImage') }}</span>
            </button>
            <button
              v-if="canShare"
              class="sheet-share w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetShare"
            >
              <span aria-hidden="true">↗</span>
              <span class="text-sm font-medium">{{ t('file.share') }}</span>
            </button>
            <button
              class="sheet-qr w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetQR"
            >
              <span aria-hidden="true">▦</span>
              <span class="text-sm font-medium">{{ t('room.qrShareTitle') }}</span>
            </button>
            <button
              class="sheet-download w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetDownload"
            >
              <span aria-hidden="true">⬇</span>
              <span class="text-sm font-medium">{{ t('file.download') }}</span>
            </button>
            <button
              class="sheet-delete w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-red-500/10 text-red-500"
              @click="handleSheetDelete"
            >
              <span aria-hidden="true">🗑</span>
              <span class="text-sm font-medium">{{ t('file.delete') }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active > div,
.sheet-leave-active > div {
  transition: transform 0.2s ease;
}
.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(100%);
}
</style>
