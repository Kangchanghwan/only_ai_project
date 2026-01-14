<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HelpModal from './HelpModal.vue'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggleButton from './ThemeToggleButton.vue'

const { t } = useI18n()

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
      <span>{{ t('app.title') }}</span>
    </div>
    <div class="flex items-center gap-4">
      <LanguageSelector />
      <ThemeToggleButton />
      <button
        class="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-lg transition-all duration-200 flex items-center justify-center border-2 border-primary/30 hover:border-primary/50"
        @click="openHelpModal"
        :title="t('app.helpTitle')"
        :aria-label="t('app.help')"
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
