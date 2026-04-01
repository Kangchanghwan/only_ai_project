<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, getFileIcon, getFileType, formatUploadTime } from '../utils/fileUtils'
import FileQRCodeModal from './FileQRCodeModal.vue'

const { t } = useI18n()

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['copy-image', 'toggle-selection', 'download-file', 'delete-file'])

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
}

function closeQRModal() {
  isQRModalOpen.value = false
}

async function handleShare(event) {
  event.stopPropagation()
  if (navigator.share) {
    try {
      await navigator.share({
        title: props.file.name,
        url: props.file.url
      })
    } catch (e) {
      // 사용자가 공유 취소 시 무시
    }
  }
}
</script>

<template>
  <div
    class="relative rounded-lg overflow-hidden cursor-pointer border border-border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30"
    :class="{
      'border-primary border-[3px] shadow-[0_0_0_3px_rgba(66,184,131,0.2)]': isSelected
    }"
    @click="$emit('copy-image', file.url)"
  >
    <!-- 이미지 타입: 미리보기 표시 -->
    <img
      v-if="fileMetadata.isImage"
      :src="file.url"
      :alt="file.name"
      loading="lazy"
      class="w-full h-[200px] object-cover block"
    />

    <!-- 비이미지 타입: 큰 이모지 표시 -->
    <div
      v-else
      class="w-full h-[200px] flex items-center justify-center bg-background"
    >
      <span class="text-[120px]" :title="fileMetadata.type">{{ fileMetadata.icon }}</span>
    </div>

    <!-- 파일 정보 오버레이 (항상 표시) - 체크박스 포함 -->
    <div class="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
      <div class="flex items-center gap-3">
        <!-- 체크박스 -->
        <input
          type="checkbox"
          class="w-5 h-5 cursor-pointer accent-primary flex-shrink-0"
          :checked="isSelected"
          @click.stop
          @change="$emit('toggle-selection', file.name)"
        />

        <!-- 파일 아이콘 (작은 버전) -->
        <span class="text-2xl flex-shrink-0" :title="fileMetadata.type">{{ fileMetadata.icon }}</span>

        <!-- 파일 정보 (파일명 제외) -->
        <div class="flex items-center gap-2 text-xs text-white/90">
          <span>{{ fileMetadata.size }}</span>
          <span>•</span>
          <span>{{ fileMetadata.uploadTime }}</span>
        </div>
      </div>
    </div>

    <!-- 파일명 표시 (하단) -->
    <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/60 to-transparent">
      <!-- 파일명 마퀴 애니메이션 -->
      <div class="file-name-container overflow-hidden mb-2">
        <div class="file-name-wrapper">
          <span class="file-name text-sm font-medium text-white whitespace-nowrap">
            {{ file.name }}
          </span>
        </div>
      </div>

      <!-- 액션 버튼 -->
      <div class="flex justify-end items-center">
        <div class="flex gap-2">
          <!-- 공유 버튼 (Web Share API 지원 시에만 표시) -->
          <button
            v-if="canShare"
            class="bg-surface/80 border border-border text-primary p-2 rounded-full cursor-pointer transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110 flex items-center justify-center"
            @click="handleShare"
            :title="t('file.share')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>

          <!-- QR 코드 버튼 -->
          <button
            class="bg-surface/80 border border-border text-primary p-2 rounded-full cursor-pointer transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110 flex items-center justify-center"
            @click="openQRModal"
            :title="t('room.qrShareTitle')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>

          <!-- 다운로드 버튼 -->
          <button
            class="bg-surface/80 border border-border text-primary p-2 rounded-full cursor-pointer transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110 flex items-center justify-center"
            @click="handleDownload"
            :title="t('file.download')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          <!-- 삭제 버튼 -->
          <button
            class="bg-surface/80 border border-border text-red-400 p-2 rounded-full cursor-pointer transition-all duration-200 hover:bg-red-500 hover:text-white hover:scale-110 flex items-center justify-center"
            @click="handleDelete"
            :title="t('file.delete')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- QR 코드 모달 (Teleport로 body로 이동) -->
  <Teleport to="body">
    <FileQRCodeModal
      :file="file"
      :is-open="isQRModalOpen"
      @close="closeQRModal"
    />
  </Teleport>
</template>

<style scoped>
/* 파일명 마퀴 애니메이션 */
.file-name-container {
  position: relative;
  width: 100%;
}

.file-name-wrapper {
  display: inline-block;
  position: relative;
  max-width: 100%;
}

.file-name {
  display: inline-block;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}

/* 호버 시 마퀴 애니메이션 */
.relative:hover .file-name-wrapper {
  animation: marquee 5s linear infinite;
}

.relative:hover .file-name {
  text-overflow: unset;
  overflow: visible;
  max-width: none;
}

@keyframes marquee {
  0% {
    transform: translateX(0%);
  }
  10% {
    transform: translateX(0%);
  }
  90% {
    transform: translateX(calc(-100% + 180px));
  }
  100% {
    transform: translateX(calc(-100% + 180px));
  }
}
</style>
