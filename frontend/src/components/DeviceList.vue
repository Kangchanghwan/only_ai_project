<script setup>
/**
 * 연결된 기기 목록 (표시 전용). 상단 시트/말풍선(ConnectedDevices)과 넓은 화면 왼쪽 패널(ConnectionCard)이
 * 같은 컴포넌트를 쓴다. 데이터는 부모가 내려주는 devices 하나뿐이다.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { isValidIdentity, identityName, deviceAndBrowser, formatRelativeTime } from '../utils/identity'
import { isMeDevice, sortDevices } from '../utils/devices'

const { t, locale } = useI18n()

const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  /** 'ip'(같은 네트워크) | 'global'(전체 공유) — 안내 문구 선택용 */
  scope: { type: String, default: 'ip' }
})

const sorted = computed(() => sortDevices(props.devices, props.mySocketId, props.myIdentity))
const isMe = (d) => isMeDevice(d, props.mySocketId, props.myIdentity)

function icon(deviceType) {
  if (deviceType === 'mobile') return '📱'
  if (deviceType === 'tablet') return '📟'
  return '💻'
}
const legacyLabel = (d) => `${d.browser} · ${d.os}`
function joinedText(d) {
  if (!d.joinedAt) return ''
  return t('identity.joinedAgo', { time: formatRelativeTime(d.joinedAt, locale?.value ?? 'en') })
}
</script>

<template>
  <div data-testid="device-list">
    <ul class="flex flex-col gap-2">
      <li v-for="device in sorted" :key="device.socketId" class="flex items-center gap-3 min-w-0" data-testid="device-row">
        <AnimalAvatar v-if="isValidIdentity(device.identity)" :identity="device.identity" size="md" />
        <span v-else class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-lg shrink-0">{{ icon(device.deviceType) }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-semibold truncate">
              {{ isValidIdentity(device.identity) ? identityName(device.identity, t) : legacyLabel(device) }}
            </span>
            <span v-if="isMe(device)" class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-white shrink-0" data-testid="me-badge">{{ t('identity.me') }}</span>
          </div>
          <div v-if="isValidIdentity(device.identity)" class="text-xs text-text-secondary truncate">{{ deviceAndBrowser(device, t) }}</div>
          <div v-if="joinedText(device)" class="text-xs text-text-secondary">{{ joinedText(device) }}</div>
        </div>
      </li>
    </ul>
    <!-- 동물+닉네임 함께 확인하라는 안내는 목록에만 둔다 -->
    <p class="mt-3 text-xs text-text-secondary leading-relaxed" data-testid="device-list-note">
      {{ scope === 'global' ? t('identity.globalNotice') : t('identity.verifyHint') }}
      <template v-if="scope !== 'global'"><br />{{ t('identity.ipNotice') }}</template>
    </p>
  </div>
</template>
