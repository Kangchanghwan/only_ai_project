<script setup>
/**
 * 1:1 연결 요청 시트 (받는 쪽). 좁은 화면은 하단 시트, 넓은 화면은 가운데 대화상자.
 * v3: 요청이 오는 즉시 그림 4장을 보여 주고, "수락" 한 번이 수락+확인이다(그림이 준비되기 전엔 비활성).
 * 옛 흐름(session.legacy)은 그림이 수락 뒤에 나오므로 수락을 바로 켜고 별도 확인 시트를 쓴다.
 * 한 번에 하나만 보여 준다(대기열은 부모가 첫 요청만 내려준다). 첫 포커스는 "거절", Esc = 거절.
 */
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PairSasTiles from './PairSasTiles.vue'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { sasImages } from '../utils/sasImages'
import { isValidIdentity, identityName, deviceAndBrowser } from '../utils/identity'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  /** pairing 세션 스냅샷 (state === 'incoming') 또는 null */
  session: { type: Object, default: null },
  /** aria-live 안내 문구 */
  announcement: { type: String, default: '' }
})
const emit = defineEmits(['respond', 'cancel'])

const root = ref(null)
const declineBtn = ref(null)

const images = computed(() => sasImages(props.session?.sas))
const waiting = computed(() => props.session?.state === 'waiting-peer-confirm')
const legacy = computed(() => !!props.session?.legacy)
const sasReady = computed(() => images.value.length === 4)
const acceptEnabled = computed(() => legacy.value || sasReady.value)
const accept = () => {
  if (!acceptEnabled.value) return
  emit('respond', legacy.value ? { accept: true } : { accept: true, same: true })
}

const peer = computed(() => props.session?.peer || null)
const name = computed(() => (peer.value && isValidIdentity(peer.value.identity) ? identityName(peer.value.identity, t) : t('pair.unknownDevice')))
const deviceText = computed(() => (peer.value && isValidIdentity(peer.value.identity) ? deviceAndBrowser(peer.value, t) : `${peer.value?.browser ?? ''} · ${peer.value?.os ?? ''}`))

watch(
  () => [props.session?.sessionId, props.session?.state],
  async (id) => {
    if (!id) return
    await nextTick()
    declineBtn.value?.focus()
  },
  { immediate: true, flush: 'post' }
)

const decline = () => (waiting.value ? emit('cancel') : emit('respond', { accept: false }))
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); decline(); return }
  trapTab(event, root.value)
}
</script>

<template>
  <Teleport to="body">
    <div role="status" aria-live="polite" class="sr-only" data-testid="pair-announce">{{ announcement }}</div>
    <div
      v-if="session"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="pair-request-sheet"
    >
      <div
        ref="root"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pair-request-title"
        class="w-full sm:max-w-sm bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <h2 id="pair-request-title" class="text-base font-semibold m-0">{{ t('pair.request.title') }}</h2>
        <div class="mt-4 flex items-center gap-3 min-w-0">
          <PairPeerAvatar :device="peer" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold truncate" data-testid="pair-request-name">{{ name }}</div>
            <div class="text-xs text-text-secondary truncate">{{ deviceText }}</div>
          </div>
          <span
            class="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-scope-private/10 text-scope-private"
            data-testid="pair-network-badge"
          >{{ session.sameNetwork ? t('pair.request.sameNetwork') : t('pair.request.otherNetwork') }}</span>
        </div>
        <template v-if="!legacy">
          <p class="mt-4 text-sm font-semibold m-0 text-center">{{ t('pair.request.compare') }}</p>
          <PairSasTiles class="mt-3" :images="images" size="lg" />
        </template>
        <p v-else class="mt-3 text-xs text-text-secondary leading-relaxed m-0">{{ t('pair.request.body') }}</p>
        <div v-if="waiting" class="mt-4 text-center">
          <p class="m-0 text-sm font-semibold text-scope-private" role="status" data-testid="pair-waiting">{{ t('pair.confirm.doneWaitingPeer') }}</p>
          <button
            ref="declineBtn"
            type="button"
            class="mt-3 min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold"
            data-testid="pair-wait-cancel"
            @click="emit('cancel')"
          >{{ t('pair.cancel') }}</button>
        </div>
        <div v-if="!waiting" class="mt-4 grid grid-cols-2 gap-2">
          <button
            ref="declineBtn"
            type="button"
            class="min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold"
            data-testid="pair-decline"
            @click="decline"
          >{{ t('pair.request.decline') }}</button>
          <button
            type="button"
            class="min-h-[44px] px-5 rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            :disabled="!acceptEnabled"
            :aria-busy="!acceptEnabled"
            data-testid="pair-accept"
            @click="accept"
          >
            <span v-if="!acceptEnabled" class="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" data-testid="pair-accept-spinner"></span>
            {{ t('pair.request.accept') }}
          </button>
        </div>
        <div v-if="!waiting" class="mt-1 flex flex-col items-center">
          <button
            type="button"
            class="min-h-[44px] px-3 text-xs text-text-secondary underline"
            data-testid="pair-block"
            @click="emit('respond', { accept: false, block: true })"
          >{{ t('pair.request.block') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
