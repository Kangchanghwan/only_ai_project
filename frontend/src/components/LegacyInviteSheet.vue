<script setup>
/**
 * 예전 방식(prv-…)으로 만든 방에서 "초대"를 눌렀을 때의 안내 시트.
 * 이런 방은 초대할 수 없으므로 "새 방 만들기"로 안내한다. Esc = 닫기.
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { trapTab } from '../utils/focusTrap'
import WakeQrPanel from './WakeQrPanel.vue'

const CONNECTING_GRACE_MS = 3000

const { t } = useI18n()
const props = defineProps({
  /** { roomId } 또는 null */
  sheet: { type: Object, default: null },
  /** 1:1 상대 상태 ('online' | 'offline' | 'connecting' | 'left') */
  status: { type: String, default: '' },
  /** "내 휴대폰" QR 주소 (방 꼬리표 포함) */
  mineQrUrl: { type: String, default: '' }
})
const emit = defineEmits(['close', 'create', 'mine-shown', 'arrived'])

// 연결 중은 잠깐 지나가는 경우가 많아 3초 넘게 이어질 때만 보인다
const connectingLong = ref(false)
let connectingTimer = null
function clearConnecting() { if (connectingTimer) { clearTimeout(connectingTimer); connectingTimer = null } }
watch([() => props.sheet?.roomId, () => props.status], ([, st]) => {
  clearConnecting()
  connectingLong.value = false
  if (st === 'connecting') connectingTimer = setTimeout(() => { connectingTimer = null; connectingLong.value = true }, CONNECTING_GRACE_MS)
}, { immediate: true })
onBeforeUnmount(clearConnecting)
const showMine = computed(() => !!props.sheet && (props.status === 'offline' || (props.status === 'connecting' && connectingLong.value)))
// 보이는 동안 상대가 들어오면 부모가 창을 닫고 알린다
watch(showMine, (now, before) => {
  if (now) emit('mine-shown')
  else if (before && props.sheet && props.status === 'online') emit('arrived')
}, { immediate: true })

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
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-none border-2 border-ink border-t-4 border-t-scope-private p-5"
        @keydown="onKeydown"
      >
        <h2 id="legacy-invite-title" class="text-base font-semibold m-0">{{ t('room.legacyInviteTitle') }}</h2>
        <div v-if="showMine" class="mt-4 pb-4 border-b border-border" data-testid="legacy-invite-mine">
          <p class="m-0 mb-3 text-sm font-semibold text-center">{{ t('roomQr.legacyMine') }}</p>
          <WakeQrPanel :qr-url="mineQrUrl" :line1="t('roomQr.line1')" :line2="t('roomQr.line2')" />
        </div>
        <p class="m-0 mt-2 text-sm text-text-secondary leading-relaxed">{{ t('room.legacyInviteBody') }}</p>
        <div class="mt-4 flex gap-2 justify-end">
          <button
            ref="closeBtn"
            type="button"
            class="min-h-[44px] px-4 rounded-none border-2 border-ink text-ink hover:bg-tint text-sm font-bold"
            data-testid="legacy-invite-close"
            @click="emit('close')"
          >{{ t('group.close') }}</button>
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-none bg-scope-private text-on-accent text-sm font-semibold"
            data-testid="legacy-invite-create"
            @click="emit('create')"
          >{{ t('room.legacyInviteCreate') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
