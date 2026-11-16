<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import FileCard from './FileCard.vue'
import LockedFileCard from './LockedFileCard.vue'
import TextItemRow from './TextItemRow.vue'
import { useI18n } from 'vue-i18n'
import FileUploadSection from './FileUploadSection.vue'
import PasteSection from './PasteSection.vue'
import TransferProgress from './TransferProgress.vue'
import DownloadControls from './DownloadControls.vue'
import MultiFileQRCodeModal from './MultiFileQRCodeModal.vue'
import { createEnterStagger } from '../utils/enterStagger'
import { trackEvent } from '../utils/analytics'
import { isPrivateScope } from '../composables/useShareScope'

const props = defineProps({
  /** 받은 텍스트: 파일과 한 목록에 시간순(최신 먼저)으로 섞어 보여 준다. 선택·일괄 작업 대상은 아니다 */
  texts: {
    type: Array,
    default: () => []
  },
  files: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  roomId: {
    type: String,
    required: true
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  scope: {
    type: String,
    default: 'ip'
  },
  /** 진행 중인 업로드/다운로드 (App.vue가 관리). 보내기 영역 바로 아래에 inline으로 그린다 */
  uploads: {
    type: Map,
    default: () => new Map()
  }
})

const emit = defineEmits([
  'copy-image',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'delete-file',
  'delete-selected',
  'clear-storage',
  'upload-files',
  'paste-content',
  'load-more',
  'cancel-upload',
  'cancel-all',
  'remove-text',
  'cancel-text',
  'unlock-text',
  'send-as-file',
  'clear-all-texts',
  'copy-text'
])

const { t } = useI18n()

function toMs(v) {
  if (typeof v === 'number') return v
  const n = Date.parse(v)
  return Number.isNaN(n) ? 0 : n
}

/**
 * 파일(created)과 텍스트(timestamp)를 한 목록으로: 최신 먼저.
 * 파일은 받은 순서(이미 최신 먼저)를 그대로 두고, 텍스트만 시각순으로 정렬해 두 줄을 합친다(안정 병합)
 */
const items = computed(() => {
  const fs = props.files.map((file) => ({ kind: 'file', key: 'file:' + fileKey(file), ts: toMs(file.created), file }))
  const ts = props.texts
    .map((text, i) => ({ kind: 'text', key: 'text:' + text.id, ts: toMs(text.timestamp), i, text }))
    .sort((a, b) => b.ts - a.ts || a.i - b.i)
  const out = []
  let i = 0
  let j = 0
  while (i < fs.length || j < ts.length) {
    if (j >= ts.length || (i < fs.length && fs[i].ts >= ts[j].ts)) out.push(fs[i++])
    else out.push(ts[j++])
  }
  return out
})
const hasItems = computed(() => props.files.length > 0 || props.texts.length > 0)

const selectedFiles = ref(new Set())
const showMultiQRModal = ref(false)

const nextEnterDelay = createEnterStagger()

function onCardBeforeEnter(el) {
  el.style.transitionDelay = `${nextEnterDelay()}ms`
}

// 같은 파일명이 다른 룸에 동시에 존재할 수 있으므로 roomId+name 복합 키로 선택을 추적한다
// (useFileManager.js의 mergeAndSort와 동일한 dedup 키 규칙).
function fileKey(file) {
  return `${file.roomId}::${file.name}`
}

// 방: 파일이 전부 방 키로 잠겨 있고 방의 모든 기기가 그 키를 가진다.
// 그래서 잠긴 파일도 선택해서 한꺼번에 지우고 받을 수 있다(받기는 이 기기에서 풀어 ZIP으로). QR·복사·비우기는 공개 URL 기준이라 숨긴다
const isPrivate = computed(() => isPrivateScope(props.scope))

// 그 밖의 범위에서 잠긴 파일은 선택(일괄 받기·QR·복사) 대상이 아니다. 비밀번호로 하나씩 푼다
const selectableFiles = computed(() =>
  isPrivate.value ? props.files : props.files.filter(file => !file.locked)
)

// 선택된 파일 배열 (지금 목록에서 선택 가능한 파일만: 지워졌거나 범위가 바뀐 파일의 키는 세지 않는다)
const selectedFilesArray = computed(() => {
  return selectableFiles.value.filter(file => selectedFiles.value.has(fileKey(file)))
})

// 선택된 파일 개수
const selectedCount = computed(() => selectedFilesArray.value.length)

// 범위(탭)를 바꾸면 선택을 비운다
watch(() => props.scope, () => {
  selectedFiles.value = new Set()
})

// 모든 파일이 선택되었는지 확인
const allFilesSelected = computed(() => {
  return selectableFiles.value.length > 0 && selectedCount.value === selectableFiles.value.length
})

// 파일 선택/해제
function toggleFileSelection(file) {
  const key = fileKey(file)
  if (selectedFiles.value.has(key)) {
    selectedFiles.value.delete(key)
  } else {
    selectedFiles.value.add(key)
  }
  // Set은 반응성을 위해 새 객체로 교체
  selectedFiles.value = new Set(selectedFiles.value)
}

// 전체 선택/해제
function toggleSelectAll() {
  if (allFilesSelected.value) {
    // 전체 해제
    selectedFiles.value = new Set()
  } else {
    // 전체 선택
    selectedFiles.value = new Set(selectableFiles.value.map(fileKey))
  }
}

// 다중 QR 공유는 한 룸의 파일만 포함할 수 있다 (?r={roomId} 단일 룸 기준 다운로드 링크이므로).
// 선택이 여러 룸에 걸쳐 있으면 첫 번째 선택 파일의 룸으로 좁혀서 깨진 링크를 방지한다.
const multiQRRoomId = computed(() => selectedFilesArray.value[0]?.roomId || props.roomId)
const multiQRFiles = computed(() =>
  selectedFilesArray.value.filter(file => file.roomId === multiQRRoomId.value)
)

// 병렬 다운로드
function downloadParallel() {
  if (selectedCount.value > 0) {
    emit('download-parallel', selectedFilesArray.value)
  }
}

// QR 코드 모달 열기
function showQRModal() {
  if (isPrivate.value) return
  if (selectedCount.value > 0) {
    showMultiQRModal.value = true
    trackEvent('qr_open', { qr_type: 'multi_file', file_count: selectedCount.value })
  }
}

// Ctrl+C 키보드 이벤트 핸들러
function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    if (isPrivate.value) return
    if (selectedCount.value > 0) {
      emit('copy-selected-to-clipboard', selectedFilesArray.value)
    }
  }
}

