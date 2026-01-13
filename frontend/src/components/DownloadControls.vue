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

const emit = defineEmits(['download-parallel', 'toggle-select-all', 'show-multi-qr'])
</script>

<template>
  <div class="flex items-center gap-4 mb-6 p-4 bg-black/20 rounded-lg flex-wrap">
    <button
      class="bg-blue-600 text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-blue-700 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-blue-500/30"
      :disabled="totalCount === 0"
      @click="$emit('toggle-select-all')"
      :title="allSelected ? t('download.deselectAllHint') : t('download.selectAllHint')"
    >
      {{ allSelected ? '✓ ' + t('download.deselectAll') : '☐ ' + t('download.selectAll') }} ({{ selectedCount }}/{{ totalCount }})
    </button>
    <button
      class="bg-green-600 text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-green-700 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-green-500/30"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      :title="t('download.downloadHint')"
    >
      📥 {{ t('download.downloadSelected') }} ({{ selectedCount }})
    </button>
    <button
      class="bg-purple-600 text-white border-none px-5 py-2.5 rounded-md cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:bg-purple-700 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-purple-500/30"
      :disabled="selectedCount === 0"
      @click="$emit('show-multi-qr')"
      :title="t('download.qrCodeHint')"
    >
      📱 {{ t('download.qrCode') }} ({{ selectedCount }})
    </button>
    <span v-if="selectedCount > 0" class="text-[0.85rem] text-text-secondary italic">
      💡 {{ t('download.tipSequential') }}
    </span>
  </div>
</template>
