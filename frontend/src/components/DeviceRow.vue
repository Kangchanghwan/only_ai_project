<script setup>
/**
 * 기기 목록의 한 행. DeviceList(같은 네트워크 / 다른 네트워크 묶음)와 폰의 연결 카드가 함께 쓴다.
 * 오른쪽 끝 자리: "1:1" → (진행 중) "확인 중 · n초" 칩. 진행 중에는 행 아래에 전체 너비 확장 패널
 * (질문 + 그림 4장 + "같아요" + 취소)이 펼쳐진다.
 */
import { computed, ref, watch, inject, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { isValidIdentity, identityName, deviceAndBrowser, formatRelativeTime } from '../utils/identity'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { sasImages } from '../utils/sasImages'
import PairSasTiles from './PairSasTiles.vue'

const { t, locale } = useI18n()

const props = defineProps({
  device: { type: Object, required: true },
  isMe: { type: Boolean, default: false },
  /** 넓은 화면 왼쪽 패널이면 "1:1", 아니면 "1:1 연결" */
  wide: { type: Boolean, default: false },
  /** 다시 뽑기 쿨다운 중 */
  cooling: { type: Boolean, default: false }
})
const emit = defineEmits(['reroll'])

const pair = inject(PAIR_CONTEXT_KEY, null)
const st = computed(() => pair?.states?.value?.[props.device.socketId] || null)
const legacyLabel = (d) => `${d.browser} · ${d.os}`
const pairName = computed(() => (isValidIdentity(props.device.identity) ? identityName(props.device.identity, t) : legacyLabel(props.device)))

const tick = ref(Date.now())
let timer = null
const pending = computed(() => !!pair && st.value?.state === 'pending')
watch(pending, (on) => {
  clearInterval(timer)
  if (on) {
    tick.value = Date.now()
    timer = setInterval(() => { tick.value = Date.now() }, 1000)
  }
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))
const seconds = computed(() => {
  const at = st.value?.expiresAt
  return at ? Math.max(0, Math.ceil((at - tick.value) / 1000)) : null
})

const images = computed(() => sasImages(st.value?.sas))
const sasReady = computed(() => images.value.length === 4)
const isPending = computed(() => !!pair && st.value?.state === 'pending')
const confirmed = computed(() => !!st.value?.confirmed)

function icon(deviceType) {
  if (deviceType === 'mobile') return '📱'
  if (deviceType === 'tablet') return '📟'
  return '💻'
}
const joinedText = computed(() => {
  const d = props.device
  if (!d.joinedAt) return ''
  return t('identity.joinedAgo', { time: formatRelativeTime(d.joinedAt, locale?.value ?? 'en') })
})
</script>

<template>
  <li class="flex flex-col min-w-0" data-testid="device-row">
    <div class="flex items-center gap-3 min-w-0" data-testid="device-row-header">
      <AnimalAvatar v-if="isValidIdentity(device.identity)" :identity="device.identity" size="md" />
      <span v-else class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-lg shrink-0">{{ icon(device.deviceType) }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold truncate">
            {{ isValidIdentity(device.identity) ? identityName(device.identity, t) : legacyLabel(device) }}
          </span>
          <span v-if="isMe" class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-white shrink-0" data-testid="me-badge">{{ t('identity.me') }}</span>
        </div>
        <div v-if="isValidIdentity(device.identity)" class="text-xs text-text-secondary truncate">{{ deviceAndBrowser(device, t) }}</div>
        <div v-if="joinedText && !isPending" class="text-xs text-text-secondary">{{ joinedText }}</div>
      </div>

      <template v-if="pair && !isMe">
        <span
          v-if="isPending"
          class="shrink-0 inline-flex items-center whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-scope-private/10 text-scope-private"
          role="status"
          data-testid="pair-pending-text"
        >{{ confirmed ? t('pair.peerChecking') : t('pair.checking') }}<template v-if="seconds !== null"> · {{ t('pair.pendingSeconds', { n: seconds }) }}</template></span>
        <button
          v-else-if="st?.state === 'connecting'"
          type="button"
          class="shrink-0 -my-2 min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-border text-text-secondary"
          disabled
          data-testid="pair-connecting-button"
        >{{ t('pair.connecting') }}</button>
        <button
          v-else-if="st?.state === 'paired'"
          type="button"
          class="shrink-0 -my-2 min-h-[44px] px-3 text-xs font-semibold rounded-lg bg-scope-private text-white"
          :aria-label="t('pair.openRoom', { name: pairName })"
          data-testid="pair-open-button"
          @click="pair.open(st.roomId)"
        >{{ t('pair.paired') }}</button>
        <button
          v-else
          type="button"
          class="shrink-0 -my-2 min-h-[44px] min-w-[44px] px-3 text-xs font-semibold rounded-lg border border-scope-private text-scope-private"
          :title="t('pair.openWith', { name: pairName })"
          :aria-label="t('pair.openWith', { name: pairName })"
          data-testid="pair-invite-button"
          @click="pair.invite(device)"
        >{{ wide ? t('pair.buttonShort') : t('pair.button') }}</button>
      </template>
      <button
        v-if="isMe && isValidIdentity(device.identity)"
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
    </div>

    <div
      v-if="isPending && !isMe"
      class="mt-2 rounded-xl border border-scope-private/50 bg-scope-private/5 p-2 flex flex-col gap-2"
      data-testid="pair-pending-panel"
    >
      <p class="m-0 text-sm font-semibold">{{ t('pair.confirm.askSame') }}</p>
      <PairSasTiles :images="images" :size="wide ? 'md' : 'lg'" />
      <p
        v-if="confirmed"
        class="m-0 min-h-[44px] flex items-center justify-center text-sm font-semibold text-scope-private text-center"
        role="status"
        data-testid="pair-confirmed-text"
      >{{ t('pair.confirm.doneWaitingAccept') }}</p>
      <div v-else-if="wide" class="flex flex-col">
        <button
          type="button"
          class="w-full min-h-[44px] rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          :disabled="!sasReady"
          :aria-label="t('pair.confirm.sameInline', { name: pairName })"
          data-testid="pair-same-inline"
          @click="pair.confirm(st.sessionId)"
        >{{ t('pair.confirm.same') }}</button>
      </div>
      <div v-else class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="min-h-[44px] rounded-full border border-border text-sm font-semibold disabled:opacity-50"
          :disabled="!st.sessionId"
          data-testid="pair-cancel-button"
          @click="pair.cancel(st.sessionId)"
        >{{ t('pair.cancel') }}</button>
        <button
          type="button"
          class="min-h-[44px] rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          :disabled="!sasReady"
          :aria-label="t('pair.confirm.sameInline', { name: pairName })"
          data-testid="pair-same-inline"
          @click="pair.confirm(st.sessionId)"
        >{{ t('pair.confirm.same') }}</button>
      </div>
      <div v-if="wide || confirmed" class="flex items-center justify-between gap-2">
        <span class="text-xs text-text-secondary">{{ t('pair.acceptNote') }}</span>
        <button
          type="button"
          class="shrink-0 inline-flex items-center min-h-[44px] -my-3 px-2 text-xs text-text-secondary underline disabled:opacity-50"
          :disabled="!st.sessionId"
          data-testid="pair-cancel-button"
          @click="pair.cancel(st.sessionId)"
        >{{ t('pair.cancel') }}</button>
      </div>
    </div>
  </li>
</template>
