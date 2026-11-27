<script setup>
/**
 * 같은 네트워크 탭 "휴대폰 초대" 시트: WakeQrPanel 하나만 든다. GroupInviteSheet와 같은 껍데기.
 * 좁은 화면은 하단 시트, 넓은 화면은 가운데 대화상자. Esc = 닫기.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState'
import WakeQrPanel from './WakeQrPanel.vue'

const { t } = useI18n()
const props = defineProps({
  open: { type: Boolean, default: false },
  qrUrl: { type: String, default: '' }
})
const emit = defineEmits(['close'])

const root = ref(null)
const closeBtn = ref(null)

watch(
  () => props.open,
  async (on) => {
    if (!on) return
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
      data-testid="phone-connect-sheet"
      @click.self="emit('close')"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-connect-title"
        class="w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-surface text-text-primary rounded-none border-2 border-ink p-5"
        @keydown="onKeydown"
      >
        <h2 id="phone-connect-title" class="text-base font-semibold m-0">{{ t('roomQr.inviteCard') }}</h2>
        <WakeQrPanel
          class="mt-4"
          :qr-url="qrUrl || EMPTY_STATE_QR_URL"
          :line1="t('room.emptyState.qrLine')"
          :line2="t('roomQr.line2Ip')"
        />
        <div class="mt-4 flex justify-end">
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-none border-2 border-ink text-ink hover:bg-tint text-sm font-bold"
            data-testid="phone-connect-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
