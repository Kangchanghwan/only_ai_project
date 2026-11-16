<script setup>
/**
 * TextItemRow.vue - 한 목록 안의 텍스트 행 (FileCard와 같은 행 모양)
 * - 썸네일 자리에 작은 사각 "텍스트" 태그, 본문은 2줄로 줄여 보여 주고 누르면 펼친다
 * - 복사(남색 채움) + ⋯ 메뉴(삭제). 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 * - 보관 중(10분) 남은 시간/보관 취소, 보관 안 된 내 텍스트 안내, 잠긴 텍스트 풀기는 기존 흐름 그대로
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'

const { t } = useI18n()

const props = defineProps({
  text: { type: Object, required: true }
})

const emit = defineEmits(['remove-text', 'cancel-text', 'unlock-text', 'send-as-file', 'copy-text', 'copy-line'])

const openMenu = ref(false)
const expanded = ref(false)
const lines = computed(() => (typeof props.text.content === 'string' ? props.text.content.split(/\r\n|\r|\n/) : []))
const lineCount = computed(() => lines.value.length)
const isMultiline = computed(() => lineCount.value > 2)

function expiresLabel(text) {
  const minutes = Math.min(10, Math.ceil((text.remainingMs || 0) / 60000))
  return minutes <= 1 ? t('text.expiresSoon') : t('text.expiresIn', { minutes })
}

const unlocking = ref(false)
const unlockPassword = ref('')
const unlockBusy = ref(false)
const unlockMessage = ref('')

function openUnlock() {
  unlocking.value = !unlocking.value
  unlockPassword.value = ''
  unlockMessage.value = ''
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
  <article
    class="text-row flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 sm:gap-3 sm:p-3 rounded-lg border border-border bg-surface"
    data-testid="text-entry"
  >
    <span class="w-11 h-11 -mx-1 shrink-0" aria-hidden="true"></span>
    <span
      class="inline-flex items-center justify-center shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-none bg-tint border border-border text-ink"
      data-testid="text-tag"
    ><svg class="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/></svg><span class="sr-only">{{ t('room.textTab') }}</span></span>

    <div class="flex-1 min-w-[8rem] sm:min-w-0">
      <template v-if="text.content != null">
        <div
          v-if="expanded"
          class="border border-border bg-background max-h-[50vh] overflow-y-auto"
          data-testid="text-lines"
        >
          <div
            v-for="(line, i) in lines"
            :key="i"
            class="group flex items-start gap-1 px-1"
            data-testid="text-line"
          >
            <span class="shrink-0 w-10 pt-1.5 pr-2 text-right text-xs text-text-secondary tabular-nums select-none" aria-hidden="true" data-testid="text-line-no">{{ i + 1 }}</span>
            <span class="flex-1 min-w-0 py-1.5 text-sm text-text-primary whitespace-pre-wrap break-words select-text" data-testid="text-line-body">{{ line }}</span>
            <button
              v-if="line.trim() !== ''"
              type="button"
              class="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-none bg-transparent border-0 text-ink hover:bg-tint cursor-pointer opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 focus-visible:!opacity-100"
              :aria-label="t('room.copy')"
              :title="t('room.copy')"
              data-testid="text-line-copy"
              @click.stop="emit('copy-line', line)"
            ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
            <span v-else class="shrink-0 w-9" aria-hidden="true"></span>
          </div>
        </div>
        <p
          v-else
          class="m-0 text-sm text-text-primary whitespace-pre-wrap break-words cursor-pointer line-clamp-2"
          data-testid="text-body"
          @click="expanded = true"
        >{{ text.content }}</p>
        <button
          v-if="isMultiline || expanded"
          type="button"
          class="mt-1 min-h-[44px] sm:min-h-[32px] px-0 inline-flex items-center gap-1 bg-transparent border-0 text-xs font-bold text-ink cursor-pointer whitespace-nowrap"
          :aria-expanded="expanded"
          :data-testid="expanded ? 'text-collapse' : 'text-expand'"
          @click="expanded = !expanded"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="expanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'"/></svg>
          <span>{{ expanded ? t('text.collapse') : t('text.expandLines', { n: lineCount }) }}</span>
        </button>
      </template>
      <!-- 잠긴 텍스트: 이 범위 비밀번호를 확인한 기기에서만 내용이 보인다 -->
      <div v-else data-testid="text-locked">
        <p class="m-0 text-sm text-text-secondary inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <span class="font-semibold text-text-primary">{{ t('text.lockedTitle') }}</span>
        </p>
        <p class="m-0 text-xs text-text-secondary">{{ t('text.lockedHint') }}</p>
      </div>
      <p class="flex flex-wrap items-center gap-x-1 text-xs text-text-secondary mt-0.5 m-0 min-w-0 overflow-hidden" data-testid="text-meta">
        <SenderLabel v-if="text.sender" :sender="text.sender" :time="text.timestamp" class="shrink min-w-0" />
        <span v-else data-testid="text-time">{{ formatTime(text.timestamp) }}</span>
      </p>
    </div>

    <div class="flex items-center gap-2 shrink-0 ml-auto">
      <button
        v-if="text.content != null"
        type="button"
        class="shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-none bg-ink text-on-ink text-sm font-extrabold inline-flex items-center justify-center gap-1"
        :aria-label="t('room.copy')"
        data-testid="text-copy"
        @click="$emit('copy-text', text.id)"
      ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="hidden sm:inline">{{ t('room.copy') }}</span></button>
      <button
        v-else
        type="button"
        class="shrink-0 min-h-[44px] px-4 rounded-none bg-ink text-on-ink text-sm font-extrabold"
        :aria-expanded="unlocking"
        data-testid="text-unlock-open"
        @click="openUnlock"
      >{{ t('text.unlock') }}</button>
      <div class="relative">
        <button
          type="button"
          class="shrink-0 w-11 h-11 flex items-center justify-center rounded-none border border-border bg-background text-text-primary"
          :title="t('file.moreActions')"
          :aria-label="t('file.moreActions')"
          :aria-expanded="openMenu"
          data-testid="text-more"
          @click="openMenu = !openMenu"
        ><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button>
        <div v-if="openMenu" class="absolute right-0 top-full z-20 bg-surface border-2 border-ink min-w-[8rem]">
          <button
            type="button"
            class="w-full min-h-[44px] px-4 text-left text-sm text-red-500"
            data-testid="text-delete"
            @click="openMenu = false; $emit('remove-text', text.id)"
          >{{ t('text.delete') }}</button>
        </div>
      </div>
    </div>

    <form v-if="unlocking && text.content == null" class="basis-full flex items-center gap-2" data-testid="text-unlock-form" @submit.prevent="submitUnlock">
      <input
        v-model="unlockPassword"
        type="password"
        autocomplete="off"
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

    <!-- 보관 중(10분): 남은 시간 + 보관 취소 -->
    <footer v-if="text.expiresAt" class="basis-full flex items-center justify-between gap-2" data-testid="text-queued">
      <span class="text-xs text-text-secondary tabular-nums" data-testid="text-expires">{{ expiresLabel(text) }}</span>
      <button
        v-if="text.canCancel"
        type="button"
        class="min-h-[44px] px-3 text-xs font-semibold text-text-secondary"
        data-testid="text-cancel-keep"
        @click="$emit('cancel-text', text.id)"
      >{{ t('text.cancelKeep') }}</button>
    </footer>
    <!-- 내가 보냈지만 보관되지 않은 텍스트: 지금 열린 기기에만 갔다 -->
    <footer v-else-if="text.notStored" class="basis-full flex items-center justify-between gap-2 flex-wrap" data-testid="text-not-kept">
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
