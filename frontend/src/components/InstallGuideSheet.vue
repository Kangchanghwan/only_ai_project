<script setup>
/**
 * iOS Safari 홈 화면 추가 안내 시트. 좁은 화면은 하단 시트, 넓은 화면은 가운데 대화상자.
 * Esc 닫기, Tab 포커스 가두기, 첫 포커스는 "닫기".
 */
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'
import { isIPad } from '../composables/usePWAInstall'

const { t } = useI18n()
const props = defineProps({
  isOpen: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const root = ref(null)
const closeBtn = ref(null)
const step1Key = computed(() => (isIPad() ? 'pwa.step1Tablet' : 'pwa.step1Phone'))

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return
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
      v-if="isOpen"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="install-guide-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="install-guide-title" class="text-base font-semibold m-0">{{ t('pwa.guideTitle') }}</h2>
        <ol class="mt-4 m-0 p-0 list-none flex flex-col gap-3" data-testid="install-guide-steps">
          <li class="flex items-center gap-3 text-sm" data-testid="install-guide-step">
            <span class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
            <span class="flex-1">{{ t(step1Key) }}</span>
            <svg class="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
            </svg>
          </li>
          <li class="flex items-center gap-3 text-sm" data-testid="install-guide-step">
            <span class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
            <span class="flex-1">{{ t('pwa.step2') }}</span>
            <svg class="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8" /><path d="M8 12h8" />
            </svg>
          </li>
          <li class="flex items-center gap-3 text-sm" data-testid="install-guide-step">
            <span class="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
            <span class="flex-1">{{ t('pwa.step3') }}</span>
            <svg class="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m5 12 5 5L20 7" />
            </svg>
          </li>
        </ol>
        <p class="mt-4 mb-0 text-xs text-text-secondary leading-relaxed">{{ t('pwa.guideBenefit') }}</p>
        <button
          ref="closeBtn"
          type="button"
          class="mt-4 w-full min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold"
          data-testid="install-guide-close"
          @click="emit('close')"
        >{{ t('pwa.close') }}</button>
      </div>
    </div>
  </Teleport>
</template>
