<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'
import { scopeForPrivateRoom } from '../composables/useShareScope'
import { roomDisplayName } from '../utils/roomDisplayName'
import { isValidIdentity, identityName } from '../utils/identity'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  fileCount: {
    type: Number,
    default: 0
  },
  hasText: {
    type: Boolean,
    default: false
  },
  /** 내가 들어가 있는 1:1·그룹 방 [{roomId, peer, name, status}]. 나간 방은 빼고 보인다 */
  privateRooms: {
    type: Array,
    default: () => []
  },
  /** 시트를 열 때 미리 골라 둘 범위 (지금 보던 탭). 없으면 ip */
  initialScope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const { t } = useI18n()

const localScope = ref('ip')

const rooms = computed(() => props.privateRooms.filter((r) => r && r.status !== 'left'))
const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))
const roomLabel = (room) => roomDisplayName(rooms.value, room.roomId, t('group.unnamed'), peerName)
const roomScope = (room) => scopeForPrivateRoom(room.roomId)
const isRoomScope = (s) => rooms.value.some((r) => roomScope(r) === s)

// 시트가 열릴 때마다 지금 보던 방(1:1·그룹)이면 그 방을, 아니면 안전한 기본값(ip)을 고른다.
// 전체 공유는 공개 범위라 미리 고르지 않는다.
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    localScope.value = isRoomScope(props.initialScope) ? props.initialScope : 'ip'
  }
}, { immediate: true })

const {
  border: ipBorder,
  bgSoft10: ipBgSoft10,
  bg: ipBg
} = useScopeAccent(() => 'ip')

const {
  border: globalBorder,
  bgSoft10: globalBgSoft10,
  bg: globalBg
} = useScopeAccent(() => 'global')

const {
  border: prvBorder,
  bgSoft10: prvBgSoft10,
  bg: prvBg
} = useScopeAccent(() => 'prv:x')

const confirmBg = computed(() => {
  if (localScope.value === 'global') return globalBg.value
  if (localScope.value === 'ip') return ipBg.value
  return prvBg.value
})

const title = computed(() => {
  if (props.fileCount > 0 && props.hasText) {
    return t('shareTargetConfirm.titleFilesAndText', { count: props.fileCount })
  }
  if (props.fileCount > 0) {
    return t('shareTargetConfirm.titleFiles', { count: props.fileCount })
  }
  return t('shareTargetConfirm.titleText')
})

function handleConfirm() {
  emit('confirm', localScope.value)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="isOpen"
        class="share-confirm-sheet fixed inset-0 bg-black/70 z-50 flex items-end"
        @click="handleCancel"
      >
        <div
          class="w-full bg-surface rounded-none p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          @click.stop
        >
          <div class="mx-auto mb-3 h-1 w-8 rounded-none bg-border"></div>
          <p class="mb-3 text-sm font-semibold text-text-primary">{{ title }}</p>

          <div class="mb-4 space-y-2 max-h-[50vh] overflow-y-auto">
            <button
              type="button"
              class="w-full min-h-[44px] rounded-none border px-3 py-2.5 text-left transition-colors"
              :class="localScope === 'ip' ? [ipBorder, ipBgSoft10] : 'border-border'"
              @click="localScope = 'ip'"
            >
              <span class="block text-sm font-medium text-text-primary">{{ t('shareScope.ip') }}</span>
              <span class="block text-xs text-text-secondary">{{ t('shareScope.ipDescription') }}</span>
            </button>
            <button
              type="button"
              class="w-full min-h-[44px] rounded-none border px-3 py-2.5 text-left transition-colors"
              :class="localScope === 'global' ? [globalBorder, globalBgSoft10] : 'border-border'"
              @click="localScope = 'global'"
            >
              <span class="block text-sm font-medium text-text-primary">{{ t('shareScope.global') }}</span>
              <span class="block text-xs text-text-secondary">{{ t('shareScope.globalDescription') }}</span>
            </button>
            <button
              v-for="room in rooms"
              :key="room.roomId"
              type="button"
              class="share-room-option w-full min-h-[44px] rounded-none border px-3 py-2.5 text-left transition-colors"
              :class="localScope === roomScope(room) ? [prvBorder, prvBgSoft10] : 'border-border'"
              :data-room-id="room.roomId"
              @click="localScope = roomScope(room)"
            >
              <span class="block text-sm font-medium text-text-primary">{{ roomLabel(room) }}</span>
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 min-h-[44px] rounded-none border-2 border-ink bg-surface py-2.5 text-sm font-bold text-ink"
              @click="handleCancel"
            >
              {{ t('shareTargetConfirm.cancel') }}
            </button>
            <button
              type="button"
              class="flex-1 min-h-[44px] rounded-none py-2.5 text-sm font-semibold text-on-accent"
              :class="confirmBg"
              @click="handleConfirm"
            >
              {{ t('shareTargetConfirm.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-active > div,
.sheet-leave-active > div {
  transition: transform 0.2s ease;
}

.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(100%);
}
</style>
