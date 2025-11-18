<script setup>
import { ref, computed } from 'vue'

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
  <div class="mb-8">
    <!-- 숨겨진 파일 입력 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />

    <!-- 드래그 앤 드롭 영역 -->
    <div
      class="border-2 border-dashed border-border rounded-xl p-12 text-center bg-black/10 transition-all duration-300 cursor-pointer mb-6 hover:border-primary hover:bg-primary/5"
      :class="{ 'border-primary bg-primary/10 scale-[1.02]': isDragging }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div class="pointer-events-none">
        <div class="text-5xl mb-4">📤</div>
        <p class="text-lg text-text-primary mb-6">파일을 드래그하거나 클릭하여 업로드</p>
        <button
          class="bg-primary text-white border-none px-8 py-3 rounded-lg text-base font-semibold cursor-pointer transition-all duration-200 pointer-events-auto hover:bg-primary/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 active:translate-y-0"
          @click="openFileDialog"
        >
          📁 파일 선택
        </button>
      </div>
    </div>

    <!-- 업로드 방법 안내 -->
    <div class="px-6 py-4 bg-black/20 rounded-lg text-text-secondary text-sm">
      <p class="my-2">
        <strong class="text-text-primary">업로드 방법:</strong>
      </p>
      <ul class="list-none p-0 my-4">
        <li class="py-2 leading-6">
          📁 <strong class="text-text-primary">파일 선택</strong>: 버튼을 클릭하여 파일 선택
        </li>
        <li class="py-2 leading-6">
          🖱️ <strong class="text-text-primary">드래그 앤 드롭</strong>: 파일을 위 영역으로 드래그
        </li>
        <li class="py-2 leading-6">
          📋 <strong class="text-text-primary">붙여넣기</strong>: Ctrl+V (Cmd+V)로 클립보드에서 붙여넣기
        </li>
      </ul>
      <p class="text-xs text-orange-500 opacity-90 mt-4">
        ⚠️ 파일 크기 제한: {{ maxFileSizeMB }}MB 이하
      </p>
    </div>
  </div>
</template>
