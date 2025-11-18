<script setup>
import { computed } from 'vue'

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

function formatTime(created) {
  if (!created) return '방금 전'
  const now = new Date()
  const past = new Date(created)
  const diff = Math.round((now - past) / 1000)

  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.round(diff / 60)}분 전`
  if (diff < 86400) return `${Math.round(diff / 3600)}시간 전`
  return past.toLocaleDateString('ko-KR')
}

const formattedTime = computed(() => formatTime(props.file.created))

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

    <div
      class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
      <span class="text-xs font-medium">{{ formattedTime }}</span>
      <div class="flex items-center gap-2">
        <button
          class="bg-primary/90 border-none text-white px-2 py-1.5 rounded cursor-pointer text-base transition-all duration-200 hover:bg-primary hover:scale-110"
          @click="handleDownload"
          title="다운로드"
        >
          ⬇️
        </button>
        <span class="text-xs text-text-secondary">클릭해서 복사</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 호버시 오버레이 표시 */
.relative:hover > div:last-child {
  opacity: 1;
}
</style>
