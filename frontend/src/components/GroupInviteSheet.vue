<script setup>
/**
 * 그룹 방 초대 시트: QR + "링크 복사" + 안내 2줄(10분 유효, 믿는 사람에게만).
 * 열 때마다 새 초대 입장권이 들어 있는 QR이다. 좁은 화면은 하단 시트, 넓은 화면은 가운데 대화상자. Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  /** { roomId, name, url, qrDataUrl, loading } 또는 null */
  sheet: { type: Object, default: null }
})
const emit = defineEmits(['close', 'copy'])

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
      data-testid="group-invite-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-invite-title"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="group-invite-title" class="text-base font-semibold m-0">{{ t('group.inviteTitle', { name: sheet.name }) }}</h2>
        <div class="mt-4 flex justify-center">
          <img
            v-if="sheet.qrDataUrl"
            :src="sheet.qrDataUrl"
            width="224"
            height="224"
            alt="QR"
            class="rounded-lg bg-white"
            data-testid="group-invite-qr"
          />
          <div v-else class="w-56 h-56 rounded-lg bg-background animate-pulse" aria-hidden="true" data-testid="group-invite-loading"></div>
        </div>
        <p class="m-0 mt-4 text-sm text-text-primary" data-testid="group-invite-expiry">{{ t('group.inviteExpiry') }}</p>
        <p class="m-0 mt-1 text-xs text-text-secondary leading-relaxed" data-testid="group-invite-warning">{{ t('group.inviteWarning') }}</p>
        <div class="mt-4 flex gap-2 justify-end">
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
            data-testid="group-invite-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-50"
            :disabled="!sheet.url"
            data-testid="group-invite-copy"
            @click="emit('copy')"
          >{{ t('group.inviteCopy') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
