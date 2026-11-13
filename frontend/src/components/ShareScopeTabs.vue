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
const single = computed(() => props.privateRooms.length === 1 ? props.privateRooms[0] : null)
const highlighted = computed(() => !!props.highlightRoomId && props.privateRooms.some((r) => r.roomId === props.highlightRoomId))

const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))
// 그룹 방(prv-g-…)은 같은 목록에 넣되 이름과 아이콘만 다르다
const isGroup = (room) => isGroupRoomId(room?.roomId)
const groupName = (room) => roomDisplayName(props.privateRooms, room.roomId, t('group.unnamed'))
const roomLabel = (room) => (isGroup(room) ? groupName(room) : peerName(room))
const hasPrivate = computed(() => props.privateRooms.length > 0)
const manyLabel = computed(() =>
  props.privateRooms.every(isGroup)
    ? `${t('group.createShort')} (${props.privateRooms.length})`
    : t('pair.tabMany', { n: props.privateRooms.length })
)

// 2개 이상일 때 상대 고르는 팝오버
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
</script>

<template>
  <div
    ref="root"
    class="relative flex items-center gap-1 p-1 mb-3 bg-surface rounded-full border border-border"
    role="tablist"
    :aria-label="t('shareScope.label')"
  >
    <button
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="[hasPrivate ? 'px-2 whitespace-nowrap' : 'px-4', scope === 'ip' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-background']"
      :aria-selected="scope === 'ip'"
      :title="t('shareScope.ipDescription')"
      @click="emit('select', 'ip')"
    >
      {{ t('shareScope.ip') }}
    </button>
    <button
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="[hasPrivate ? 'px-2 whitespace-nowrap' : 'px-4', scope === 'global' ? 'bg-scope-global text-white' : 'text-text-secondary hover:bg-background']"
      :aria-selected="scope === 'global'"
      :title="t('shareScope.globalDescription')"
      @click="emit('select', 'global')"
    >
      {{ t('shareScope.global') }}
    </button>

    <!-- 1:1 탭: 연결이 있을 때만 -->
    <button
      v-if="single"
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="[isGroup(single) ? 'min-w-0 overflow-hidden gap-1 px-2' : 'gap-2 px-3', privateActive ? 'bg-scope-private text-white' : 'text-scope-private hover:bg-background', highlighted ? 'pair-tab-pulse' : '']"
      :aria-selected="privateActive"
      :title="isGroup(single) ? groupName(single) : t('pair.tabTitle', { name: peerName(single) })"
      :aria-label="isGroup(single) ? groupName(single) : t('pair.tabTitle', { name: peerName(single) })"
      data-testid="private-tab"
      @click="pick(single.roomId)"
    >
      <svg v-if="isGroup(single)" class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
        <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
      </svg>
      <PairPeerAvatar v-else :device="single.peer" size="sm" />
      <span :class="isGroup(single) ? 'min-w-0 max-w-[10rem] truncate whitespace-nowrap overflow-hidden text-ellipsis' : ''" :data-testid="isGroup(single) ? 'group-tab-name' : undefined">{{ isGroup(single) ? groupName(single) : t('pair.tab') }}</span>
    </button>
    <template v-else-if="privateRooms.length > 1">
      <button
        type="button"
        role="tab"
        class="flex-1 flex items-center justify-center gap-2 px-3 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
        :class="[privateActive ? 'bg-scope-private text-white' : 'text-scope-private hover:bg-background', highlighted ? 'pair-tab-pulse' : '']"
        :aria-selected="privateActive"
        aria-haspopup="listbox"
        :aria-expanded="open"
        data-testid="private-tab"
        @click="open = !open"
      >
        {{ manyLabel }}
      </button>
      <ul
        v-if="open"
        role="listbox"
        class="absolute right-0 top-full mt-1 z-30 min-w-[12rem] bg-surface border border-border rounded-xl shadow-lg p-1 m-0 list-none"
        data-testid="private-tab-popover"
      >
        <li v-for="room in privateRooms" :key="room.roomId" role="presentation">
          <button
            type="button"
            role="option"
            class="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-sm text-left hover:bg-background"
            :class="activeRoomId === room.roomId ? 'font-semibold text-scope-private' : 'text-text-primary'"
            :aria-selected="activeRoomId === room.roomId"
            data-testid="private-tab-option"
            @click="pick(room.roomId)"
          >
            <svg v-if="isGroup(room)" class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
              <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
            </svg>
            <PairPeerAvatar v-else :device="room.peer" size="sm" />
            <span class="truncate">{{ roomLabel(room) }}</span>
          </button>
        </li>
      </ul>
    </template>

    <!-- 그룹 방 만들기 -->
    <button
      v-if="groupCreate"
      type="button"
      class="shrink-0 flex items-center justify-center gap-1 min-h-[44px] rounded-full text-sm font-semibold text-scope-private hover:bg-background transition-colors whitespace-nowrap"
      :class="hasPrivate ? 'px-2' : 'px-3'"
      :aria-label="t('group.create')"
      :title="t('group.create')"
      data-testid="group-create"
      @click="emit('group-create')"
    >
      <span aria-hidden="true">＋</span>
      <span aria-hidden="true">{{ t('group.createShort') }}</span>
    </button>
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
