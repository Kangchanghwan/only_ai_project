<script setup>
/**
 * 그룹 방 입장 확인 시트. 초대 링크를 열어도 이 시트에서 "들어가기"를 눌러야만 들어간다(자동 입장 없음).
 * 첫 포커스는 "취소", Esc = 취소.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  /** { roomId, name, busy } 또는 null */
  sheet: { type: Object, default: null }
})
const emit = defineEmits(['confirm', 'cancel'])

const root = ref(null)
const cancelBtn = ref(null)

watch(
  () => props.sheet?.roomId,
  async (id) => {
    if (!id) return
    await nextTick()
    cancelBtn.value?.focus()
  },
  { immediate: true, flush: 'post' }
)

function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('cancel'); return }
  trapTab(event, root.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="sheet"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="group-join-sheet"
    >
      <div
        ref="root"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="group-join-title"
        aria-describedby="group-join-body"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="group-join-title" class="text-base font-semibold m-0" data-testid="group-join-title">{{ t('group.joinTitle', { name: sheet.name }) }}</h2>
        <p id="group-join-body" class="m-0 mt-3 text-sm text-text-secondary leading-relaxed">{{ t('group.joinBody') }}</p>
        <div class="mt-5 flex gap-2 justify-end">
          <button
            ref="cancelBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
            :disabled="sheet.busy"
            data-testid="group-join-cancel"
            @click="emit('cancel')"
          >{{ t('group.cancel') }}</button>
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-50"
            :disabled="sheet.busy"
            data-testid="group-join-confirm"
            @click="emit('confirm')"
          >{{ t('group.joinAction') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
