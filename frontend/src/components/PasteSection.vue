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
    <p class="text-xs text-text-secondary m-0 min-w-0 flex-1 basis-40">{{ t('clipboard.pasteDescription') }} {{ t('file.uploadPasteHint') }}</p>
    <button
      type="button"
      class="min-h-[44px] px-4 rounded-full border border-border bg-background text-sm font-semibold text-text-primary hover:border-primary inline-flex items-center gap-2"
      data-testid="paste-button"
      @click="emit('paste-content')"
    >
      <span aria-hidden="true">📋</span>{{ t('clipboard.pasteTitle') }}
    </button>
  </div>
</template>
