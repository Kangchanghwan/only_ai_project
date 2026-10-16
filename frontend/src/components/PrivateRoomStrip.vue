<script setup>
/**
 * 1:1 탭 안내 띠 (전체 공유 경고 자리). 상대 이름 + 접속 상태 + 암호화 안내 + "⋯" 메뉴(연결 끊기).
 * 상태는 색 점만이 아니라 글자("접속 중/나갔어요")로도 알려 준다.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { isValidIdentity, identityName } from '../utils/identity'

const { t } = useI18n()
const props = defineProps({
  /** { roomId, peer, status: 'online'|'left' } */
  room: { type: Object, required: true }
})
const emit = defineEmits(['leave'])

const menuOpen = ref(false)
const confirming = ref(false)
const online = computed(() => props.room.status !== 'left')
const name = computed(() => (isValidIdentity(props.room.peer?.identity) ? identityName(props.room.peer.identity, t) : t('pair.unknownDevice')))

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  confirming.value = false
}
function askLeave() {
  confirming.value = true
}
function closeAll() {
  menuOpen.value = false
  confirming.value = false
}
function doLeave() {
  closeAll()
  emit('leave', props.room.roomId)
}
</script>

<template>
  <div
    class="mb-4 rounded-xl border border-scope-private bg-scope-private/10 p-3 text-sm text-text-primary"
    role="note"
    data-testid="private-strip"
    @keydown.esc="closeAll"
  >
    <div class="flex items-center gap-3 min-w-0">
      <PairPeerAvatar :device="room.peer" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="font-semibold truncate" data-testid="private-strip-title">{{ t('pair.stripTitle', { name }) }}</span>
          <span
            class="inline-flex items-center gap-1 text-xs"
            :class="online ? 'text-scope-private' : 'text-text-secondary'"
            data-testid="private-status"
            :data-status="online ? 'online' : 'left'"
          >
            <span class="inline-block w-2 h-2 rounded-full" :class="online ? 'bg-scope-private' : 'bg-text-secondary'" aria-hidden="true"></span>
            {{ online ? t('pair.statusOnline') : t('pair.statusLeft') }}
          </span>
        </div>
        <p class="m-0 mt-0.5 text-xs text-text-secondary leading-relaxed">🔒 {{ t('pair.stripNote') }}</p>
      </div>
      <div class="relative shrink-0">
        <button
          type="button"
          class="w-11 h-11 inline-flex items-center justify-center rounded-full text-text-secondary"
          :aria-label="t('file.moreActions')"
          :aria-expanded="menuOpen"
          data-testid="private-menu"
          @click="toggleMenu"
        >⋯</button>
        <div v-if="menuOpen && !confirming" class="absolute right-0 top-full z-20 bg-surface border border-border rounded-lg shadow-lg min-w-[8rem]">
          <button
            type="button"
            class="w-full min-h-[44px] px-4 text-left text-sm text-red-500"
            data-testid="private-leave"
            @click="askLeave"
          >{{ t('pair.leave') }}</button>
        </div>
      </div>
    </div>
    <div v-if="confirming" class="mt-3 pt-3 border-t border-scope-private/30" role="alertdialog" :aria-label="t('pair.leaveConfirmTitle')" data-testid="private-leave-confirm">
      <p class="m-0 text-sm font-semibold">{{ t('pair.leaveConfirmTitle') }}</p>
      <p class="m-0 mt-1 text-xs text-text-secondary leading-relaxed">{{ t('pair.leaveConfirmBody') }}</p>
      <div class="mt-2 flex gap-2 justify-end">
        <button type="button" class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold" data-testid="private-leave-cancel" @click="closeAll">{{ t('notification.cancel') }}</button>
        <button type="button" class="min-h-[44px] px-4 rounded-full bg-red-500 text-white text-sm font-semibold" data-testid="private-leave-ok" @click="doLeave">{{ t('pair.leave') }}</button>
      </div>
    </div>
  </div>
</template>
