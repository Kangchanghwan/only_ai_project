<script setup>
import { ref } from 'vue'

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

const emit = defineEmits(['join-other-room'])

const joinRoomCode = ref('')

function handleJoinOtherRoom() {
  const code = joinRoomCode.value.trim().toUpperCase()
  if (code && code.length === 6) {
    emit('join-other-room', code)
    joinRoomCode.value = ''
  }
}
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
      <div class="flex">
        <input
          v-model="joinRoomCode"
          type="text"
          placeholder="다른 룸 코드로 입장"
          maxlength="6"
          class="bg-surface border border-border text-text-primary px-4 py-2 rounded-l-lg w-45 text-sm uppercase placeholder:text-text-secondary placeholder:normal-case focus:outline-none focus:border-primary"
          :disabled="isConnecting"
          @keyup.enter="handleJoinOtherRoom"
        />
        <button
          class="bg-primary text-white px-4 py-2 rounded-r-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          :disabled="isConnecting"
          @click="handleJoinOtherRoom"
        >
          →
        </button>
      </div>
    </div>
  </header>
</template>
