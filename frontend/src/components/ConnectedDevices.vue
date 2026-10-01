<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { trackEvent } from '../utils/analytics'
import {
  isValidIdentity,
  sameIdentity,
  identityName,
  deviceAndBrowser,
  formatRelativeTime
} from '../utils/identity'

const { t, locale } = useI18n()

const MAX_VISIBLE = 4

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  },
  /** 내 소켓 ID / 내 정체성 (있으면 목록 맨 위에 "나" 배지) */
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  /** 'ip'(같은 네트워크) | 'global'(전체 공유) — 확인 안내 문구 선택용 */
  scope: { type: String, default: 'ip' }
})

const isOpen = ref(false)
const root = ref(null)

function isMe(device) {
  return (!!props.mySocketId && device.socketId === props.mySocketId) ||
    (isValidIdentity(device.identity) && sameIdentity(device.identity, props.myIdentity))
}

/** 내 기기를 맨 위로, 나머지는 접속 순서 */
const sortedDevices = computed(() => {
  const list = [...props.devices]
  return list.sort((a, b) => {
    const am = isMe(a) ? 0 : 1
    const bm = isMe(b) ? 0 : 1
    if (am !== bm) return am - bm
    return (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  })
})

function getDeviceIcon(deviceType) {
  switch (deviceType) {
    case 'mobile':
      return '📱'
    case 'tablet':
      return '📟'
    default:
      return '💻'
  }
}

/** 구버전 백엔드(identity 없음)는 기존처럼 "브라우저 · OS" */
function legacyLabel(device) {
  return `${device.browser} · ${device.os}`
}

function deviceTitle(device) {
  return isValidIdentity(device.identity)
    ? `${identityName(device.identity, t)} · ${deviceAndBrowser(device, t)}`
    : legacyLabel(device)
}

const visibleDevices = computed(() => sortedDevices.value.slice(0, MAX_VISIBLE))
const overflowCount = computed(() => Math.max(props.devices.length - MAX_VISIBLE, 0))
const overflowLabel = computed(() =>
  sortedDevices.value.slice(MAX_VISIBLE).map((device) => deviceTitle(device)).join(', ')
)

function avatarStyle(index) {
  return { zIndex: props.devices.length - index }
}

function joinedText(device) {
  if (!device.joinedAt) return ''
  return t('identity.joinedAgo', { time: formatRelativeTime(device.joinedAt, locale?.value ?? 'en') })
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) trackEvent('device_list_open', { scope: props.scope })
}

function close() {
  isOpen.value = false
}

function onDocumentPointerDown(event) {
  if (root.value && !root.value.contains(event.target)) close()
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    v-if="devices.length > 0"
    ref="root"
    class="relative flex items-center"
    role="group"
    :aria-label="t('room.connectedDevices')"
  >
    <button
      type="button"
      class="flex items-center rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      :aria-label="t('identity.openList')"
      data-testid="devices-trigger"
      @click="toggle"
    >
      <TransitionGroup name="avatar-enter" tag="div" class="flex items-center">
        <span
          v-for="(device, index) in visibleDevices"
          :key="device.socketId"
          :title="deviceTitle(device)"
          :aria-label="deviceTitle(device)"
          :style="avatarStyle(index)"
          :class="{ '-ml-2': index > 0 }"
          class="relative inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-primary/10 text-base hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
        >
          <AnimalAvatar v-if="isValidIdentity(device.identity)" :identity="device.identity" />
          <template v-else>{{ getDeviceIcon(device.deviceType) }}</template>
        </span>
        <span
          v-if="overflowCount > 0"
          key="overflow"
          :title="overflowLabel"
          :aria-label="overflowLabel"
          class="relative -ml-2 inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-border text-text-secondary text-xs font-semibold hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
        >
          +{{ overflowCount }}
        </span>
      </TransitionGroup>
    </button>

    <!-- 기기 목록: 데스크톱은 말풍선, 모바일은 하단 시트 -->
    <template v-if="isOpen">
      <div class="fixed inset-0 z-40 bg-black/30 sm:hidden" aria-hidden="true" @click="close"></div>
      <div
        role="dialog"
        :aria-label="t('identity.listTitle', { count: devices.length })"
        class="z-50 bg-surface border border-border shadow-lg text-text-primary fixed inset-x-0 bottom-0 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-xl sm:max-h-96"
        data-testid="devices-popover"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold">{{ t('identity.listTitle', { count: devices.length }) }}</h3>
          <button
            type="button"
            class="text-xs text-text-secondary hover:text-text-primary px-2 py-1"
            @click="close"
          >
            {{ t('identity.closeList') }}
          </button>
        </div>

        <ul class="flex flex-col gap-2">
          <li
            v-for="device in sortedDevices"
            :key="device.socketId"
            class="flex items-center gap-3"
            data-testid="device-row"
          >
            <AnimalAvatar v-if="isValidIdentity(device.identity)" :identity="device.identity" size="md" />
            <span
              v-else
              class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-lg shrink-0"
            >{{ getDeviceIcon(device.deviceType) }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold truncate">
                  {{ isValidIdentity(device.identity) ? identityName(device.identity, t) : legacyLabel(device) }}
                </span>
                <span
                  v-if="isMe(device)"
                  class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-white shrink-0"
                  data-testid="me-badge"
                >{{ t('identity.me') }}</span>
              </div>
              <div v-if="isValidIdentity(device.identity)" class="text-xs text-text-secondary truncate">
                {{ deviceAndBrowser(device, t) }}
              </div>
              <div v-if="joinedText(device)" class="text-xs text-text-secondary">
                {{ joinedText(device) }}
              </div>
            </div>
          </li>
        </ul>

        <p class="mt-3 text-xs text-text-secondary">
          {{ scope === 'global' ? t('identity.globalNotice') : t('identity.verifyHint') }}
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.avatar-enter-enter-active {
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}

.avatar-enter-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.avatar-enter-leave-active {
  transition: opacity 150ms ease-in;
  position: absolute;
}

.avatar-enter-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .avatar-enter-enter-active,
  .avatar-enter-leave-active {
    transition: none;
  }
}
</style>
