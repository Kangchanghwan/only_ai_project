<script setup>
/**
 * 기기 목록의 한 행. DeviceList(같은 네트워크 / 다른 네트워크 묶음)와 폰의 연결 카드가 함께 쓴다.
 * 1:1 버튼 자리(오른쪽 끝)에서 연결 진행 단계가 바뀐다:
 *   "1:1" → (그림 준비 중 스피너) → 그림 4장 + "같아요" (같은 자리) → "상대 수락 기다리는 중"
 */
import { computed, ref, watch, inject, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { isValidIdentity, identityName, deviceAndBrowser, formatRelativeTime } from '../utils/identity'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { sasImages } from '../utils/sasImages'

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
  <li class="flex items-center gap-3 min-w-0" data-testid="device-row">
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
      <div v-if="pair && st?.state === 'pending' && sasReady && !confirmed" class="flex items-center gap-0.5 mt-1" data-testid="pair-inline-sas">
        <img
          v-for="(img, i) in images"
          :key="i"
          :src="img.src"
          :alt="img.emoji"
          draggable="false"
          class="w-7 h-7 object-contain select-none rounded bg-background border border-border p-0.5"
          data-testid="pair-inline-sas-image"
        />
      </div>
      <div v-if="pair && st?.state === 'pending'" class="flex items-center gap-1 flex-wrap">
        <span class="text-xs font-semibold text-scope-private" role="status" data-testid="pair-pending-text">
          {{ confirmed ? t('pair.waitingAccept') : t('pair.pending') }}<template v-if="seconds !== null"> · {{ t('pair.pendingSeconds', { n: seconds }) }}</template>
        </span>
        <button
          type="button"
          class="inline-flex items-center min-h-[44px] -my-3 px-1 text-xs text-text-secondary underline disabled:opacity-50"
          :disabled="!st.sessionId"
          data-testid="pair-cancel-button"
          @click="pair.cancel(st.sessionId)"
        >{{ t('pair.cancel') }}</button>
      </div>
      <div v-else-if="joinedText" class="text-xs text-text-secondary">{{ joinedText }}</div>
    </div>

    <template v-if="pair && !isMe">
      <!-- 1:1 버튼 자리: 진행 단계에 따라 같은 오른쪽 끝에서 바뀐다 -->
      <div
        v-if="st?.state === 'pending'"
        class="shrink-0 self-start mt-0.5 flex items-center justify-end min-w-[44px] min-h-[44px]"
        data-testid="pair-inline-confirm"
      >
        <span
          v-if="confirmed || !sasReady"
          class="inline-block w-5 h-5 rounded-full border-2 border-scope-private border-t-transparent animate-spin"
          role="status"
          :aria-label="t('pair.confirm.preparing')"
          data-testid="pair-sas-spinner"
        ></span>
        <button
            v-else
            type="button"
            class="min-h-[44px] min-w-[44px] px-3 text-xs font-semibold rounded-lg bg-scope-private text-white"
            :aria-label="t('pair.confirm.sameInline', { name: pairName })"
            data-testid="pair-same-inline"
            @click="pair.confirm(st.sessionId)"
          >{{ t('pair.confirm.same') }}</button>
      </div>
      <button
        v-else-if="st?.state === 'connecting'"
        type="button"
        class="shrink-0 self-start mt-0.5 min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-border text-text-secondary"
        disabled
        data-testid="pair-connecting-button"
      >{{ t('pair.connecting') }}</button>
      <button
        v-else-if="st?.state === 'paired'"
        type="button"
        class="shrink-0 self-start mt-0.5 min-h-[44px] px-3 text-xs font-semibold rounded-lg bg-scope-private text-white"
        :aria-label="t('pair.openRoom', { name: pairName })"
        data-testid="pair-open-button"
        @click="pair.open(st.roomId)"
      >{{ t('pair.paired') }}</button>
      <button
        v-else
        type="button"
        class="shrink-0 self-start mt-0.5 min-h-[44px] min-w-[44px] px-3 text-xs font-semibold rounded-lg border border-scope-private text-scope-private"
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
  </li>
</template>
