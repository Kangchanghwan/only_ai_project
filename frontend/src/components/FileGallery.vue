<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import FileCard from './FileCard.vue'
import FileUploadSection from './FileUploadSection.vue'
import PasteSection from './PasteSection.vue'
import DownloadControls from './DownloadControls.vue'
import MultiFileQRCodeModal from './MultiFileQRCodeModal.vue'

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
  }
})

const emit = defineEmits([
  'copy-image',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'upload-files',
  'paste-content',
  'load-more'
])

const selectedFiles = ref(new Set())
const showMultiQRModal = ref(false)

// 선택된 파일 개수
const selectedCount = computed(() => selectedFiles.value.size)

// 선택된 파일 배열
const selectedFilesArray = computed(() => {
  return props.files.filter(file => selectedFiles.value.has(file.name))
})

// 모든 파일이 선택되었는지 확인
const allFilesSelected = computed(() => {
  return props.files.length > 0 && selectedFiles.value.size === props.files.length
})

// 파일 선택/해제
function toggleFileSelection(fileName) {
  if (selectedFiles.value.has(fileName)) {
    selectedFiles.value.delete(fileName)
  } else {
    selectedFiles.value.add(fileName)
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
    selectedFiles.value = new Set(props.files.map(file => file.name))
  }
}

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
  <div v-if="isLoading" class="text-center py-16 text-text-secondary">
    <div class="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-5"></div>
  </div>

  <div v-else>
    <!-- 다운로드 컨트롤 버튼 -->
    <DownloadControls
      v-if="files.length > 0"
      :selected-count="selectedCount"
      :total-count="files.length"
      :all-selected="allFilesSelected"
      @download-parallel="downloadParallel"
      @toggle-select-all="toggleSelectAll"
      @show-multi-qr="showQRModal"
    />

    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
      <!-- 파일 업로드 카드 (항상 맨 앞에 표시) -->
      <FileUploadSection @upload-files="$emit('upload-files', $event)" />

      <!-- 붙여넣기 카드 (모바일 사용자용) -->
      <PasteSection @paste-content="$emit('paste-content')" />

      <!-- 업로드된 파일 카드들 -->
      <FileCard
        v-for="file in files"
        :key="file.name"
        :file="file"
        :is-selected="selectedFiles.has(file.name)"
        @copy-image="$emit('copy-image', file.url)"
        @toggle-selection="toggleFileSelection"
        @download-file="$emit('download-file', file)"
      />
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

    <!-- 로딩 중 표시 -->
    <div v-if="isLoading" class="flex justify-center mt-8">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
    </div>

    <!-- 다중 파일 QR 코드 모달 -->
    <MultiFileQRCodeModal
      :files="selectedFilesArray"
      :room-id="roomId"
      :is-open="showMultiQRModal"
      @close="showMultiQRModal = false"
    />
  </div>
</template>
