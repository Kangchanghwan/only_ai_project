<script setup>
defineProps({
  roomId: {
    type: String,
    default: null
  },
  isConnecting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['copy-room-code'])
</script>

<template>
  <div class="flex items-center gap-4 mb-4 text-xl min-h-[38px]">
    <span class="text-text-secondary">현재 룸 코드:</span>
    <div v-if="isConnecting" class="flex items-center gap-3 text-xl text-text-secondary">
      <div class="w-6 h-6 border-3 border-border border-t-primary rounded-full animate-spin"></div>
      <span>연결 중...</span>
    </div>
    <template v-else-if="roomId">
      <span
        class="font-bold text-2xl text-primary cursor-pointer hover:opacity-80 transition-opacity"
        @click="$emit('copy-room-code')"
      >
        {{ roomId }}
      </span>
      <button
        class="bg-transparent border border-border text-text-secondary px-3 py-1 rounded-md cursor-pointer text-xs hover:bg-border hover:text-text-primary transition-colors"
        @click="$emit('copy-room-code')"
      >
        복사
      </button>
    </template>
  </div>
</template>
