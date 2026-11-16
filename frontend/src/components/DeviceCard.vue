<script setup>
/**
 * 접속 기기 카드 한 장. 사진(네모) 왼쪽 위에 접속 시각 딱지, 오른쪽에 이름·기기, 아래에 작은 버튼 한 줄.
 * 1:1 연결 동작은 DeviceRow와 같은 PAIR_CONTEXT_KEY를 쓴다.
 */
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { animalSrc, animalBg, isValidIdentity, identityName, deviceAndBrowser, formatRelativeTime } from '../utils/identity'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'

const { t, locale } = useI18n()

const props = defineProps({
  device: { type: Object, required: true },
  isMe: { type: Boolean, default: false },
  /** 다시 뽑기 쿨다운 중 */
  cooling: { type: Boolean, default: false },
  /** 같은 줄 다른 카드에는 연결 버튼이 있어 높이를 맞추기 위한 자리 (연결 불가 범위에서는 false) */
  pairable: { type: Boolean, default: true },
  /** 현재 시각(ms): 접속 시각 딱지 갱신용 */
  now: { type: Number, default: () => Date.now() },
  /** 'now' 판정 기준: 이 시간(ms)보다 최근이면 "지금" */
  nowWindowMs: { type: Number, default: 45000 }
})
const emit = defineEmits(['reroll'])

const pair = inject(PAIR_CONTEXT_KEY, null)
const st = computed(() => pair?.states?.value?.[props.device.socketId] || null)
const valid = computed(() => isValidIdentity(props.device.identity))
const name = computed(() => (valid.value ? identityName(props.device.identity, t) : `${props.device.browser} · ${props.device.os}`))
const sub = computed(() => (valid.value ? deviceAndBrowser(props.device, t) : ''))
const photoSrc = computed(() => (valid.value ? animalSrc(props.device.identity.animal) : null))
const photoBg = computed(() => (valid.value ? animalBg(props.device.identity.animal) : undefined))

const incoming = computed(() => {
  if (props.isMe || !pair?.incoming) return null
  const s = pair.incoming.value
  const id = s?.peer?.socketId
  return s && id && id === props.device.socketId ? s : null
})
const stateName = computed(() => st.value?.state || null)
const canPair = computed(() => !!pair && !props.isMe && props.pairable)
const showBottom = computed(() => (props.isMe ? valid.value : canPair.value || !!incoming.value))

const joinedAt = computed(() => props.device.joinedAt || 0)
const tagText = computed(() => (joinedAt.value ? formatRelativeTime(joinedAt.value, locale?.value ?? 'en', props.now) : ''))
const isNow = computed(() => !!joinedAt.value && Math.abs(props.now - joinedAt.value) < props.nowWindowMs)
const title = computed(() => (sub.value ? `${name.value} · ${sub.value}` : name.value))

function icon(deviceType) {
  if (deviceType === 'mobile') return 'M'
  return deviceType === 'tablet' ? 'T' : 'D'
}
const seconds = computed(() => {
  const at = st.value?.expiresAt
  return at ? Math.max(0, Math.ceil((at - props.now) / 1000)) : null
})
const BTN = 'h-[26px] w-full min-w-0 inline-flex items-center justify-center gap-1 rounded-none text-[10px] leading-none whitespace-nowrap cursor-pointer'
</script>

