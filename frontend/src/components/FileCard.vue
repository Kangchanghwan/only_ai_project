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
