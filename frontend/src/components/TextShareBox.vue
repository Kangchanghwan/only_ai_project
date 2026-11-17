<script setup>
/**
 * TextShareBox.vue - 텍스트 공유
 * - 직접 입력(textarea) + 공유 버튼, 보이는 붙여넣기 버튼
 * - 입력 중인 textarea에 붙여넣은 내용은 자동 전송되지 않고 일반 입력으로 남는다(App의 전역 paste 핸들러가 편집 가능 요소는 무시)
 * - 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 * - 보관 방식 박스 하나: 평문/암호문 중 무엇으로 10분 보관하는지 + 받을 기기 수(0대면 들어오면 전달/전달 안 됨)
 *  . 보낸 직후 성공 문장은 화면에 고정하지 않는다(토스트·카드의 남은 시간으로 충분)
 * - 받은 텍스트 목록은 TextItemRow가 파일과 같은 한 목록(FileGallery)에서 그린다
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { isPrivateScope } from '../composables/useShareScope'
import { useScopeAccent } from '../composables/useScopeAccent'
import { formatSizeMB } from '../utils/fileUtils'
import PasteSection from './PasteSection.vue'
import LockChip from './LockChip.vue'
import LockBar from './LockBar.vue'

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
  /** 서버 연결 전, 지난번 받을 기기 수(1 이상). 있으면 연결 전의 '받을 기기 0대'를 그리지 않아 연결 뒤 줄이 바뀌지 않게 한다 */
  receiverHint: { type: Number, default: null },
  /** 보내는 텍스트의 보관 방식: private(1:1 방 키) | locked(범위 잠금) | plain(평문) | none(보관 안 함) */
  storageMode: { type: String, default: 'none' },
  /** 이 범위의 한 목록(파일+텍스트)에 항목이 있는지: 없으면 입력 영역을 크게 */
  hasItems: { type: Boolean, default: false }
})

const emit = defineEmits(['share-text', 'upload-files', 'paste-content'])

const { bg: accentBg } = useScopeAccent(() => props.scope)
const isPrivate = computed(() => isPrivateScope(props.scope))
const maxFileSizeMB = computed(() => import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120)

// 파일 올리기: 상자 전체가 드롭 대상
const fileInputRef = ref(null)
const isDragging = ref(false)
let dragDepth = 0

function openFileDialog() {
  fileInputRef.value?.click()
}

function handleFileSelect(event) {
  const files = event.target.files
  if (files && files.length > 0) {
    emit('upload-files', Array.from(files))
    // 같은 파일을 다시 고를 수 있게 초기화
    event.target.value = ''
  }
}

/** 파일을 끌고 있을 때만 반응한다(글자를 끌어다 입력란에 놓는 동작은 그대로 둔다) */
function isFileDrag(event) {
  const types = event.dataTransfer?.types
  return !types || Array.from(types).includes('Files')
}

function handleDragEnter(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  isDragging.value = true
}

function handleDragOver(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) isDragging.value = false
}

function handleDrop(event) {
  dragDepth = 0
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    event.preventDefault()
    emit('upload-files', Array.from(files))
  }
}

const willQueue = computed(() => props.storageMode !== 'none')
const storageLabel = computed(() => (props.storageMode === 'none' ? t('text.storageNone') : t('text.keepLine')))


