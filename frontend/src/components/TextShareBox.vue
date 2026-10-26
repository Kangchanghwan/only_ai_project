<script setup>
/**
 * TextShareBox.vue - 텍스트 공유
 * - 직접 입력(textarea) + 공유 버튼, 보이는 붙여넣기 버튼
 * - 입력 중인 textarea에 붙여넣은 내용은 자동 전송되지 않고 일반 입력으로 남는다(App의 전역 paste 핸들러가 편집 가능 요소는 무시)
 * - 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 * - 보관 방식 박스 하나: 평문/암호문 중 무엇으로 10분 보관하는지 + 받을 기기 수(0대면 들어오면 전달/전달 안 됨)
 *   + 바로 잠금을 켜는 칩. 보낸 직후 성공 문장은 화면에 고정하지 않는다(토스트·카드의 남은 시간으로 충분)
 * - 보관 중(10분) 텍스트: 남은 시간과, 지울 증명이 있으면 "보관 취소" 버튼
 * - 잠긴 텍스트: 이 범위 비밀번호를 확인하지 않은 기기에는 내용 대신 "잠긴 텍스트"와 풀기 입력을 보여 준다
 * - 보관 안 된 내 텍스트(96KB 초과 등): 지금 열린 기기에만 갔다고 표시하고 .txt 파일로 보내기를 제안한다
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'
import SenderLabel from './SenderLabel.vue'
import LockChip from './LockChip.vue'

const { t } = useI18n()

const props = defineProps({
  texts: { type: Array, required: true, default: () => [] },
  scope: { type: String, default: 'ip' },
  /** 1:1 상대가 나간 방: 입력을 막는다 */
  composeDisabled: { type: Boolean, default: false },
  /** 입력을 막은 이유 안내 (예: 상대 오프라인) */
  composeNote: { type: String, default: '' },
  /** #/send?t= 링크로 받은 텍스트. 입력란이 비어 있을 때만 채우고 자동 전송하지 않는다 */
  prefill: { type: String, default: '' },
  /** 지금 범위에서 받을 수 있는 다른 기기 수 (null이면 표시하지 않음) */
  receiverCount: { type: Number, default: null },
  /** 보내는 텍스트의 보관 방식: private(1:1 방 키) | locked(범위 잠금) | plain(평문) | none(보관 안 함) */
  storageMode: { type: String, default: 'none' }
})

const emit = defineEmits(['remove-text', 'clear-all', 'copy-text', 'share-text', 'paste-content', 'cancel-text', 'unlock-text', 'send-as-file'])

const willQueue = computed(() => props.storageMode !== 'none')
const storageLabel = computed(() => {
  if (props.storageMode === 'plain') return props.scope === 'global' ? t('text.storagePlainGlobal') : t('text.storagePlainIp')
  if (props.storageMode === 'locked') return t('text.storageLocked')
  if (props.storageMode === 'private') return t('text.storagePrivate')
  return t('text.storageNone')
})

const { bg: accentBg, hoverText: accentHoverText, hoverBorder50: accentHoverBorder50 } = useScopeAccent(() => props.scope)

const draft = ref('')
const sending = ref(false)
/** 링크로 채운 내용인지 (안내 문구 표시용) */
const fromLink = ref(false)
/** 마지막 공유 결과: 화면과 보조기술·브라우저 에이전트가 성공 여부를 확인할 수 있게 글자로 남긴다 */
const lastResult = ref('')
const inputRef = ref(null)

watch(() => props.prefill, async (v) => {
  if (!v || draft.value.trim()) return
  draft.value = v
  fromLink.value = true
  await nextTick()
  inputRef.value?.focus?.()
}, { immediate: true })
const openMenuId = ref(null)

/** 공유 버튼: 빈 입력은 무시. 부모가 done(ok)로 결과를 알려주면 성공 시에만 입력을 비운다. */
function submit() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  sending.value = true
  let settled = false
  const done = (ok) => {
    if (settled) return
    settled = true
    sending.value = false
    if (ok) {
      draft.value = ''
      fromLink.value = false
    }
    lastResult.value = ok ? 'ok' : 'fail'
  }
  emit('share-text', { content, done })
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}

