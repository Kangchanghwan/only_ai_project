<script setup>
/**
 * TextItemRow.vue - 한 목록 안의 텍스트 행 (FileCard와 같은 행 모양)
 * - 접힌 모양은 FileCard와 같다: 사각 썸네일 자리(텍스트 아이콘), 한 줄 제목(첫 줄), 메타 줄(보낸 사람 · 시간 · 삭제 시각 · 더보기)
 * - 더보기를 눌러야 행이 늘어나며 전체 본문을 보여 준다
 * - 복사(남색 채움) + ⋯ 메뉴(삭제). 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 * - 보관 중(10분) 남은 시간/보관 취소, 보관 안 된 내 텍스트 안내, 잠긴 텍스트 풀기는 기존 흐름 그대로
 */
import { ref, computed, watch, nextTick, onMounted, onUpdated, onUnmounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'

const { t } = useI18n()

const props = defineProps({
  text: { type: Object, required: true }
})

const emit = defineEmits(['remove-text', 'cancel-text', 'unlock-text', 'send-as-file', 'copy-text'])

const openMenu = ref(false)
const menuRoot = ref(null)
const moreBtn = ref(null)
// 열려 있을 때만 문서 리스너를 둔다: 바깥을 누르거나 Esc면 닫힌다(다른 행의 ⋯를 눌러도 닫히므로 한 번에 하나만 열린다)
const onMenuDown = (e) => { if (menuRoot.value && !menuRoot.value.contains(e.target)) openMenu.value = false }
const onMenuKey = (e) => {
  if (e.key !== 'Escape') return
  openMenu.value = false
  moreBtn.value?.focus()
}
watch(openMenu, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onMenuDown)
    document.addEventListener('keydown', onMenuKey)
  } else {
    document.removeEventListener('pointerdown', onMenuDown)
    document.removeEventListener('keydown', onMenuKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onMenuDown)
  document.removeEventListener('keydown', onMenuKey)
})
const expanded = ref(false)
const lines = computed(() => (typeof props.text.content === 'string' ? props.text.content.split(/\r\n|\r|\n/) : []))
/** 제목 줄: 비어 있지 않은 첫 줄 */
const firstLine = computed(() => (lines.value.find((l) => l.trim() !== '') ?? '').trim())
const hasMoreLines = computed(() => lines.value.filter((l) => l.trim() !== '').length > 1)
// 줄바꿈이 없어도 첫 줄이 길어 잘리면 더보기를 보여 준다
const titleRef = ref(null)
const truncated = ref(false)
function measureOverflow() {
  const el = titleRef.value
  truncated.value = !!el && el.scrollWidth > el.clientWidth
}
onMounted(() => {
  measureOverflow()
  window.addEventListener('resize', measureOverflow)
})
onUpdated(measureOverflow)
onUnmounted(() => window.removeEventListener('resize', measureOverflow))
const canExpand = computed(() => props.text.content != null && (hasMoreLines.value || truncated.value))

const toggleable = computed(() => props.text.content != null && (canExpand.value || expanded.value))
function onRowClick(event) {
  if (!toggleable.value) return
  const el = event.target
  if (el.closest && el.closest('button, a, input, textarea, select, form, footer, [role="menu"], [data-testid="text-expanded"], [data-testid="text-menu"]')) return
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
  if (sel && sel.toString().length > 0) return
  expanded.value = !expanded.value
}

function expiresLabel(text) {
  const minutes = Math.min(10, Math.ceil((text.remainingMs || 0) / 60000))
  return minutes <= 1 ? t('text.expiresSoon') : t('text.expiresIn', { minutes })
}

const unlocking = ref(false)
const unlockPassword = ref('')
const unlockBusy = ref(false)
const unlockMessage = ref('')

const unlockInput = ref(null)
async function openUnlock() {
  unlocking.value = !unlocking.value
  unlockPassword.value = ''
  unlockMessage.value = ''
  if (unlocking.value) {
    await nextTick()
    unlockInput.value?.focus()
  }
}

