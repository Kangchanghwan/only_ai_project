<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
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
</script>

<template>
  <div v-if="devices.length > 0" class="flex items-center gap-2 text-sm text-text-secondary">
    <span>{{ t('room.connectedDevices') }}</span>
    <div class="flex items-center gap-1">
      <span
        v-for="device in devices"
        :key="device.socketId"
        :title="getDeviceLabel(device)"
        class="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-base cursor-default hover:bg-primary/20 transition-colors"
      >
        {{ getDeviceIcon(device.deviceType) }}
      </span>
    </div>
  </div>
</template>
