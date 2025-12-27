<script setup>
defineProps({
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['download-parallel'])
</script>

<template>
  <div class="flex items-center gap-4 mb-6 p-4 bg-black/20 rounded-lg flex-wrap">
    <button
      class="bg-green-600 text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-green-700 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-green-500/30"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      title="선택된 파일들을 하나씩 순차적으로 다운로드합니다"
    >
      📥 다운로드 ({{ selectedCount }})
    </button>
    <span v-if="selectedCount > 0" class="text-[0.85rem] text-text-secondary italic">
      💡 Tip: 파일들을 하나씩 순차적으로 다운로드합니다
    </span>
  </div>
</template>
