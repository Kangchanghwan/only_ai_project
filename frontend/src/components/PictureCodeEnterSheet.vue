<script setup>
/**
 * "그림으로 들어가기" 시트: PictureCodeEnter를 하단 시트/대화상자에 담는다.
 * 코드를 직접 입력했으므로 승인되면 확인 시트 없이 바로 들어간다(부모가 처리). Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import PictureCodeEnter from './PictureCodeEnter.vue'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: String, default: 'idle' },
  warn: { type: Boolean, default: false },
  retryAfterSec: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'submit', 'cancel'])

const root = ref(null)
const closeBtn = ref(null)

watch(
  () => props.open,
  async (v) => {
    if (!v) return
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
      v-if="open"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="picture-code-enter-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picture-enter-sheet-title"
        class="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-4 sm:p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 id="picture-enter-sheet-title" class="text-base font-semibold m-0">{{ t('code.enter') }}</h2>
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-3 rounded-full border border-border text-sm font-semibold"
            data-testid="picture-enter-sheet-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
        </div>
        <PictureCodeEnter
          class="mt-3"
          :status="status"
          :warn="warn"
          :retry-after-sec="retryAfterSec"
          @submit="emit('submit', $event)"
          @cancel="emit('cancel')"
        />
      </div>
    </div>
  </Teleport>
</template>
