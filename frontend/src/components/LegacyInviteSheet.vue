<script setup>
/**
 * 예전 방식(prv-…)으로 만든 방에서 "초대"를 눌렀을 때의 안내 시트.
 * 이런 방은 초대할 수 없으므로 "새 방 만들기"로 안내한다. Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  /** { roomId } 또는 null */
  sheet: { type: Object, default: null }
})
const emit = defineEmits(['close', 'create'])

const root = ref(null)
const closeBtn = ref(null)

watch(
  () => props.sheet?.roomId,
  async (id) => {
    if (!id) return
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
      data-testid="legacy-invite-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-invite-title"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="legacy-invite-title" class="text-base font-semibold m-0">{{ t('room.legacyInviteTitle') }}</h2>
        <p class="m-0 mt-2 text-sm text-text-secondary leading-relaxed">{{ t('room.legacyInviteBody') }}</p>
        <div class="mt-4 flex gap-2 justify-end">
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
            data-testid="legacy-invite-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold"
            data-testid="legacy-invite-create"
            @click="emit('create')"
          >{{ t('room.legacyInviteCreate') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
