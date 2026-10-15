<script setup>
/** 1:1 연결 화면용 상대 아바타 (이름표 없으면 기기 종류 이모지) */
import AnimalAvatar from './AnimalAvatar.vue'
import { isValidIdentity } from '../utils/identity'

defineProps({
  device: { type: Object, default: null },
  size: { type: String, default: 'md' }
})
const icon = (type) => (type === 'mobile' ? '📱' : type === 'tablet' ? '📟' : '💻')
</script>

<template>
  <AnimalAvatar v-if="device && isValidIdentity(device.identity)" :identity="device.identity" :size="size" />
  <span v-else class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-scope-private/10 text-lg shrink-0" aria-hidden="true">{{ icon(device?.deviceType) }}</span>
</template>
