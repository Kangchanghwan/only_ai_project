<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import FileCard from './FileCard.vue'
import FileUploadSection from './FileUploadSection.vue'
import DownloadControls from './DownloadControls.vue'

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'copy-image',
  'download-file',
  'download-selected',
  'download-all',
  'download-parallel',
  'copy-selected-to-clipboard',
  'upload-files'
])

const selectedFiles = ref(new Set())

// 선택된 파일 개수
const selectedCount = computed(() => selectedFiles.value.size)

// 선택된 파일 배열
const selectedFilesArray = computed(() => {
  return props.files.filter(file => selectedFiles.value.has(file.name))
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

// 선택 항목 다운로드
function downloadSelected() {
  if (selectedCount.value > 0) {
    emit('download-selected', selectedFilesArray.value)
  }
}

// 병렬 다운로드
function downloadParallel() {
  if (selectedCount.value > 0) {
    emit('download-parallel', selectedFilesArray.value)
  }
}

// 전체 다운로드
function downloadAll() {
  emit('download-all', props.files)
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
      @download-selected="downloadSelected"
      @download-parallel="downloadParallel"
      @download-all="downloadAll"
    />

    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
      <!-- 파일 업로드 카드 (항상 맨 앞에 표시) -->
      <FileUploadSection @upload-files="$emit('upload-files', $event)" />

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
  </div>
</template>
