<script setup>
/**
 * 방 탭 안내 띠 (전체 공유 경고 자리). 방 이름(예전 방은 상대 이름) + 접속 상태 + 암호화 안내 + "⋯" 메뉴(연결 끊기).
 * 상태는 색 점만이 아니라 글자("접속 중/나갔어요")로도 알려 준다.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { isValidIdentity, identityName } from '../utils/identity'
import { isGroupRoomId } from '../utils/groupRoom'

const { t } = useI18n()
const props = defineProps({
  /** { roomId, peer, status: 'online'|'offline'|'connecting'|'left' } */
  room: { type: Object, required: true },
  /** 같은 이름 방이 여럿일 때 번호가 붙은 표시 이름(없으면 room.name) */
  displayName: { type: String, default: '' },
  /** 그룹 방: 지금 방에 있는 기기 수(나 포함). 모르면 null */
  memberCount: { type: Number, default: null },
  /** 지금 방에 있는 다른 기기들(나 제외). 상태 줄 이름과 아바타에 쓴다 */
  others: { type: Array, default: () => [] }
})
const emit = defineEmits(['leave', 'invite'])

const isGroup = computed(() => isGroupRoomId(props.room.roomId))
const groupTitle = computed(() => props.displayName || props.room.name || t('group.unnamed'))
const otherNames = computed(() =>
  props.others.filter((d) => isValidIdentity(d?.identity)).slice(0, 2).map((d) => identityName(d.identity, t))
)
// 다른 기기가 0대면 "아직 나만 있어요", 1대 이상이면 "기기 N대 · 이름 · 이름" (N은 나 포함)
const hasOthers = computed(() => (props.memberCount != null && props.memberCount > 1) || props.others.length > 0)
const groupStatus = computed(() => {
  if (!hasOthers.value) return t('group.alone')
  const n = props.memberCount != null ? props.memberCount : props.others.length + 1
  return [t('group.members', { n }), ...otherNames.value].join(' · ')
})
const avatarDevices = computed(() => props.others.slice(0, 3))

const menuOpen = ref(false)
const confirming = ref(false)
const status = computed(() => (['online', 'offline', 'connecting', 'left'].includes(props.room.status) ? props.room.status : 'online'))
const STATUS_TEXT = { online: 'pair.statusOnline', offline: 'pair.statusOffline', connecting: 'pair.statusConnecting', left: 'pair.statusLeft' }
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
      <span v-if="isGroup && avatarDevices.length > 0" class="inline-flex items-center shrink-0 -space-x-3" data-testid="group-avatars" aria-hidden="true">
        <PairPeerAvatar v-for="(d, i) in avatarDevices" :key="d.socketId || i" :device="d" />
      </span>
      <span v-else-if="isGroup" class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-scope-private/10 text-scope-private shrink-0" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
        </svg>
      </span>
      <PairPeerAvatar v-else :device="room.peer" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="font-semibold truncate" data-testid="private-strip-title">{{ isGroup ? groupTitle : t('pair.stripTitle', { name }) }}</span>
          <span
            v-if="isGroup"
            class="inline-flex items-center gap-1 text-xs"
            :class="hasOthers ? 'text-scope-private' : 'text-text-secondary'"
            data-testid="group-members"
          >{{ groupStatus }}</span>
          <span
            v-else
            class="inline-flex items-center gap-1 text-xs"
            :class="status === 'online' ? 'text-scope-private' : 'text-text-secondary'"
            data-testid="private-status"
            :data-status="status"
          >
            <span
              class="inline-block w-2 h-2 rounded-full"
              :class="[status === 'online' ? 'bg-scope-private' : status === 'connecting' ? 'bg-text-secondary animate-pulse' : status === 'offline' ? 'border border-text-secondary' : 'bg-text-secondary']"
              data-testid="private-status-dot"
              aria-hidden="true"
            ></span>
            {{ t(STATUS_TEXT[status]) }}
          </span>
        </div>
        <p class="m-0 mt-0.5 text-xs text-text-secondary leading-relaxed">🔒 {{ isGroup ? t('group.joinBody') : t('pair.stripNote') }}</p>
      </div>
      <button
        type="button"
        class="shrink-0 min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold"
        data-testid="group-invite"
        @click="emit('invite', room.roomId)"
      >{{ t('group.invite') }}</button>
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
          >{{ isGroup ? t('group.leave') : t('pair.leave') }}</button>
        </div>
      </div>
    </div>
    <div v-if="confirming" class="mt-3 pt-3 border-t border-scope-private/30" role="alertdialog" :aria-label="isGroup ? t('group.leave') : t('pair.leaveConfirmTitle')" data-testid="private-leave-confirm">
      <p class="m-0 text-sm font-semibold">{{ isGroup ? t('group.leave') : t('pair.leaveConfirmTitle') }}</p>
      <p class="m-0 mt-1 text-xs text-text-secondary leading-relaxed">{{ isGroup ? t('group.leaveConfirm') : t('pair.leaveConfirmBody') }}</p>
      <div class="mt-2 flex gap-2 justify-end">
        <button type="button" class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold" data-testid="private-leave-cancel" @click="closeAll">{{ t('notification.cancel') }}</button>
        <button type="button" class="min-h-[44px] px-4 rounded-full bg-red-500 text-white text-sm font-semibold" data-testid="private-leave-ok" @click="doLeave">{{ isGroup ? t('group.leave') : t('pair.leave') }}</button>
      </div>
    </div>
  </div>
</template>
