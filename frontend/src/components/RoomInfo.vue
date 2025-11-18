<script setup>
import { ref } from 'vue'

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

const emit = defineEmits(['copy-room-code', 'join-other-room'])

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
  <div class="flex items-center gap-6 mb-4 flex-wrap">
    <!-- 현재 룸 코드 섹션 -->
    <div class="flex items-center gap-4 text-xl min-h-[38px]">
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

    <!-- 다른 룸 입장 섹션 -->
    <div class="flex items-center gap-3">
      <span class="text-text-secondary text-sm">다른 룸 입장:</span>
      <div class="flex">
        <input
          v-model="joinRoomCode"
          type="text"
          placeholder="6자리 코드"
          maxlength="6"
          class="bg-surface border border-border text-text-primary px-3 py-1.5 rounded-l-lg w-32 text-sm uppercase placeholder:text-text-secondary placeholder:normal-case focus:outline-none focus:border-primary"
          :disabled="isConnecting"
          @keyup.enter="handleJoinOtherRoom"
        />
        <button
          class="bg-primary text-white px-3 py-1.5 rounded-r-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors text-sm"
          :disabled="isConnecting"
          @click="handleJoinOtherRoom"
        >
          →
        </button>
      </div>
    </div>
  </div>
</template>
