<script setup>
import { roomDisplayName } from '../utils/roomDisplayName'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { isPrivateScope, privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
import { isValidIdentity, identityName } from '../utils/identity'
import { isGroupRoomId } from '../utils/groupRoom'

const { t } = useI18n()

const props = defineProps({
  scope: {
    type: String,
    default: 'ip'
  },
  /** 1:1 비공개 방 목록 [{roomId, peer}]. 비어 있으면 기존 2탭 그대로 */
  privateRooms: {
    type: Array,
    default: () => []
  },
  /** 방금 연결된 방 id: 해당 탭을 한 번 강조한다 */
  highlightRoomId: {
    type: String,
    default: null
  },
  /** 탭 줄 끝에 "＋ 방"(그룹 방 만들기) 버튼을 보인다 */
  groupCreate: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'group-create'])

const activeRoomId = computed(() => privateRoomIdOfScope(props.scope))
const privateActive = computed(() => isPrivateScope(props.scope))
const highlighted = computed(() => !!props.highlightRoomId && props.privateRooms.some((r) => r.roomId === props.highlightRoomId))

const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))
// 그룹 방(prv-g-…)은 같은 목록에 넣되 이름과 아이콘만 다르다
const isGroup = (room) => isGroupRoomId(room?.roomId)
const groupName = (room) => roomDisplayName(props.privateRooms, room.roomId, t('group.unnamed'), peerName)
const roomLabel = (room) => roomDisplayName(props.privateRooms, room.roomId, t('group.unnamed'), peerName)
const currentRoom = computed(() => props.privateRooms.find((r) => r.roomId === activeRoomId.value) || null)
const currentLabel = computed(() => {
  if (props.scope === 'global') return t('shareScope.global')
  if (privateActive.value && currentRoom.value) return roomLabel(currentRoom.value)
  return t('shareScope.ip')
})

// 방 선택 드롭다운
const open = ref(false)
const root = ref(null)
const onPointerDown = (e) => { if (root.value && !root.value.contains(e.target)) open.value = false }
const onKey = (e) => { if (e.key === 'Escape') open.value = false }
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKey)
})

function pick(roomId) {
  open.value = false
  emit('select', scopeForPrivateRoom(roomId))
}
function pickScope(value) {
  open.value = false
  emit('select', value)
}
function createGroup() {
  open.value = false
  emit('group-create')
}
</script>

<template>
  <div ref="root" class="relative min-w-0">
    <button
      type="button"
      class="min-h-[44px] max-w-full inline-flex items-center gap-2 px-3 rounded-none border-2 border-ink bg-transparent text-ink font-extrabold text-sm hover:bg-tint"
      :class="highlighted ? 'pair-tab-pulse' : ''"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="`${t('shareScope.label')}: ${currentLabel}`"
      data-testid="scope-trigger"
      @click="open = !open"
    >
      <template v-if="privateActive && currentRoom">
        <svg v-if="isGroup(currentRoom)" class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
              <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
            </svg>
            <PairPeerAvatar v-else :device="currentRoom.peer" size="sm" />
      </template>
      <span class="min-w-0 truncate" data-testid="scope-current">{{ currentLabel }}</span>
      <svg class="w-4 h-4 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <ul
      v-if="open"
      role="listbox"
      :aria-label="t('shareScope.label')"
      class="absolute left-0 top-full mt-1 z-30 min-w-[14rem] max-w-[calc(100vw-2rem)] bg-surface border-2 border-ink rounded-none p-0 m-0 list-none"
      data-testid="scope-menu"
    >
      <li role="presentation">
        <button
          type="button"
          role="option"
          class="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-left hover:bg-tint rounded-none"
          :class="scope === 'ip' ? 'bg-ink text-on-ink font-extrabold' : 'text-text-primary'"
          :aria-selected="scope === 'ip'"
          :title="t('shareScope.ipDescription')"
          data-testid="scope-option-ip"
          @click="pickScope('ip')"
        >{{ t('shareScope.ip') }}</button>
      </li>
      <li role="presentation">
        <button
          type="button"
          role="option"
          class="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-left hover:bg-tint rounded-none"
          :class="scope === 'global' ? 'bg-ink text-on-ink font-extrabold' : 'text-text-primary'"
          :aria-selected="scope === 'global'"
          :title="t('shareScope.globalDescription')"
          data-testid="scope-option-global"
          @click="pickScope('global')"
        >{{ t('shareScope.global') }}</button>
      </li>
      <li v-for="room in privateRooms" :key="room.roomId" role="presentation">
        <button
          type="button"
          role="option"
          class="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-left hover:bg-tint rounded-none"
          :class="activeRoomId === room.roomId ? 'bg-ink text-on-ink font-extrabold' : 'text-text-primary'"
          :aria-selected="activeRoomId === room.roomId"
          data-testid="private-tab-option"
          @click="pick(room.roomId)"
        >
          <svg v-if="isGroup(room)" class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
              <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
            </svg>
            <PairPeerAvatar v-else :device="room.peer" size="sm" />
          <span class="truncate" :data-testid="isGroup(room) ? 'group-tab-name' : undefined">{{ roomLabel(room) }}</span>
        </button>
      </li>
      <li v-if="groupCreate" role="presentation" class="border-t border-border">
        <button
          type="button"
          class="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-left hover:bg-tint rounded-none font-semibold text-text-primary"
          :aria-label="t('group.create')"
          :title="t('group.create')"
          data-testid="group-create"
          @click="createGroup"
        >
          <span aria-hidden="true">＋</span>
          <span aria-hidden="true">{{ t('group.createShort') }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 연결 직후 1:1 탭을 한 번 강조 (모션 줄이기 설정이면 생략) */
@media (prefers-reduced-motion: no-preference) {
  .pair-tab-pulse {
    animation: pair-tab-pulse 1.2s ease-out 2;
  }
}
@keyframes pair-tab-pulse {
  0% { box-shadow: 0 0 0 0 var(--color-scope-private); }
  100% { box-shadow: 0 0 0 10px transparent; }
}
</style>