// 라이프사이클 훅
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div>
    <!-- 다운로드 컨트롤 버튼 (파일이 있고 로딩 중이 아닐 때) -->
    <DownloadControls
      v-if="files.length > 0 && !isLoading"
      :selected-count="selectedCount"
      :total-count="selectableFiles.length"
      :all-selected="allFilesSelected"
      :scope="scope"
      :private-mode="isPrivate"
      @download-parallel="downloadParallel"
      @toggle-select-all="toggleSelectAll"
      @show-multi-qr="showQRModal"
      @delete-selected="$emit('delete-selected', selectedFilesArray)"
      @clear-storage="$emit('clear-storage')"
    />

    <!-- 보내기: 파일 선택(primary) + 붙여넣기(secondary, compact) -->
    <slot name="send">
      <div class="flex flex-col gap-3 mb-2" data-testid="send-area">
        <FileUploadSection :scope="scope" :compact="hasItems" @upload-files="$emit('upload-files', $event)">
          <PasteSection :scope="scope" @paste-content="$emit('paste-content')" />
        </FileUploadSection>
      </div>
    </slot>

    <!-- 한 줄 텍스트 입력: 업로드 영역 바로 아래 -->
    <div v-if="$slots.composer" class="mb-2" data-testid="composer-area"><slot name="composer" /></div>

    <!-- 진행 상황: 보내기 영역 바로 아래 inline (업로드·다운로드 공통) -->
    <TransferProgress
      :uploads="uploads"
      @cancel-upload="$emit('cancel-upload', $event)"
      @cancel-all="$emit('cancel-all')"
    />

    <!-- 로딩 중일 때 스피너 표시 -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <div class="w-12 h-12 border-4 border-border border-t-primary rounded-full animate-spin"></div>
    </div>

    <!-- 한 목록: 파일과 텍스트를 시간순(최신 먼저)으로 (로딩 중이 아닐 때) -->
    <div v-else class="flex flex-col gap-2" :class="{ 'mt-4': hasItems }" data-testid="unified-list">
      <div v-if="texts.length > 0" class="flex justify-end -mb-1">
        <button
          type="button"
          class="min-h-[44px] px-3 text-xs text-text-secondary hover:text-ink inline-flex items-center gap-1.5"
          data-testid="texts-clear-all"
          @click="$emit('clear-all-texts')"
        ><svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>{{ t('text.clearAll') }}</button>
      </div>
      <TransitionGroup name="card-land" @before-enter="onCardBeforeEnter">
        <template v-for="item in items">
          <TextItemRow
            v-if="item.kind === 'text'"
            :key="item.key"
            :text="item.text"
            @remove-text="$emit('remove-text', $event)"
            @cancel-text="$emit('cancel-text', $event)"
            @unlock-text="$emit('unlock-text', $event)"
            @send-as-file="$emit('send-as-file', $event)"
            @copy-text="$emit('copy-text', $event)"
          />
          <LockedFileCard
            v-else-if="item.file.locked"
            :key="'locked:' + fileKey(item.file)"
            :file="item.file"
            :scope="scope"
            :selectable="isPrivate"
            :is-selected="isPrivate && selectedFiles.has(fileKey(item.file))"
            @toggle-selection="toggleFileSelection(item.file)"
            @delete-file="$emit('delete-file', item.file)"
          />
          <FileCard
            v-else
            :key="item.key"
            :file="item.file"
            :is-selected="selectedFiles.has(fileKey(item.file))"
            :scope="scope"
            @copy-image="$emit('copy-image', item.file.url)"
            @toggle-selection="toggleFileSelection(item.file)"
            @download-file="$emit('download-file', item.file)"
            @delete-file="$emit('delete-file', item.file)"
          />
        </template>
      </TransitionGroup>
    </div>

    <!-- 더 보기 버튼 -->
    <div v-if="hasMore && !isLoading" class="flex justify-center mt-8">
      <button
        @click="$emit('load-more')"
        class="min-h-[44px] px-6 py-3 bg-primary text-white font-medium rounded-lg transition-opacity duration-200 hover:opacity-90"
      >
        {{ $t('fileGallery.loadMore') }}
      </button>
    </div>

    <!-- 다중 파일 QR 코드 모달 -->
    <MultiFileQRCodeModal
      :files="multiQRFiles"
      :room-id="multiQRRoomId"
      :is-open="showMultiQRModal"
      @close="showMultiQRModal = false"
    />
  </div>
</template>

<style scoped>
.card-land-enter-active {
  transition: transform 350ms cubic-bezier(.34, 1.56, .64, 1), opacity 350ms cubic-bezier(.34, 1.56, .64, 1);
}

.card-land-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.85);
}

@media (prefers-reduced-motion: reduce) {
  .card-land-enter-active {
    transition: none;
  }
}
</style>
