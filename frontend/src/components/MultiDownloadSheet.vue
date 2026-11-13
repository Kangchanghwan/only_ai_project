<script setup>
/**
 * 여러 파일 받기 시트. 다운로드가 2건 이상 필요할 때(ZIP 묶음이 여럿이거나 200MB 넘는 파일이 있을 때) 연다.
 * 첫 건은 열자마자 시작하고, 나머지는 사용자가 눌러 받는다. Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'
import MultiDownloadList from './MultiDownloadList.vue'

const { t } = useI18n()
const props = defineProps({
  /** { items } 또는 null */
  sheet: { type: Object, default: null }
})
const emit = defineEmits(['close', 'run'])

const root = ref(null)
const closeBtn = ref(null)

watch(
  () => props.sheet,
  async (s) => {
    if (!s) return
    await nextTick()
    closeBtn.value?.focus()
  },
  { immediate: true, flush: 'post' }
)

function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  trapTab(event, root.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="sheet"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="multi-download-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-download-title"
        class="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-primary p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="multi-download-title" class="text-base font-semibold m-0">{{ t('multiDownload.title') }}</h2>
        <p class="m-0 mt-2 mb-3 text-sm text-text-secondary leading-relaxed">{{ t('multiDownload.intro') }}</p>
        <MultiDownloadList :items="sheet.items" @run="emit('run', $event)" />
        <p class="m-0 mt-3 text-xs text-text-secondary leading-relaxed">{{ t('multiDownload.note') }}</p>
        <div class="mt-4 flex justify-end">
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
            data-testid="multi-download-close"
            @click="emit('close')"
          >{{ t('multiDownload.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
