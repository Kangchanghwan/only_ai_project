<script setup>
/**
 * 연결된 기기 목록 (표시 전용). 상단 시트/말풍선(ConnectedDevices)과 넓은 화면 왼쪽 패널(ConnectionCard)이
 * 같은 컴포넌트를 쓴다. 데이터는 부모가 내려주는 devices 하나뿐이다.
 */
import { computed, ref, watch, inject, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { isValidIdentity, identityName, deviceAndBrowser, formatRelativeTime } from '../utils/identity'
import { isMeDevice, sortDevices } from '../utils/devices'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { isPrivateScope } from '../composables/useShareScope'

const { t, locale } = useI18n()

const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  /** 'ip'(같은 네트워크) | 'global'(전체 공유) — 안내 문구 선택용 */
  scope: { type: String, default: 'ip' },
  /** 다시 뽑기를 다시 쓸 수 있게 되는 시각(epoch ms). 쿨다운 동안 버튼 비활성 */
  rerollAvailableAt: { type: Number, default: 0 },
  /** 넓은 화면 왼쪽 패널이면 true: 1:1 버튼을 짧은 "1:1"로, 아니면 "1:1 연결"로 표시 */
  wide: { type: Boolean, default: false }
})

const emit = defineEmits(['reroll'])

// 쿨다운 표시: 남은 시간 동안만 다시 뽑기 버튼을 막는다
const now = ref(Date.now())
let timer = null
const cooling = computed(() => now.value < props.rerollAvailableAt)
watch(
  () => props.rerollAvailableAt,
  (until) => {
    clearInterval(timer)
    now.value = Date.now()
    if (until > now.value) {
      timer = setInterval(() => {
        now.value = Date.now()
        if (now.value >= until) clearInterval(timer)
      }, 250)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => clearInterval(timer))

// 1:1 연결 (RoomScreen이 제공. 없으면 버튼을 그리지 않는다)
const pair = inject(PAIR_CONTEXT_KEY, null)
const pairStateOf = (d) => pair?.states?.value?.[d.socketId] || null
const pairName = (d) => (isValidIdentity(d.identity) ? identityName(d.identity, t) : legacyLabel(d))
const hasPending = computed(() => !!pair && props.devices.some((d) => pairStateOf(d)?.state === 'pending'))
const tick = ref(Date.now())
let pairTimer = null
watch(hasPending, (on) => {
  clearInterval(pairTimer)
  if (on) {
    tick.value = Date.now()
    pairTimer = setInterval(() => { tick.value = Date.now() }, 1000)
  }
}, { immediate: true })
onBeforeUnmount(() => clearInterval(pairTimer))
function pendingSeconds(st) {
  if (!st?.expiresAt) return null
  return Math.max(0, Math.ceil((st.expiresAt - tick.value) / 1000))
}

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
          <div
            v-if="pair && pairStateOf(device)?.state === 'pending'"
            class="text-xs font-semibold text-scope-private"
            role="status"
            data-testid="pair-pending-text"
          >
            {{ t('pair.pending') }}<template v-if="pendingSeconds(pairStateOf(device)) !== null"> · {{ t('pair.pendingSeconds', { n: pendingSeconds(pairStateOf(device)) }) }}</template>
          </div>
          <div v-else-if="joinedText(device)" class="text-xs text-text-secondary">{{ joinedText(device) }}</div>
        </div>
        <template v-if="pair && !isMe(device)">
          <button
            v-if="pairStateOf(device)?.state === 'pending'"
            type="button"
            class="shrink-0 -my-2 min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-border text-text-primary disabled:opacity-50"
            :disabled="!pairStateOf(device).sessionId"
            data-testid="pair-cancel-button"
            @click="pair.cancel(pairStateOf(device).sessionId)"
          >{{ t('pair.cancel') }}</button>
          <button
            v-else-if="pairStateOf(device)?.state === 'connecting'"
            type="button"
            class="shrink-0 -my-2 min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-border text-text-secondary"
            disabled
            data-testid="pair-connecting-button"
          >{{ t('pair.connecting') }}</button>
          <button
            v-else-if="pairStateOf(device)?.state === 'paired'"
            type="button"
            class="shrink-0 -my-2 min-h-[44px] px-3 text-xs font-semibold rounded-lg bg-scope-private text-white"
            :aria-label="t('pair.openRoom', { name: pairName(device) })"
            data-testid="pair-open-button"
            @click="pair.open(pairStateOf(device).roomId)"
          >{{ t('pair.paired') }}</button>
          <button
            v-else
            type="button"
            class="shrink-0 -my-2 min-h-[44px] min-w-[44px] px-3 text-xs font-semibold rounded-lg border border-scope-private text-scope-private"
            :title="t('pair.openWith', { name: pairName(device) })"
            :aria-label="t('pair.openWith', { name: pairName(device) })"
            data-testid="pair-invite-button"
            @click="pair.invite(device)"
          >{{ wide ? t('pair.buttonShort') : t('pair.button') }}</button>
        </template>
        <button
          v-if="isMe(device) && isValidIdentity(device.identity)"
          type="button"
          class="shrink-0 -my-2 inline-flex items-center justify-center w-11 h-11 text-base text-text-primary rounded-lg border border-border disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="cooling"
          :title="t('identity.rerollTitle')"
          :aria-label="t('identity.rerollTitle')"
          data-testid="reroll-button"
          @click="emit('reroll')"
        >
          <span aria-hidden="true">🎲</span>
          <span class="sr-only">{{ t('identity.reroll') }}</span>
        </button>
      </li>
    </ul>
    <!-- 동물+닉네임 함께 확인하라는 안내는 목록에만 둔다 -->
    <p v-if="!isPrivateScope(scope)" class="mt-3 text-xs text-text-secondary leading-relaxed" data-testid="device-list-note">
      {{ scope === 'global' ? t('identity.globalNotice') : t('identity.verifyHint') }}
      <template v-if="scope !== 'global'"><br />{{ t('identity.ipNotice') }}</template>
    </p>
  </div>
</template>
