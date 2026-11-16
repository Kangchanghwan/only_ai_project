<script setup>
import { roomDisplayName } from '../utils/roomDisplayName'
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
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

const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))
// 그룹 방(prv-g-…)은 같은 목록에 넣되 이름과 아이콘만 다르다
const isGroup = (room) => isGroupRoomId(room?.roomId)
const roomLabel = (room) => roomDisplayName(props.privateRooms, room.roomId, t('group.unnamed'), peerName)

const bar = ref(null)
/** 지금 고른 탭이 가로 스크롤 밖에 있으면 보이는 자리로 */
async function revealActive() {
  await nextTick()
  const el = bar.value?.querySelector('[aria-selected="true"]')
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
onMounted(revealActive)
watch(() => [props.scope, props.privateRooms.length], revealActive)

const TAB = 'shrink-0 min-h-[44px] max-w-[15rem] inline-flex items-center gap-2 px-3 rounded-none bg-transparent border-0 border-b-2 whitespace-nowrap text-sm hover:bg-tint cursor-pointer'
const tabClass = (active) => [TAB, active ? 'text-ink font-extrabold border-ink' : 'text-text-secondary font-semibold border-transparent']
</script>

<template>
  <div class="flex items-stretch min-w-0 w-full" data-testid="scope-tabs">
    <div
      ref="bar"
      role="tablist"
      :aria-label="t('shareScope.label')"
      class="flex flex-nowrap min-w-0 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="room-tablist"
    >
      <button
        type="button"
        role="tab"
        :class="tabClass(scope === 'ip')"
        :aria-selected="scope === 'ip'"
        :title="t('shareScope.ipDescription')"
        data-testid="scope-option-ip"
        @click="emit('select', 'ip')"
      ><span class="truncate">{{ t('shareScope.ip') }}</span></button>
      <button
        type="button"
        role="tab"
        :class="tabClass(scope === 'global')"
        :aria-selected="scope === 'global'"
        :title="t('shareScope.globalDescription')"
        data-testid="scope-option-global"
        @click="emit('select', 'global')"
      >
        <span class="shrink-0 w-2 h-2 bg-scope-global" aria-hidden="true" data-testid="scope-mark-global"></span>
        <span class="truncate">{{ t('shareScope.global') }}</span>
      </button>
      <button
        v-for="room in privateRooms"
        :key="room.roomId"
        type="button"
        role="tab"
        :class="tabClass(activeRoomId === room.roomId)"
        :aria-selected="activeRoomId === room.roomId"
        :title="roomLabel(room)"
        data-testid="private-tab-option"
        @click="emit('select', scopeForPrivateRoom(room.roomId))"
      >
        <span v-if="!isGroup(room)" class="shrink-0 w-2 h-2 bg-scope-private" aria-hidden="true" data-testid="scope-mark-private"></span>
        <svg v-if="isGroup(room)" class="shrink-0 text-scope-private" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
          <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
        </svg>
        <PairPeerAvatar v-else :device="room.peer" size="sm" />
        <span class="truncate" :data-testid="isGroup(room) ? 'group-tab-name' : undefined">{{ roomLabel(room) }}</span>
        <span v-if="highlightRoomId === room.roomId" class="shrink-0 w-2 h-2 rounded-full bg-scope-private" data-testid="tab-highlight" aria-hidden="true"></span>
      </button>
    </div>
    <button
      v-if="groupCreate"
      type="button"
      class="shrink-0 min-h-[44px] inline-flex items-center gap-1 px-3 rounded-none bg-transparent border-0 text-sm font-semibold text-text-primary hover:bg-tint cursor-pointer whitespace-nowrap"
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
