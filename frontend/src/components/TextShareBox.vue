<script setup>
/**
 * TextShareBox.vue - 텍스트 공유
 * - 직접 입력(textarea) + 공유 버튼, 보이는 붙여넣기 버튼
 * - 입력 중인 textarea에 붙여넣은 내용은 자동 전송되지 않고 일반 입력으로 남는다(App의 전역 paste 핸들러가 편집 가능 요소는 무시)
 * - 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 * - 보관 방식 박스 하나: 평문/암호문 중 무엇으로 10분 보관하는지 + 받을 기기 수(0대면 들어오면 전달/전달 안 됨)
 *   + 바로 잠금을 켜는 칩. 보낸 직후 성공 문장은 화면에 고정하지 않는다(토스트·카드의 남은 시간으로 충분)
 * - 받은 텍스트 목록은 TextItemRow가 파일과 같은 한 목록(FileGallery)에서 그린다
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { privateRoomIdOfScope } from '../composables/useShareScope'
import { isGroupRoomId } from '../utils/groupRoom'
import LockChip from './LockChip.vue'

const { t } = useI18n()

const props = defineProps({
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

const emit = defineEmits(['share-text'])

const willQueue = computed(() => props.storageMode !== 'none')
const storageLabel = computed(() => {
  if (props.storageMode === 'plain') return props.scope === 'global' ? t('text.storagePlainGlobal') : t('text.storagePlainIp')
  if (props.storageMode === 'locked') return t('text.storageLocked')
  if (props.storageMode === 'private') return isGroupRoomId(privateRoomIdOfScope(props.scope)) ? t('group.textNote') : t('text.storagePrivate')
  return t('text.storageNone')
})


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

/** 한 줄로 시작해 입력에 따라 최대 약 6줄까지 늘어난다 */
function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`
}
watch(draft, () => nextTick(autoGrow))

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

</script>

<template>
  <div class="min-w-0" data-testid="text-composer">
    <!-- 한 줄 입력: 입력란 + (잠금 칩) + 공유. 잠금 칩은 자체 form이 있어 입력 form 밖에 둔다 -->
    <div class="flex flex-wrap sm:flex-nowrap items-end gap-2">
      <form class="contents" id="text-compose-form" data-testid="text-compose" @submit.prevent="submit">
        <label class="sr-only" for="text-share-input">{{ t('text.share') }}</label>
        <textarea
          id="text-share-input"
          ref="inputRef"
          v-model="draft"
          rows="1"
          class="basis-full sm:basis-0 sm:flex-1 min-w-0 min-h-[44px] max-h-[150px] resize-none overflow-y-auto rounded-none border border-border bg-background text-text-primary text-sm px-3 py-[11px] leading-5 font-mono focus-visible:outline-2 focus-visible:outline-ink"
          :placeholder="t('text.composePlaceholder')"
          :title="t('text.autoShareHint')"
          data-testid="text-input"
          :disabled="composeDisabled"
          @keydown="onKeydown"
        ></textarea>
      </form>
      <LockChip v-if="!composeDisabled && (storageMode === 'plain' || storageMode === 'locked')" :scope="scope" class="shrink-0" />
      <button
        type="submit"
        form="text-compose-form"
        class="ml-auto sm:ml-0 min-h-[44px] px-6 rounded-none bg-ink text-on-ink font-extrabold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="composeDisabled || !draft.trim() || sending"
        data-testid="text-share-button"
      >{{ t('file.share') }}</button>
    </div>
    <p v-if="composeDisabled && composeNote" class="m-0 mt-2 text-xs text-text-secondary" role="status" data-testid="text-compose-note">{{ composeNote }}</p>
    <!-- 페이지 어디서나 붙여넣기 자동 공유 안내는 스크린리더용 -->
    <p class="sr-only" data-testid="text-autoshare-hint">{{ t('text.autoShareHint') }}</p>
    <p v-if="fromLink" class="m-0 mt-2 text-xs font-semibold text-text-primary" data-testid="text-prefill-note">{{ t('text.prefillNote') }}</p>
    <!-- 결과는 보조기술·브라우저 에이전트용으로 남긴다. 성공은 토스트로 보이므로 화면에는 실패만 -->
    <p
      class="m-0 mt-2 text-xs text-text-secondary"
      :class="{ 'sr-only': lastResult !== 'fail' }"
      role="status"
      aria-live="polite"
      data-testid="text-share-result"
    >{{ lastResult === 'ok' ? t('text.sentStatus') : lastResult === 'fail' ? t('text.sendFailedStatus') : '' }}</p>
    <!-- 보관 방식·받을 기기 수: 동작 안내라 항상 보이는 작은 한 줄 -->
    <div v-if="!composeDisabled" class="mt-2 text-xs text-text-secondary" data-testid="text-storage" :data-mode="storageMode">
      <span
        :class="storageMode === 'plain' && scope === 'global' ? 'font-semibold text-text-primary' : ''"
        data-testid="text-storage-label"
      >{{ storageLabel }}</span>
      <span v-if="receiverCount !== null" aria-hidden="true"> · </span>
      <span
        v-if="receiverCount !== null"
        class="tabular-nums"
        :class="{ 'font-semibold text-text-primary': receiverCount === 0 && !willQueue }"
        data-testid="text-receivers"
        :data-state="receiverCount === 0 ? (willQueue ? 'queued' : 'nobody') : 'live'"
      >{{ t('text.receiversCount', { count: receiverCount }) }}<template v-if="receiverCount === 0"> · {{ willQueue ? t('text.deliverOnJoin') : t('text.notDelivered') }}</template></span>
    </div>
  </div>
</template>
