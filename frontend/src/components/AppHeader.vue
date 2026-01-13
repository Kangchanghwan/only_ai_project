<script setup>
import { ref } from 'vue'
import HelpModal from './HelpModal.vue'
import LanguageSelector from './LanguageSelector.vue'

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

const isHelpModalOpen = ref(false)

function openHelpModal() {
  isHelpModalOpen.value = true
}

function closeHelpModal() {
  isHelpModalOpen.value = false
}
</script>

<template>
  <header class="flex justify-between items-center mb-8 flex-wrap gap-4">
    <div class="flex items-center gap-3 text-2xl font-semibold">
      <span class="text-4xl">📋</span>
      <span>Clipboard Share</span>
    </div>
    <div class="flex items-center gap-6">
      <LanguageSelector />
      <button
        class="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-lg transition-all duration-200 flex items-center justify-center border-2 border-primary/30 hover:border-primary/50"
        @click="openHelpModal"
        title="사용 방법 보기"
        aria-label="도움말"
      >
        ?
      </button>
    </div>
  </header>

  <!-- 도움말 모달 -->
  <HelpModal
    :is-open="isHelpModalOpen"
    @close="closeHelpModal"
  />
</template>