const draft = ref('')
// 잠금 비밀번호 입력 줄이 열려 있으면 좁은 화면에서도 도구 줄이 줄바꿈된다
const lockEditing = ref(false)
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
watch(() => props.hasItems, () => nextTick(autoGrow))

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
    <!-- 통합 보내기 상자: 위는 입력란, 아래는 도구 줄. 상자 전체가 파일 드롭 대상 -->
    <div
      class="relative rounded-none border-2 border-ink bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-ink"
      data-testid="send-box"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <LockBar v-if="!isPrivate" :scope="scope" :text-locked="storageMode !== 'none'" />
      <form class="contents" id="text-compose-form" data-testid="text-compose" @submit.prevent="submit">
        <label class="sr-only" for="text-share-input">{{ t('text.share') }}</label>
        <textarea
          id="text-share-input"
          ref="inputRef"
          v-model="draft"
          rows="1"
          class="block w-full min-w-0 max-h-[150px] resize-none overflow-y-auto rounded-none border-0 outline-none text-text-primary text-sm px-3 py-3 leading-5 placeholder:text-text-secondary"
          :class="hasItems ? 'min-h-[48px] bg-surface' : 'min-h-[100px] sm:min-h-[140px] bg-tint'"
          :placeholder="t('send.placeholder')"
          :title="t('text.autoShareHint')"
          :aria-label="t('text.share')"
          data-testid="text-input"
          :disabled="composeDisabled"
          @keydown="onKeydown"
        ></textarea>
      </form>

      <!-- 도구 줄: 파일 선택 · 붙여넣기 · 잠금 · 공유 (모바일은 두 줄) -->
      <div class="flex items-center gap-1.5 sm:gap-2 p-2 border-t border-border" :class="lockEditing ? 'flex-wrap' : 'flex-nowrap sm:flex-wrap'" data-testid="send-toolbar">
        <input ref="fileInputRef" type="file" multiple class="sr-only" tabindex="-1" :aria-label="t('file.inputLabel')" data-testid="file-input" @change="handleFileSelect" @click.stop />
        <button
          type="button"
          class="order-1 min-w-[44px] max-sm:[container-type:inline-size] flex-1 sm:flex-none min-h-[44px] px-2 sm:px-4 rounded-none text-on-accent font-extrabold text-sm whitespace-nowrap inline-flex items-center justify-center gap-2"
          :class="accentBg"
          data-testid="choose-files"
          :aria-label="t('file.chooseFiles')"
          @click="openFileDialog"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span class="truncate max-sm:@max-[4rem]:hidden min-w-0">{{ t('file.chooseFiles') }}</span>
        </button>
        <button
          type="submit"
          form="text-compose-form"
          class="order-4 shrink-0 sm:ml-auto min-h-[44px] px-3 sm:px-6 rounded-none bg-ink text-on-ink font-extrabold text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          :class="{ 'inline-flex items-center gap-1.5': storageMode === 'locked' }"
          :disabled="composeDisabled || !draft.trim() || sending"
          :title="t('send.shortcutHint')"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          :data-locked="storageMode === 'locked' ? 'true' : undefined"
          data-testid="text-share-button"
        ><template v-if="storageMode === 'locked'"><svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><span class="max-[359px]:hidden" data-testid="share-label-full">{{ t('lock.confirmLockedSend') }}</span><span class="hidden max-[359px]:inline" data-testid="share-label-short">{{ t('file.share') }}</span></template><template v-else>{{ t('file.share') }}</template></button>
        <!-- 모바일 줄바꿈: 첫 줄은 파일 선택 + 공유 -->
        <PasteSection class="order-2 shrink-0" :scope="scope" @paste-content="emit('paste-content')" />
        <LockChip v-if="!isPrivate" :scope="scope" class="order-3 shrink-0" @editing="lockEditing = $event" />
        <p v-else class="order-3 shrink-0 text-xs text-scope-private m-0 min-w-[44px] min-h-[44px] sm:min-h-0 inline-flex items-center justify-center sm:justify-start" :title="t('pair.uploadHint')" data-testid="private-upload-hint"><svg class="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span class="sr-only sm:not-sr-only">{{ t('pair.uploadHint') }}</span></p>
      </div>

      <!-- 파일을 끌어 올려 둘 때 -->
      <div
        v-if="isDragging"
        class="absolute inset-0 z-10 pointer-events-none flex items-center justify-center text-center px-4 rounded-none border-2 border-dashed border-ink bg-tint/95 text-ink font-extrabold text-base"
        data-testid="send-drop-overlay"
      >{{ t('dropOverlay.title') }}</div>
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
    <!-- 상자 아래 작은 한 줄: 보관 기간 · 파일 한도 (받을 기기가 없을 때만 전달 안내를 덧붙인다) -->
    <div class="mt-2 text-xs text-text-secondary" data-testid="text-storage" :data-mode="storageMode">
      <template v-if="!composeDisabled">
        <span data-testid="text-storage-label">{{ storageLabel }}</span>
        <span aria-hidden="true"> · </span>
      </template>
      <span data-testid="upload-limit">{{ t('file.limitShort', { size: formatSizeMB(maxFileSizeMB) }) }}</span>
      <span
        v-if="!composeDisabled && receiverCount === 0 && !(receiverHint > 0)"
        class="tabular-nums"
        :class="{ 'font-semibold text-text-primary': !willQueue }"
        data-testid="text-receivers"
        :data-state="willQueue ? 'queued' : 'nobody'"
      > · {{ t('text.receiversCount', { count: 0 }) }} · {{ willQueue ? t('text.deliverOnJoin') : t('text.notDelivered') }}</span>
    </div>
  </div>
</template>
