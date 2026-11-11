<script setup>
/**
 * "＋ 방" 선택 시트: 새 방 만들기 / 그림으로 들어가기. 좁은 화면은 하단 시트, 넓은 화면은 가운데 대화상자. Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'create', 'enter'])

const root = ref(null)
const createBtn = ref(null)

watch(
  () => props.open,
  async (v) => {
    if (!v) return
    await nextTick()
    createBtn.value?.focus()
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
      data-testid="room-add-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-add-title"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="room-add-title" class="text-base font-semibold m-0">{{ t('code.addTitle') }}</h2>
        <div class="mt-4 flex flex-col gap-3">
          <button
            ref="createBtn"
            type="button"
            class="w-full min-h-[72px] px-4 py-3 rounded-xl border border-scope-private bg-scope-private/10 text-left"
            data-testid="room-add-create"
            @click="emit('create')"
          >
            <span class="block text-base font-semibold text-scope-private">{{ t('code.addCreateTitle') }}</span>
            <span class="block mt-1 text-xs text-text-secondary leading-snug">{{ t('code.addCreateDesc') }}</span>
          </button>
          <button
            type="button"
            class="w-full min-h-[72px] px-4 py-3 rounded-xl border border-border bg-background text-left"
            data-testid="room-add-enter"
            @click="emit('enter')"
          >
            <span class="block text-base font-semibold text-text-primary">{{ t('code.enter') }}</span>
            <span class="block mt-1 text-xs text-text-secondary leading-snug">{{ t('code.addEnterDesc') }}</span>
          </button>
        </div>
        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
            data-testid="room-add-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
