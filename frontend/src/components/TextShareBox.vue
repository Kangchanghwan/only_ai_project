<script setup>
/**
 * TextShareBox.vue - 텍스트 공유
 * - 직접 입력(textarea) + 공유 버튼, 보이는 붙여넣기 버튼
 * - 입력 중인 textarea에 붙여넣은 내용은 자동 전송되지 않고 일반 입력으로 남는다(App의 전역 paste 핸들러가 편집 가능 요소는 무시)
 * - 모든 본문은 텍스트 노드로만 렌더링한다 (v-html 사용 금지)
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'
import SenderLabel from './SenderLabel.vue'

const { t } = useI18n()

const props = defineProps({
  texts: { type: Array, required: true, default: () => [] },
  scope: { type: String, default: 'ip' }
})

const emit = defineEmits(['remove-text', 'clear-all', 'copy-text', 'share-text', 'paste-content'])

const { bg: accentBg, hoverText: accentHoverText, hoverBorder50: accentHoverBorder50 } = useScopeAccent(() => props.scope)

const draft = ref('')
const sending = ref(false)
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
    if (ok) draft.value = ''
  }
  emit('share-text', { content, done })
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
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
        v-model="draft"
        rows="4"
        class="w-full min-h-[6rem] resize-y rounded-xl border border-border bg-background text-text-primary text-sm p-3 font-mono focus-visible:outline-2 focus-visible:outline-primary"
        :placeholder="t('text.composePlaceholder')"
        data-testid="text-input"
        @keydown="onKeydown"
      ></textarea>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          class="min-h-[44px] px-6 rounded-full text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          :class="accentBg"
          :disabled="!draft.trim() || sending"
          data-testid="text-share-button"
        >{{ t('file.share') }}</button>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full border border-border bg-background text-sm font-semibold text-text-primary"
          data-testid="text-paste-button"
          @click="emit('paste-content')"
        >📋 {{ t('clipboard.pasteTitle') }}</button>
      </div>
      <p class="text-xs text-text-secondary m-0">{{ t('text.autoShareHint') }} {{ t('text.inputPasteHint') }}</p>
    </form>

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
        <pre class="text-text-primary text-sm font-mono whitespace-pre-wrap break-words m-0" data-testid="text-body">{{ text.content }}</pre>
      </article>
    </div>
  </div>
</template>
