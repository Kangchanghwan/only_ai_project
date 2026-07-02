<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  selectedCount: {
    type: Number,
    default: 0
  },
  totalCount: {
    type: Number,
    default: 0
  },
  allSelected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['download-parallel', 'toggle-select-all', 'show-multi-qr', 'delete-selected', 'clear-storage'])
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-blue-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="totalCount === 0"
      @click="$emit('toggle-select-all')"
      :title="allSelected ? t('download.deselectAllHint') : t('download.selectAllHint')"
    >
      <span class="text-base leading-none">{{ allSelected ? '✓' : '☐' }}</span>
      <span class="text-[11px] leading-tight text-center">
        {{ allSelected ? t('download.deselectAll') : t('download.selectAll') }} ({{ selectedCount }}/{{ totalCount }})
      </span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-green-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      :title="t('download.downloadHint')"
    >
      <span class="text-base leading-none">📥</span>
      <span class="text-[11px] leading-tight text-center">{{ t('download.downloadSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-purple-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('show-multi-qr')"
      :title="t('download.qrCodeHint')"
    >
      <span class="text-base leading-none">📱</span>
      <span class="text-[11px] leading-tight text-center">{{ t('download.qrCode') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-red-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('delete-selected')"
    >
      <span class="text-base leading-none">🗑️</span>
      <span class="text-[11px] leading-tight text-center">{{ t('file.deleteSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="totalCount === 0"
      @click="$emit('clear-storage')"
    >
      <span class="text-base leading-none">⚠️</span>
      <span class="text-[11px] leading-tight text-center">{{ t('file.clearStorage') }}</span>
    </button>
  </div>
</template>
