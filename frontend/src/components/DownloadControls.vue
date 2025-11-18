<script setup>
defineProps({
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['download-selected', 'download-all'])
</script>

<template>
  <div class="flex items-center gap-4 mb-6 p-4 bg-black/20 rounded-lg flex-wrap">
    <button
      class="bg-primary text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-primary/80 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-primary/30"
      :disabled="selectedCount === 0"
      @click="$emit('download-selected')"
    >
      📥 선택 항목 다운로드 ({{ selectedCount }})
    </button>
    <button
      class="bg-primary text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 hover:bg-primary/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
      @click="$emit('download-all')"
    >
      📦 전체 다운로드
    </button>
    <span v-if="selectedCount > 0" class="text-[0.85rem] text-text-secondary italic">
      💡 Tip: Ctrl+C로 클립보드 복사 (단일 파일만 가능, 다중 파일은 ZIP 다운로드 권장)
    </span>
  </div>
</template>
