<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const MAX_VISIBLE = 4

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  }
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

function getDeviceLabel(device) {
  return `${device.browser} · ${device.os}`
}

const visibleDevices = computed(() => props.devices.slice(0, MAX_VISIBLE))
const overflowCount = computed(() => Math.max(props.devices.length - MAX_VISIBLE, 0))
const overflowLabel = computed(() =>
  props.devices.slice(MAX_VISIBLE).map((device) => getDeviceLabel(device)).join(', ')
)

function avatarStyle(index) {
  return { zIndex: props.devices.length - index }
}
</script>

<template>
  <div
    v-if="devices.length > 0"
    class="flex items-center"
    role="group"
    :aria-label="t('room.connectedDevices')"
  >
    <TransitionGroup name="avatar-enter" tag="div" class="flex items-center">
      <span
        v-for="(device, index) in visibleDevices"
        :key="device.socketId"
        :title="getDeviceLabel(device)"
        :style="avatarStyle(index)"
        :class="{ '-ml-2': index > 0 }"
        class="relative inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-primary/10 text-base cursor-default hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
      >
        {{ getDeviceIcon(device.deviceType) }}
      </span>
      <span
        v-if="overflowCount > 0"
        key="overflow"
        :title="overflowLabel"
        class="relative -ml-2 inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-border text-text-secondary text-xs font-semibold cursor-default hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
      >
        +{{ overflowCount }}
      </span>
    </TransitionGroup>
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
