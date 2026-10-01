<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import DeviceList from './DeviceList.vue'
import { trackEvent } from '../utils/analytics'
import { isValidIdentity, identityName, deviceAndBrowser } from '../utils/identity'
import { isMeDevice, sortDevices } from '../utils/devices'

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
  scope: { type: String, default: 'ip' },
  rerollAvailableAt: { type: Number, default: 0 }
})

const emit = defineEmits(['reroll'])

const isOpen = ref(false)
const root = ref(null)

const sortedDevices = computed(() => sortDevices(props.devices, props.mySocketId, props.myIdentity))

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
      class="flex items-center justify-center rounded-full cursor-pointer min-h-[44px] min-w-[44px] px-1 focus-visible:outline-2 focus-visible:outline-primary"
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
            class="text-xs text-text-secondary hover:text-text-primary px-3 min-h-[44px]"
            @click="close"
          >
            {{ t('identity.closeList') }}
          </button>
        </div>

        <DeviceList
          :devices="devices"
          :my-socket-id="mySocketId"
          :my-identity="myIdentity"
          :scope="scope"
          :reroll-available-at="rerollAvailableAt"
          @reroll="emit('reroll')"
        />
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
