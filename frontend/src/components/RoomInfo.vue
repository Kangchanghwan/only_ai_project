<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCodeModal from './QRCodeModal.vue'

const { t } = useI18n()

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
const isQRModalOpen = ref(false)

function handleJoinOtherRoom() {
  const code = joinRoomCode.value.trim().toUpperCase()
  if (code && code.length === 6) {
    emit('join-other-room', code)
    joinRoomCode.value = ''
  }
}

function openQRModal() {
  isQRModalOpen.value = true
}

function closeQRModal() {
  isQRModalOpen.value = false
}
</script>

<template>
  <div class="flex items-center gap-6 mb-4 flex-wrap">
    <!-- 현재 룸 코드 섹션 -->
    <div class="flex items-center gap-4 text-xl min-h-[38px]">
      <span class="text-text-secondary">{{ t('room.currentRoomCode') }}</span>
      <div v-if="isConnecting" class="flex items-center gap-3 text-xl text-text-secondary">
        <div class="w-6 h-6 border-3 border-border border-t-ink rounded-full animate-spin"></div>
        <span>{{ t('room.connecting') }}</span>
      </div>
      <template v-else-if="roomId">
        <span
          class="font-bold text-2xl text-ink cursor-pointer hover:opacity-80 transition-opacity"
          @click="$emit('copy-room-code')"
        >
          {{ roomId }}
        </span>
        <div class="flex gap-2">
          <button
            class="bg-transparent border-2 border-ink text-ink font-bold px-3 py-1 rounded-none cursor-pointer text-xs hover:bg-tint transition-colors"
            @click="$emit('copy-room-code')"
          >
            {{ t('room.copy') }}
          </button>
          <button
            class="bg-ink text-on-ink font-bold px-3 py-1 rounded-none cursor-pointer text-xs hover:opacity-90 transition-colors flex items-center gap-1"
            @click="openQRModal"
            :title="t('room.qrShareTitle')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            {{ t('room.qr') }}
          </button>
        </div>
      </template>
    </div>

    <!-- 다른 룸 입장 섹션 -->
    <div class="flex items-center gap-3">
      <span class="text-text-secondary text-sm">{{ t('room.joinOtherRoom') }}</span>
      <div class="flex">
        <input
          v-model="joinRoomCode"
          type="text"
          :placeholder="t('room.enterCode')"
          maxlength="6"
          class="bg-surface border border-border text-text-primary px-3 py-1.5 rounded-none w-32 text-sm uppercase placeholder:text-text-secondary placeholder:normal-case focus:outline-none focus:border-ink"
          :disabled="isConnecting"
          @keyup.enter="handleJoinOtherRoom"
        />
        <button
          class="bg-primary text-white px-3 py-1.5 rounded-none font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-colors text-sm"
          :disabled="isConnecting"
          @click="handleJoinOtherRoom"
        >
          →
        </button>
      </div>
    </div>

    <!-- QR 코드 모달 -->
    <QRCodeModal
      v-if="roomId"
      :room-code="roomId"
      :is-open="isQRModalOpen"
      @close="closeQRModal"
    />
  </div>
</template>
