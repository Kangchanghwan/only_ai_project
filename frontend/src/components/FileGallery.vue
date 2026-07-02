<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import FileCard from './FileCard.vue'
import FileUploadSection from './FileUploadSection.vue'
import PasteSection from './PasteSection.vue'
import DownloadControls from './DownloadControls.vue'
import MultiFileQRCodeModal from './MultiFileQRCodeModal.vue'
import { createEnterStagger } from '../utils/enterStagger'

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  roomId: {
    type: String,
    required: true
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits([
  'copy-image',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'delete-file',
  'delete-selected',
  'clear-storage',
  'upload-files',
  'select-scope',
  'paste-content',
  'load-more'
])

const selectedFiles = ref(new Set())
const showMultiQRModal = ref(false)

const nextEnterDelay = createEnterStagger()

function onCardBeforeEnter(el) {
  el.style.transitionDelay = `${nextEnterDelay()}ms`
}

// 같은 파일명이 다른 룸에 동시에 존재할 수 있으므로 roomId+name 복합 키로 선택을 추적한다
// (useFileManager.js의 mergeAndSort와 동일한 dedup 키 규칙).
function fileKey(file) {
  return `${file.roomId}::${file.name}`
}

// 선택된 파일 개수
const selectedCount = computed(() => selectedFiles.value.size)

// 선택된 파일 배열
const selectedFilesArray = computed(() => {
  return props.files.filter(file => selectedFiles.value.has(fileKey(file)))
})

// 모든 파일이 선택되었는지 확인
const allFilesSelected = computed(() => {
  return props.files.length > 0 && selectedFiles.value.size === props.files.length
})

// 파일 선택/해제
function toggleFileSelection(file) {
  const key = fileKey(file)
  if (selectedFiles.value.has(key)) {
    selectedFiles.value.delete(key)
  } else {
    selectedFiles.value.add(key)
  }
  // Set은 반응성을 위해 새 객체로 교체
  selectedFiles.value = new Set(selectedFiles.value)
}

// 전체 선택/해제
function toggleSelectAll() {
  if (allFilesSelected.value) {
    // 전체 해제
    selectedFiles.value = new Set()
  } else {
    // 전체 선택
    selectedFiles.value = new Set(props.files.map(fileKey))
  }
}

// 다중 QR 공유는 한 룸의 파일만 포함할 수 있다 (?r={roomId} 단일 룸 기준 다운로드 링크이므로).
// 선택이 여러 룸에 걸쳐 있으면 첫 번째 선택 파일의 룸으로 좁혀서 깨진 링크를 방지한다.
const multiQRRoomId = computed(() => selectedFilesArray.value[0]?.roomId || props.roomId)
const multiQRFiles = computed(() =>
  selectedFilesArray.value.filter(file => file.roomId === multiQRRoomId.value)
)

// 병렬 다운로드
function downloadParallel() {
  if (selectedCount.value > 0) {
    emit('download-parallel', selectedFilesArray.value)
  }
}

// QR 코드 모달 열기
function showQRModal() {
  if (selectedCount.value > 0) {
    showMultiQRModal.value = true
  }
}

// Ctrl+C 키보드 이벤트 핸들러
function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    if (selectedCount.value > 0) {
      emit('copy-selected-to-clipboard', selectedFilesArray.value)
    }
  }
}

// 라이프사이클 훅
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div>
    <!-- 다운로드 컨트롤 버튼 (파일이 있고 로딩 중이 아닐 때) -->
    <DownloadControls
      v-if="files.length > 0 && !isLoading"
      :selected-count="selectedCount"
      :total-count="files.length"
      :all-selected="allFilesSelected"
      @download-parallel="downloadParallel"
      @toggle-select-all="toggleSelectAll"
      @show-multi-qr="showQRModal"
      @delete-selected="$emit('delete-selected', selectedFilesArray)"
      @clear-storage="$emit('clear-storage')"
    />

    <!-- 업로드/붙여넣기 드롭존 (리스트 밖 상단, 항상 표시) -->
    <div class="flex flex-col sm:flex-row gap-4 mb-6">
      <div class="flex-1">
        <FileUploadSection
          :scope="scope"
          @upload-files="$emit('upload-files', $event)"
          @select-scope="$emit('select-scope', $event)"
        />
      </div>
      <div class="flex-1">
        <PasteSection @paste-content="$emit('paste-content')" />
      </div>
    </div>

    <!-- 로딩 중일 때 스피너 표시 -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <div class="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
    </div>

    <!-- 파일 리스트 (로딩 중이 아닐 때) -->
    <div v-else class="flex flex-col gap-2">
      <TransitionGroup name="card-land" @before-enter="onCardBeforeEnter">
        <FileCard
          v-for="file in files"
          :key="fileKey(file)"
          :file="file"
          :is-selected="selectedFiles.has(fileKey(file))"
          @copy-image="$emit('copy-image', file.url)"
          @toggle-selection="toggleFileSelection(file)"
          @download-file="$emit('download-file', file)"
          @delete-file="$emit('delete-file', file)"
        />
      </TransitionGroup>
    </div>

    <!-- 더 보기 버튼 -->
    <div v-if="hasMore && !isLoading" class="flex justify-center mt-8">
      <button
        @click="$emit('load-more')"
        class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
      >
        {{ $t('fileGallery.loadMore') || '더 보기' }}
      </button>
    </div>

    <!-- 다중 파일 QR 코드 모달 -->
    <MultiFileQRCodeModal
      :files="multiQRFiles"
      :room-id="multiQRRoomId"
      :is-open="showMultiQRModal"
      @close="showMultiQRModal = false"
    />
  </div>
</template>

<style scoped>
.card-land-enter-active {
  transition: transform 350ms cubic-bezier(.34, 1.56, .64, 1), opacity 350ms cubic-bezier(.34, 1.56, .64, 1);
}

.card-land-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.85);
}

@media (prefers-reduced-motion: reduce) {
  .card-land-enter-active {
    transition: none;
  }
}
</style>
