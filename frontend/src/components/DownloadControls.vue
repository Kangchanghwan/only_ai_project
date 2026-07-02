<script setup>
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

const props = defineProps({
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
  },
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['download-parallel', 'toggle-select-all', 'show-multi-qr', 'delete-selected', 'clear-storage'])

const { text: accentText } = useScopeAccent(() => props.scope)
</script>

<template>
  <div class="fixed left-1/2 -translate-x-1/2 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 w-[calc(100%-2rem)] max-w-[28rem] bg-surface border border-border rounded-2xl shadow-lg grid grid-cols-5 overflow-hidden">
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :class="accentText"
      :disabled="totalCount === 0"
      @click="$emit('toggle-select-all')"
      :title="allSelected ? t('download.deselectAllHint') : t('download.selectAllHint')"
    >
      <svg v-if="allSelected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <polyline points="8 12.5 11 15.5 16 9.5" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <rect x="4" y="4" width="16" height="16" rx="4" />
      </svg>
      <span class="text-[11px] leading-tight text-center">
        {{ allSelected ? t('download.deselectAll') : t('download.selectAll') }} ({{ selectedCount }}/{{ totalCount }})
      </span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :class="accentText"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      :title="t('download.downloadHint')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="text-[11px] leading-tight text-center">{{ t('download.downloadSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :class="accentText"
      :disabled="selectedCount === 0"
      @click="$emit('show-multi-qr')"
      :title="t('download.qrCodeHint')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="18" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="14" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="18" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
      <span class="text-[11px] leading-tight text-center">{{ t('download.qrCode') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-red-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('delete-selected')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
      <span class="text-[11px] leading-tight text-center">{{ t('file.deleteSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="totalCount === 0"
      @click="$emit('clear-storage')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <line x1="18" y1="3" x2="10" y2="11" />
        <path d="M10 11 L4 13 L4 19 L11 19 L13 13 Z" />
        <line x1="6" y1="19" x2="4" y2="21" />
        <line x1="9" y1="19" x2="7.5" y2="21" />
      </svg>
      <span class="text-[11px] leading-tight text-center">{{ t('file.clearStorage') }}</span>
    </button>
  </div>
</template>
