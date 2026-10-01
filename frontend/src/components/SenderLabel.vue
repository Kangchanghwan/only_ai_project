<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { identityName, formatRelativeTime } from '../utils/identity'
import { senderState } from '../utils/sender'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const { t, locale } = useI18n()

const props = defineProps({
  /** 서버가 붙인 보낸 사람 {socketId, identity, deviceLabel, browser}. 없으면 아무것도 그리지 않는다 */
  sender: { type: Object, default: null },
  /** 업로드/공유 시각 (ISO 문자열 또는 epoch ms). 없으면 시간 생략 */
  time: { type: [String, Number], default: null }
})

// RoomScreen이 제공하는 {mySocketId, myIdentity, devices} (ref들을 담은 객체)
const ctx = inject(SENDER_CONTEXT_KEY, null)

const state = computed(() =>
  senderState(props.sender, {
    mySocketId: ctx?.mySocketId?.value,
    myIdentity: ctx?.myIdentity?.value,
    devices: ctx?.devices?.value
  })
)

const label = computed(() => {
  if (state.value === 'me') return t('identity.me')
  if (state.value === 'left') return `${identityName(props.sender.identity, t)} (${t('identity.senderLeft')})`
  return identityName(props.sender.identity, t)
})

const timeText = computed(() => {
  if (props.time === null || props.time === undefined || props.time === '') return ''
  const ts = typeof props.time === 'number' ? props.time : new Date(props.time).getTime()
  if (!Number.isFinite(ts)) return ''
  return formatRelativeTime(ts, locale?.value ?? 'en')
})
</script>

<template>
  <span
    v-if="state"
    class="inline-flex items-center gap-1 text-xs text-text-secondary min-w-0"
    :class="{ 'text-text-secondary/70': state === 'left' }"
    data-testid="sender-label"
    :data-state="state"
  >
    <span class="w-4 h-4 inline-flex shrink-0">
      <AnimalAvatar :identity="sender.identity" :gray="state === 'left'" class="w-4! h-4!" />
    </span>
    <span class="truncate">{{ label }}<template v-if="timeText"> · {{ timeText }}</template></span>
  </span>
</template>
