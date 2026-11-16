<script setup>
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

/** 배지 숫자: 100개부터는 99+ */
const fmt = (n) => (n > 99 ? '99+' : String(n))

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
  },
  /** 방: 모두 선택·받기·선택 삭제만 보인다 (받기는 이 기기에서 풀어 ZIP으로. QR·비우기는 공개 URL 기준이라 잠긴 파일에 쓸 수 없다) */
  privateMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['download-parallel', 'toggle-select-all', 'show-multi-qr', 'delete-selected', 'clear-storage'])

const { text: accentText } = useScopeAccent(() => props.scope)
</script>

<template>
  <div class="fixed left-1/2 -translate-x-1/2 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 w-[calc(100%-2rem)] max-w-[28rem] bg-surface border-2 border-ink rounded-none overflow-hidden download-controls grid" :class="selectedCount === 0 ? (privateMode ? 'grid-cols-1' : 'grid-cols-2') : (privateMode ? 'grid-cols-3' : 'grid-cols-4 md:grid-cols-5')" data-testid="download-controls">
    <button
      class="dc-btn flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors text-ink"
      :disabled="totalCount === 0"
      data-testid="select-all"
      :aria-pressed="allSelected ? 'true' : 'false'"
      @click="$emit('toggle-select-all')"
      :title="allSelected ? t('download.deselectAllHint') : t('download.selectAllHint')"
    >
      <span class="dc-icon relative inline-flex">
        <svg v-if="allSelected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <polyline points="8 12.5 11 15.5 16 9.5" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <rect x="4" y="4" width="16" height="16" rx="4" />
        </svg>
        <span v-if="totalCount > 0" class="dc-badge absolute left-[13px] -top-[6px] min-w-4 h-4 px-1 bg-ink text-on-ink text-[10px] font-extrabold leading-4 text-center tabular-nums whitespace-nowrap rounded-[2px] ring-[1.5px] ring-surface" aria-hidden="true" data-testid="dc-badge">{{ fmt(selectedCount) + '/' + fmt(totalCount) }}</span>
      </span>
      <span class="dc-label text-[11px] leading-tight text-center">
        {{ allSelected ? t('download.deselectAll') : t('download.selectAll') }}<span class="sr-only"> ({{ selectedCount }}/{{ totalCount }})</span>
      </span>
    </button>
    <button
      class="dc-btn flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors text-ink"
      v-if="selectedCount > 0"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      :title="t('download.downloadHint')"
    >
      <span class="dc-icon relative inline-flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span v-if="selectedCount > 0" class="dc-badge absolute left-[13px] -top-[6px] min-w-4 h-4 px-1 bg-ink text-on-ink text-[10px] font-extrabold leading-4 text-center tabular-nums whitespace-nowrap rounded-[2px] ring-[1.5px] ring-surface" aria-hidden="true" data-testid="dc-badge">{{ fmt(selectedCount) }}</span>
      </span>
      <span class="dc-label text-[11px] leading-tight text-center">{{ t('download.downloadSelected') }}<span class="sr-only"> ({{ selectedCount }})</span></span>
    </button>
    <button
      class="dc-btn hidden md:flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors text-ink"
      v-if="selectedCount > 0 && !privateMode"
      :disabled="selectedCount === 0"
      data-testid="multi-qr"
      @click="$emit('show-multi-qr')"
      :title="t('download.qrCodeHint')"
    >
      <span class="dc-icon relative inline-flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
          <rect x="18" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
          <rect x="14" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
          <rect x="18" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
        </svg>
        <span v-if="selectedCount > 0" class="dc-badge absolute left-[13px] -top-[6px] min-w-4 h-4 px-1 bg-ink text-on-ink text-[10px] font-extrabold leading-4 text-center tabular-nums whitespace-nowrap rounded-[2px] ring-[1.5px] ring-surface" aria-hidden="true" data-testid="dc-badge">{{ fmt(selectedCount) }}</span>
      </span>
      <span class="dc-label text-[11px] leading-tight text-center">{{ t('download.qrCode') }}<span class="sr-only"> ({{ selectedCount }})</span></span>
    </button>
    <button
      class="dc-btn flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-danger disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      v-if="selectedCount > 0"
      :disabled="selectedCount === 0"
      data-testid="delete-selected"
      @click="$emit('delete-selected')"
    >
      <span class="dc-icon relative inline-flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
        <span v-if="selectedCount > 0" class="dc-badge absolute left-[13px] -top-[6px] min-w-4 h-4 px-1 bg-danger text-on-accent text-[10px] font-extrabold leading-4 text-center tabular-nums whitespace-nowrap rounded-[2px] ring-[1.5px] ring-surface" aria-hidden="true" data-testid="dc-badge">{{ fmt(selectedCount) }}</span>
      </span>
      <span class="dc-label text-[11px] leading-tight text-center">{{ t('file.deleteSelected') }}<span class="sr-only"> ({{ selectedCount }})</span></span>
    </button>
    <button
      class="dc-btn flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      v-if="!privateMode"
      :disabled="totalCount === 0"
      @click="$emit('clear-storage')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
        <!-- 폴더 X: 이 공간의 파일을 통째로 비운다 (선택 삭제의 휴지통과 구분) -->
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        <path d="m9.5 10.5 5 5" />
        <path d="m14.5 10.5-5 5" />
      </svg>
      <span class="dc-label text-[11px] leading-tight text-center">{{ t('file.clearStorage') }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 좁은 폭(<768px): 버튼 단위로 줄바꿈하고 라벨은 한 줄 유지 (단어 중간 끊김 방지) */
@media (max-width: 767.98px) {
  .dc-btn {
    flex: 1 1 auto;
    min-height: 44px;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  .dc-label {
    white-space: nowrap;
    word-break: keep-all;
  }
}
</style>
