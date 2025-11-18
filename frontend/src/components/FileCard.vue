<script setup>
import { computed } from 'vue'
import { formatFileSize, getFileIcon, getFileType, formatUploadTime } from '../utils/fileUtils'

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

const emit = defineEmits(['copy-image', 'toggle-selection', 'download-file'])

// 파일 메타데이터 계산
const fileMetadata = computed(() => ({
  icon: getFileIcon(props.file.name),
  type: getFileType(props.file.name),
  size: formatFileSize(props.file.size),
  uploadTime: formatUploadTime(props.file.created)
}))

function handleDownload(event) {
  event.stopPropagation()
  emit('download-file', props.file)
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
    <!-- 체크박스 -->
    <input
      type="checkbox"
      class="absolute top-2.5 left-2.5 w-6 h-6 cursor-pointer z-10 accent-primary"
      :checked="isSelected"
      @click.stop
      @change="$emit('toggle-selection', file.name)"
    />

    <img
      :src="file.url"
      :alt="file.name"
      loading="lazy"
      class="w-full h-[200px] object-cover block"
    />

    <!-- 파일 정보 오버레이 (항상 표시) -->
    <div class="absolute top-10 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent">
      <div class="flex items-start gap-2">
        <span class="text-2xl" :title="fileMetadata.type">{{ fileMetadata.icon }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-white truncate" :title="file.name">
            {{ file.name }}
          </p>
          <div class="flex items-center gap-2 text-[10px] text-white/80 mt-0.5">
            <span>{{ fileMetadata.size }}</span>
            <span>•</span>
            <span>{{ fileMetadata.uploadTime }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 액션 버튼 오버레이 (호버시 표시) -->
    <div
      class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
      <span class="text-xs font-medium text-white">클릭해서 복사</span>
      <button
        class="bg-primary/90 border-none text-white px-3 py-1.5 rounded cursor-pointer text-sm font-semibold transition-all duration-200 hover:bg-primary hover:scale-110"
        @click="handleDownload"
        title="다운로드"
      >
        ⬇️ 다운로드
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 호버시 오버레이 표시 */
.relative:hover > div:last-child {
  opacity: 1;
}
</style>
