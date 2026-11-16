<script setup>
/** 1:1 연결 화면용 상대 아바타 (이름표 없으면 기기 종류 아이콘) */
import AnimalAvatar from './AnimalAvatar.vue'
import DeviceTypeIcon from './icons/DeviceTypeIcon.vue'
import { isValidIdentity } from '../utils/identity'

defineProps({
  device: { type: Object, default: null },
  size: { type: String, default: 'md' }
})
</script>

<template>
  <AnimalAvatar v-if="device && isValidIdentity(device.identity)" :identity="device.identity" :size="size" />
  <span v-else class="inline-flex items-center justify-center w-10 h-10 rounded-none bg-scope-private-tint text-scope-private shrink-0" aria-hidden="true"><DeviceTypeIcon :type="device?.deviceType" /></span>
</template>
