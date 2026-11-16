<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  scope: { type: String, default: 'ip' }
})
const emit = defineEmits(['paste-content'])
</script>

<template>
  <!-- 붙여넣기는 secondary: 압축된 한 줄 -->
  <div class="flex items-center justify-between gap-3 flex-wrap min-w-0" data-testid="paste-row">
    <p class="sr-only">{{ t('clipboard.pasteDescription') }} {{ t('file.uploadPasteHint') }}</p>
    <button
      type="button"
      :title="`${t('clipboard.pasteDescription')} ${t('file.uploadPasteHint')}`"
      class="ml-auto min-h-[44px] px-4 rounded-none border-2 border-ink bg-transparent text-sm font-bold text-ink hover:bg-tint inline-flex items-center gap-2"
      data-testid="paste-button"
      @click="emit('paste-content')"
    >
      <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>{{ t('clipboard.pasteTitle') }}
    </button>
  </div>
</template>
