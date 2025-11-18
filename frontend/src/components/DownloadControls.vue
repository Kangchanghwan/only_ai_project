<script setup>
defineProps({
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['download-selected', 'download-all', 'download-parallel'])
</script>

<template>
  <div class="flex items-center gap-4 mb-6 p-4 bg-black/20 rounded-lg flex-wrap">
    <button
      class="bg-primary text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-primary/80 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-primary/30"
      :disabled="selectedCount === 0"
      @click="$emit('download-selected')"
    >
      📥 ZIP 다운로드 ({{ selectedCount }})
    </button>
    <button
      class="bg-green-600 text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-green-700 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-green-500/30"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      title="선택된 파일들을 개별적으로 병렬 다운로드합니다"
    >
      ⚡ 병렬 다운로드 ({{ selectedCount }})
    </button>
    <button
      class="bg-primary text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 hover:bg-primary/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
      @click="$emit('download-all')"
    >
      📦 전체 다운로드
    </button>
    <span v-if="selectedCount > 0" class="text-[0.85rem] text-text-secondary italic">
      💡 Tip: 병렬 다운로드는 각 파일을 개별적으로 동시에 다운로드합니다
    </span>
  </div>
</template>
