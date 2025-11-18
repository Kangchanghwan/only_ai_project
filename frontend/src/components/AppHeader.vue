<script setup>
const props = defineProps({
  userCount: {
    type: Number,
    default: 1
  },
  isConnecting: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <header class="flex justify-between items-center mb-8 flex-wrap gap-4">
    <div class="flex items-center gap-3 text-2xl font-semibold">
      <span class="text-4xl">📋</span>
      <span>Clipboard Share</span>
    </div>
    <div class="flex items-center gap-6">
      <span class="text-sm text-text-secondary whitespace-nowrap">
        {{ userCount }}명 접속 중
      </span>
    </div>
  </header>
</template>