/** 보관 남은 시간: "N분 뒤 삭제" (1분 미만은 "곧 삭제") */
function expiresLabel(text) {
  const minutes = Math.min(10, Math.ceil((text.remainingMs || 0) / 60000))
  return minutes <= 1 ? t('text.expiresSoon') : t('text.expiresIn', { minutes })
}

// 잠긴 텍스트 풀기 (한 번에 한 카드)
const unlockingId = ref(null)
const unlockPassword = ref('')
const unlockBusy = ref(false)
const unlockMessage = ref('')

function openUnlock(id) {
  unlockingId.value = unlockingId.value === id ? null : id
  unlockPassword.value = ''
  unlockMessage.value = ''
}

function submitUnlock(id) {
  if (!unlockPassword.value || unlockBusy.value) return
  unlockBusy.value = true
  unlockMessage.value = ''
  emit('unlock-text', {
    id,
    password: unlockPassword.value,
    done: (res) => {
      unlockBusy.value = false
      if (res?.ok) {
        unlockingId.value = null
        unlockPassword.value = ''
        return
      }
      unlockMessage.value = res?.code === 'WRONG_PASSWORD'
        ? (typeof res.remaining === 'number' ? t('text.wrongPassword', { count: res.remaining }) : t('text.wrongPasswordNoCount'))
        : res?.code === 'LOCKED_OUT' ? t('text.lockedOut')
          : res?.code === 'TEXT_NOT_FOUND' ? t('text.expired')
            : t('text.unlockFailed')
    }
  })
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="min-w-0">
    <!-- 직접 입력 -->
    <form class="flex flex-col gap-2 mb-6" data-testid="text-compose" @submit.prevent="submit">
      <label class="text-sm font-semibold text-text-primary" for="text-share-input">{{ t('text.share') }}</label>
      <textarea
        id="text-share-input"
        ref="inputRef"
        v-model="draft"
        rows="4"
        class="w-full min-h-[6rem] resize-y rounded-xl border border-border bg-background text-text-primary text-sm p-3 font-mono focus-visible:outline-2 focus-visible:outline-primary"
        :placeholder="t('text.composePlaceholder')"
        data-testid="text-input"
        :disabled="composeDisabled"
        @keydown="onKeydown"
      ></textarea>
      <p v-if="composeDisabled && composeNote" class="m-0 text-xs text-text-secondary" role="status" data-testid="text-compose-note">{{ composeNote }}</p>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          class="min-h-[44px] px-6 rounded-full text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          :class="accentBg"
          :disabled="composeDisabled || !draft.trim() || sending"
          data-testid="text-share-button"
        >{{ t('file.share') }}</button>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full border border-border bg-background text-sm font-semibold text-text-primary"
          :title="t('text.autoShareHint')"
          data-testid="text-paste-button"
          @click="emit('paste-content')"
        >📋 {{ t('clipboard.pasteTitle') }}</button>
      </div>
      <!-- 페이지 어디서나 붙여넣기 자동 공유: 키보드·마우스 기기에서만 한 줄로 -->
      <p class="hidden pointer-fine:block m-0 text-[11px] leading-4 text-text-secondary truncate" :title="t('text.autoShareHint')" data-testid="text-autoshare-hint">{{ t('text.autoShareHint') }}</p>
      <p v-if="fromLink" class="m-0 text-xs font-semibold text-text-primary" data-testid="text-prefill-note">{{ t('text.prefillNote') }}</p>
      <!-- 결과는 보조기술·브라우저 에이전트용으로 남긴다. 성공은 토스트로 보이므로 화면에는 실패만 -->
      <p
        class="m-0 text-xs text-text-secondary"
        :class="{ 'sr-only': lastResult !== 'fail' }"
        role="status"
        aria-live="polite"
        data-testid="text-share-result"
      >{{ lastResult === 'ok' ? t('text.sentStatus') : lastResult === 'fail' ? t('text.sendFailedStatus') : '' }}</p>
    </form>
    <!-- 보관 방식: 평문이면 이 범위 누구나 볼 수 있다고 알리고, 바로 잠금(암호화)을 켤 수 있게 한다.
         잠금 칩은 자체 form이 있어 입력 form 밖에 둔다 (submit이 공유로 번지지 않게) -->
    <div v-if="!composeDisabled" class="flex items-center justify-between gap-2 flex-wrap -mt-3 mb-6 rounded-xl border border-border px-3 py-2" data-testid="text-storage" :data-mode="storageMode">
      <div class="basis-0 grow min-w-[10rem] flex flex-col gap-0.5">
        <p
          class="m-0 text-xs"
          :class="storageMode === 'plain' && scope === 'global' ? 'font-semibold text-text-primary' : 'text-text-secondary'"
          data-testid="text-storage-label"
        >{{ storageLabel }}</p>
        <p
          v-if="receiverCount !== null"
          class="m-0 text-[11px] leading-4 text-text-secondary tabular-nums"
          :class="{ 'font-semibold text-text-primary': receiverCount === 0 && !willQueue }"
          data-testid="text-receivers"
          :data-state="receiverCount === 0 ? (willQueue ? 'queued' : 'nobody') : 'live'"
        >{{ t('text.receiversCount', { count: receiverCount }) }}<template v-if="receiverCount === 0"> · {{ willQueue ? t('text.deliverOnJoin') : t('text.notDelivered') }}</template></p>
      </div>
      <LockChip v-if="storageMode === 'plain' || storageMode === 'locked'" :scope="scope" class="shrink-0" />
    </div>

    <!-- 받은 텍스트 -->
    <div class="flex items-center justify-between mb-3 gap-2">
      <h2 class="text-lg font-semibold text-text-primary m-0">
        {{ t('text.receivedText') }}
        <span v-if="texts.length > 0" class="text-sm font-normal text-text-secondary" data-testid="text-count">({{ texts.length }})</span>
      </h2>
      <button
        v-if="texts.length > 0"
        type="button"
        class="min-h-[44px] px-3 text-xs text-text-secondary transition-colors duration-200"
        :class="accentHoverText"
        @click="$emit('clear-all')"
      >🗑️ {{ t('text.clearAll') }}</button>
    </div>

    <div class="space-y-2 max-h-[28rem] overflow-y-auto">
      <div v-if="texts.length === 0" class="text-center py-10 text-text-secondary">
        <p class="text-sm m-0">{{ t('text.noMessages') }}</p>
      </div>

      <article
        v-for="text in texts"
        :key="text.id"
        class="bg-background border border-border rounded-lg p-3 transition-colors duration-200"
        :class="accentHoverBorder50"
        data-testid="text-entry"
      >
        <!-- 보낸 사람 + 시간은 한 번만 -->
        <header class="flex items-center justify-between gap-2 mb-2 min-w-0">
          <SenderLabel v-if="text.sender" :sender="text.sender" :time="text.timestamp" />
          <span v-else class="text-xs text-text-secondary" data-testid="text-time">{{ formatTime(text.timestamp) }}</span>
          <div class="flex items-center gap-1 shrink-0">
            <button
              v-if="text.content != null"
              type="button"
              class="min-h-[44px] px-3 rounded-full border border-border text-xs font-semibold text-text-primary"
              :aria-label="t('room.copy')"
              data-testid="text-copy"
              @click="$emit('copy-text', text.id)"
            >{{ t('room.copy') }}</button>
            <div class="relative">
              <button
                type="button"
                class="w-11 h-11 inline-flex items-center justify-center rounded-full text-text-secondary"
                :aria-label="t('file.moreActions')"
                :aria-expanded="openMenuId === text.id"
                data-testid="text-more"
                @click="openMenuId = openMenuId === text.id ? null : text.id"
              >⋯</button>
              <div v-if="openMenuId === text.id" class="absolute right-0 top-full z-20 bg-surface border border-border rounded-lg shadow-lg min-w-[8rem]">
                <button
                  type="button"
                  class="w-full min-h-[44px] px-4 text-left text-sm text-red-500"
                  data-testid="text-delete"
                  @click="openMenuId = null; $emit('remove-text', text.id)"
                >{{ t('text.delete') }}</button>
              </div>
            </div>
          </div>
        </header>
        <pre v-if="text.content != null" class="text-text-primary text-sm font-mono whitespace-pre-wrap break-words m-0" data-testid="text-body">{{ text.content }}</pre>
        <!-- 잠긴 텍스트: 이 범위 비밀번호를 확인한 기기에서만 내용이 보인다 -->
        <div v-else class="flex flex-col gap-2" data-testid="text-locked">
          <div class="flex items-center justify-between gap-2">
            <p class="m-0 text-sm text-text-secondary inline-flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              <span class="font-semibold text-text-primary">{{ t('text.lockedTitle') }}</span>
            </p>
            <button
              type="button"
              class="min-h-[44px] px-4 rounded-full text-white text-xs font-semibold shrink-0"
              :class="accentBg"
              :aria-expanded="unlockingId === text.id"
              data-testid="text-unlock-open"
              @click="openUnlock(text.id)"
            >{{ t('text.unlock') }}</button>
          </div>
          <p class="m-0 text-xs text-text-secondary">{{ t('text.lockedHint') }}</p>
          <form v-if="unlockingId === text.id" class="flex items-center gap-2" data-testid="text-unlock-form" @submit.prevent="submitUnlock(text.id)">
            <input
              v-model="unlockPassword"
              type="password"
              autocomplete="off"
              class="flex-1 min-w-0 min-h-[44px] rounded-full border border-border bg-background text-text-primary text-sm px-4 focus-visible:outline-2 focus-visible:outline-primary"
              :placeholder="t('text.passwordPlaceholder')"
              :aria-label="t('text.passwordPlaceholder')"
              data-testid="text-unlock-password"
            />
            <button
              type="submit"
              class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold text-text-primary disabled:opacity-50"
              :disabled="!unlockPassword || unlockBusy"
              data-testid="text-unlock-submit"
            >{{ unlockBusy ? '…' : t('text.unlock') }}</button>
          </form>
          <p v-if="unlockingId === text.id && unlockMessage" class="m-0 text-xs text-red-500" role="alert" data-testid="text-unlock-message">{{ unlockMessage }}</p>
        </div>
        <!-- 보관 중(10분): 남은 시간 + 보관 취소 -->
        <footer v-if="text.expiresAt" class="flex items-center justify-between gap-2 mt-2" data-testid="text-queued">
          <span class="text-xs text-text-secondary tabular-nums" data-testid="text-expires">{{ expiresLabel(text) }}</span>
          <button
            v-if="text.canCancel"
            type="button"
            class="min-h-[44px] px-3 text-xs font-semibold text-text-secondary transition-colors duration-200"
            :class="accentHoverText"
            data-testid="text-cancel-keep"
            @click="$emit('cancel-text', text.id)"
          >{{ t('text.cancelKeep') }}</button>
        </footer>
        <!-- 내가 보냈지만 보관되지 않은 텍스트: 지금 열린 기기에만 갔다 -->
        <footer v-else-if="text.notStored" class="flex items-center justify-between gap-2 mt-2 flex-wrap" data-testid="text-not-kept">
          <span class="text-xs font-semibold text-text-primary">{{ text.notStored === 'TOO_LARGE' ? t('text.notKeptTooLarge') : t('text.notKeptFull') }}</span>
          <button
            v-if="text.notStored === 'TOO_LARGE' && text.content != null"
            type="button"
            class="min-h-[44px] px-3 rounded-full border border-border text-xs font-semibold text-text-primary"
            data-testid="text-send-as-file"
            @click="$emit('send-as-file', text.id)"
          >{{ t('text.sendAsFile') }}</button>
        </footer>
      </article>
    </div>
  </div>
</template>