<template>
  <li
    class="flex flex-col gap-[5px] min-w-0 text-[10px] sm:text-[11px] list-none m-0"
    :class="incoming ? 'bg-tint border-2 border-scope-private p-[5px]' : isMe ? 'border-2 border-ink p-[5px]' : 'border border-border p-[6px]'"
    :data-me="isMe ? 'true' : undefined"
    :data-incoming="incoming ? 'true' : undefined"
    data-testid="device-card"
  >
    <div class="flex items-start gap-[6px] min-w-0">
      <div class="relative shrink-0 w-10 h-10">
        <span
          class="inline-flex items-center justify-center w-10 h-10 rounded-none overflow-hidden bg-tint"
          :style="photoBg ? { backgroundColor: photoBg } : undefined"
          data-testid="device-card-photo"
        >
          <img v-if="photoSrc" :src="photoSrc" alt="" draggable="false" class="w-[78%] h-[78%] select-none" />
          <svg v-else class="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :data-device-type="icon(device.deviceType)"><rect x="3" y="4" width="18" height="12" rx="0"/><path d="M2 20h20"/></svg>
        </span>
        <span
          v-if="tagText"
          class="absolute -top-px -left-px px-[3px] py-[2px] text-[9px] leading-none font-bold text-on-accent whitespace-nowrap"
          :class="isNow ? 'bg-scope-global' : 'bg-text-secondary'"
          :data-now="isNow ? 'true' : 'false'"
          :title="t('identity.joinedAgo', { time: tagText })"
          data-testid="device-card-status"
        >{{ tagText }}</span>
      </div>
      <div class="min-w-0 flex-1" :title="title">
        <div class="flex items-center gap-1 min-w-0">
          <span class="text-[11px] font-extrabold text-ink truncate" data-testid="device-card-name">{{ name }}</span>
          <span v-if="isMe" class="shrink-0 text-[9px] leading-none font-bold px-1 py-[2px] bg-ink text-on-ink" data-testid="me-badge">{{ t('identity.me') }}</span>
        </div>
        <div v-if="sub" class="text-text-secondary truncate" data-testid="device-card-sub">{{ sub }}</div>
      </div>
    </div>

    <div v-if="showBottom" class="flex gap-1 min-w-0 h-[26px]" data-testid="device-card-actions">
      <template v-if="isMe">
        <button
          type="button"
          :class="[BTN, 'border border-border text-ink-2 bg-transparent font-semibold hover:bg-tint disabled:opacity-50 disabled:cursor-not-allowed']"
          :disabled="cooling"
          :title="t('identity.rerollTitle')"
          :aria-label="t('identity.rerollTitle')"
          data-testid="reroll-button"
          @click="emit('reroll')"
        >
          <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          <span class="truncate">{{ t('identity.reroll') }}</span>
        </button>
      </template>
      <template v-else-if="incoming">
        <!-- 받은 요청: 수락·거절은 그림 확인 창(PairRequestSheet)에서만 한다. 카드에서 바로 수락하면 그림 확인을 건너뛰게 되므로 상태만 보여 준다 -->
        <span class="flex-1 min-w-0 inline-flex items-center justify-center gap-1 h-[26px] text-[10px] font-bold text-on-accent bg-scope-private truncate" role="status" data-testid="card-incoming">
          <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="truncate">{{ t('pair.request.title') }}</span>
        </span>
      </template>
      <template v-else-if="stateName === 'pending'">
        <span class="flex-1 min-w-0 inline-flex items-center justify-center h-[26px] text-[10px] font-semibold text-scope-private bg-scope-private/10 truncate" role="status" data-testid="pair-pending-text">
          {{ st?.confirmed ? t('pair.peerChecking') : t('pair.checking') }}<template v-if="seconds !== null">&nbsp;· {{ t('pair.pendingSeconds', { n: seconds }) }}</template>
        </span>
        <button
          v-if="st?.sessionId"
          type="button"
          class="shrink-0 h-[26px] px-2 border border-border text-text-secondary bg-transparent text-[10px] font-semibold cursor-pointer"
          data-testid="card-cancel"
          @click="pair.cancel(st.sessionId)"
        >{{ t('pair.cancel') }}</button>
      </template>
      <button
        v-else-if="stateName === 'connecting'"
        type="button"
        :class="[BTN, 'border border-border text-text-secondary font-semibold']"
        disabled
        data-testid="pair-connecting-button"
      >{{ t('pair.connecting') }}</button>
      <button
        v-else-if="stateName === 'paired'"
        type="button"
        :class="[BTN, 'bg-scope-private text-on-accent font-bold border-0']"
        :aria-label="t('pair.openRoom', { name })"
        data-testid="pair-open-button"
        @click="pair.open(st.roomId)"
      >{{ t('pair.paired') }}</button>
      <button
        v-else
        type="button"
        :class="[BTN, 'border-[1.5px] border-ink text-ink bg-transparent font-extrabold hover:bg-tint']"
        :title="t('pair.openWith', { name })"
        :aria-label="`${t('pair.button')} ${name}`"
        data-testid="pair-invite-button"
        @click="pair.invite(device)"
      >{{ t('pair.buttonShort') }}</button>
    </div>
  </li>
</template>