function submitUnlock() {
  if (!unlockPassword.value || unlockBusy.value) return
  unlockBusy.value = true
  unlockMessage.value = ''
  emit('unlock-text', {
    id: props.text.id,
    password: unlockPassword.value,
    done: (res) => {
      unlockBusy.value = false
      if (res?.ok) {
        unlocking.value = false
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
  <!-- 접힌 행은 FileCard의 행과 같은 모양: 더보기를 눌러야 아래로 늘어난다 -->
  <article
    class="text-row file-row flex items-center gap-1.5 p-2 sm:gap-3 sm:p-3 rounded-none border border-border bg-surface transition-colors duration-200"
    :class="[expanded ? 'flex-wrap' : 'flex-nowrap', toggleable ? 'cursor-pointer' : '']"
    data-testid="text-entry"
    @click="onRowClick"
  >
    <div
      class="w-8 h-8 sm:w-10 sm:h-10 rounded-none flex items-center justify-center flex-shrink-0 bg-tint text-ink"
      :data-locked="text.locked ? 'true' : undefined"
      data-testid="text-tag"
    ><svg v-if="text.locked" class="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><svg v-else class="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/></svg><span class="sr-only">{{ t('room.textTab') }}</span></div>

    <div class="file-info flex-1 min-w-0">
      <p
        v-if="text.content != null"
        ref="titleRef"
        class="file-name text-sm font-medium text-text-primary truncate m-0"
        :title="firstLine"
        data-testid="text-title"
      >{{ firstLine }}</p>
      <!-- 잠긴 텍스트: 이 범위 비밀번호를 확인한 기기에서만 내용이 보인다 -->
      <p v-else class="file-name text-sm font-medium text-text-primary truncate m-0 inline-flex items-center gap-1 max-w-full" :title="t('text.lockedHint')" data-testid="text-locked">
        <span class="truncate">{{ t('text.lockedTitle') }}</span>
        <span class="sr-only">{{ t('text.lockedHint') }}</span>
      </p>
      <p class="file-meta flex flex-nowrap items-center gap-x-1 truncate text-xs text-text-secondary mt-0.5 m-0 min-w-0 overflow-hidden" data-testid="text-meta">
        <span v-if="text.locked && text.content != null" data-testid="text-lock-tag" class="max-[359px]:hidden shrink-0 inline-flex items-center border border-ink text-ink text-[10px] leading-4 font-bold px-1 rounded-[2px] whitespace-nowrap">{{ t('lock.tag') }}</span>
        <SenderLabel v-if="text.sender" :sender="text.sender" :time="text.timestamp" class="shrink min-w-0" />
        <span v-else class="whitespace-nowrap" data-testid="text-time">{{ formatTime(text.timestamp) }}</span>
        <template v-if="text.expiresAt">
          <span aria-hidden="true">·</span>
          <span class="whitespace-nowrap tabular-nums" data-testid="text-expires">{{ expiresLabel(text) }}</span>
        </template>
        <template v-if="canExpand && !expanded">
          <span aria-hidden="true">·</span>
          <button
            type="button"
            class="p-0 bg-transparent border-0 text-xs font-bold text-ink cursor-pointer whitespace-nowrap"
            :aria-expanded="false"
            data-testid="text-expand"
            @click="expanded = true"
          >{{ t('text.showMore') }}</button>
        </template>
      </p>
    </div>

    <div class="file-actions flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
      <button
        v-if="text.content != null"
        type="button"
        class="download-btn shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-none bg-ink text-on-ink text-sm font-extrabold inline-flex items-center justify-center gap-1"
        :aria-label="t('room.copy')"
        data-testid="text-copy"
        @click="$emit('copy-text', text.id)"
      ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="hidden sm:inline">{{ t('room.copy') }}</span></button>
      <button
        v-else
        type="button"
        class="download-btn shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-none bg-ink text-on-ink text-sm font-extrabold inline-flex items-center justify-center gap-1"
        :aria-expanded="unlocking"
        data-testid="text-unlock-open"
        @click="openUnlock"
      >{{ t('text.unlock') }}</button>
      <div ref="menuRoot" class="relative">
        <button
          ref="moreBtn"
          type="button"
          class="more-btn shrink-0 w-11 h-11 flex items-center justify-center rounded-none border border-border bg-background text-text-primary"
          :title="t('file.moreActions')"
          :aria-label="t('file.moreActions')"
          :aria-expanded="openMenu"
          data-testid="text-more"
          @click="openMenu = !openMenu"
        ><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button>
        <div v-if="openMenu" role="menu" data-testid="text-menu" class="absolute right-0 top-full z-20 bg-surface border-2 border-ink min-w-[8rem]">
          <button
            v-if="text.expiresAt && text.canCancel"
            type="button"
            role="menuitem"
            class="w-full min-h-[44px] px-4 text-left text-sm text-text-primary whitespace-nowrap"
            data-testid="text-cancel-keep"
            @click="openMenu = false; $emit('cancel-text', text.id)"
          >{{ t('text.cancelKeep') }}</button>
          <button
            type="button"
            role="menuitem"
            class="w-full min-h-[44px] px-4 text-left text-sm text-red-500"
            data-testid="text-delete"
            @click="openMenu = false; $emit('remove-text', text.id)"
          >{{ t('text.delete') }}</button>
        </div>
      </div>
    </div>

    <!-- 펼친 상태: 행 아래로 전체 본문 + 접기 -->
    <div v-if="expanded && text.content != null" class="basis-full min-w-0 pl-[2.375rem] sm:pl-[3.25rem]" data-testid="text-expanded">
      <p
        class="m-0 p-3 text-sm text-text-primary whitespace-pre-wrap break-words select-text max-h-[60vh] overflow-y-auto border border-border bg-background"
        data-testid="text-body"
      >{{ text.content }}</p>
      <button
        type="button"
        class="mt-1 min-h-[44px] sm:min-h-[32px] px-0 inline-flex items-center gap-1 bg-transparent border-0 text-xs font-bold text-ink cursor-pointer whitespace-nowrap"
        :aria-expanded="true"
        data-testid="text-collapse"
        @click="expanded = false"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
        <span>{{ t('text.collapse') }}</span>
      </button>
    </div>

    <form v-if="unlocking && text.content == null" class="basis-full flex items-center gap-2" data-testid="text-unlock-form" @submit.prevent="submitUnlock">
      <input
        v-model="unlockPassword"
        ref="unlockInput"
        type="password"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        class="flex-1 min-w-0 min-h-[44px] rounded-none border border-border bg-background text-text-primary text-sm px-4 focus-visible:outline-2 focus-visible:outline-ink"
        :placeholder="t('text.passwordPlaceholder')"
        :aria-label="t('text.passwordPlaceholder')"
        data-testid="text-unlock-password"
      />
      <button
        type="submit"
        class="min-h-[44px] px-4 rounded-none border-2 border-ink text-ink hover:bg-tint text-sm font-bold disabled:opacity-50"
        :disabled="!unlockPassword || unlockBusy"
        data-testid="text-unlock-submit"
      >{{ unlockBusy ? '…' : t('text.unlock') }}</button>
    </form>
    <p v-if="unlocking && unlockMessage" class="basis-full m-0 text-xs text-red-500" role="alert" data-testid="text-unlock-message">{{ unlockMessage }}</p>

    <!-- 내가 보냈지만 보관되지 않은 텍스트: 지금 열린 기기에만 갔다 -->
    <footer v-if="!text.expiresAt && text.notStored" class="basis-full flex items-center justify-between gap-2 flex-wrap" data-testid="text-not-kept">
      <span class="text-xs font-semibold text-text-primary">{{ text.notStored === 'TOO_LARGE' ? t('text.notKeptTooLarge') : t('text.notKeptFull') }}</span>
      <button
        v-if="text.notStored === 'TOO_LARGE' && text.content != null"
        type="button"
        class="min-h-[44px] px-3 rounded-none border-2 border-ink text-ink hover:bg-tint text-xs font-bold"
        data-testid="text-send-as-file"
        @click="$emit('send-as-file', text.id)"
      >{{ t('text.sendAsFile') }}</button>
    </footer>
  </article>
</template>
