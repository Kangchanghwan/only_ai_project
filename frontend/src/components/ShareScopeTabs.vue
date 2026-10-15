<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { isPrivateScope, privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
import { isValidIdentity, identityName } from '../utils/identity'

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
  }
})

const emit = defineEmits(['select'])

const activeRoomId = computed(() => privateRoomIdOfScope(props.scope))
const privateActive = computed(() => isPrivateScope(props.scope))
const single = computed(() => props.privateRooms.length === 1 ? props.privateRooms[0] : null)
const highlighted = computed(() => !!props.highlightRoomId && props.privateRooms.some((r) => r.roomId === props.highlightRoomId))

const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))

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
      class="flex-1 flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="scope === 'ip' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-background'"
      :aria-selected="scope === 'ip'"
      :title="t('shareScope.ipDescription')"
      @click="emit('select', 'ip')"
    >
      {{ t('shareScope.ip') }}
    </button>
    <button
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="scope === 'global' ? 'bg-scope-global text-white' : 'text-text-secondary hover:bg-background'"
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
      class="flex-1 flex items-center justify-center gap-2 px-3 min-h-[44px] rounded-full text-sm font-semibold transition-colors"
      :class="[privateActive ? 'bg-scope-private text-white' : 'text-scope-private hover:bg-background', highlighted ? 'pair-tab-pulse' : '']"
      :aria-selected="privateActive"
      :title="t('pair.tabTitle', { name: peerName(single) })"
      :aria-label="t('pair.tabTitle', { name: peerName(single) })"
      data-testid="private-tab"
      @click="pick(single.roomId)"
    >
      <PairPeerAvatar :device="single.peer" size="sm" />
      <span>{{ t('pair.tab') }}</span>
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
        {{ t('pair.tabMany', { n: privateRooms.length }) }}
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
            <PairPeerAvatar :device="room.peer" size="sm" />
            <span class="truncate">{{ peerName(room) }}</span>
          </button>
        </li>
      </ul>
    </template>
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
