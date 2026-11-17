<script setup>
/**
 * HelpModal.vue - 사용 방법 안내 모달
 *
 * 애플리케이션의 주요 기능과 사용 방법을 설명하는 모달 컴포넌트
 */
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { FEEDBACK_FORM_URL } from '../constants/feedback.js'
import { trapTab } from '../utils/focusTrap'
import { trackEvent } from '../utils/analytics.js'

const { t } = useI18n()

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['close'])

const dialogRef = ref(null)
const closeBtnRef = ref(null)
let previousFocus = null

// 열릴 때 닫기 버튼으로 포커스, 닫히면 열기 직전 요소로 복귀
watch(() => props.isOpen, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    closeBtnRef.value?.focus()
  } else if (previousFocus) {
    const el = previousFocus
    previousFocus = null
    if (el.isConnected) el.focus()
  }
})

const currentYear = new Date().getFullYear()

/** 사용자가 묻는 순서대로: 연결 → 보내기 → 받기 → 누가 보나 → 얼마나 남나 → 더 편하게. 항목 문구는 help.{id}{번호} */
const HELP_SECTIONS = [
  { id: 'connect', count: 7 },
  { id: 'send', count: 5 },
  { id: 'receive', count: 3 },
  { id: 'who', count: 6 },
  { id: 'keep', count: 3 },
  { id: 'more', count: 3 }
]
const itemsOf = (s) => Array.from({ length: s.count }, (_, i) => `help.${s.id}${i + 1}`)

/**
 * ESC 키로 모달 닫기
 */
function handleKeydown(event) {
  if (!props.isOpen) return
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  trapTab(event, dialogRef.value)
}

/**
 * 모달 외부 클릭 시 닫기
 */
function handleBackdropClick(event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-show="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click="handleBackdropClick"
      >
        <div
          data-testid="help-modal"
          ref="dialogRef"
          role="dialog"
          aria-labelledby="help-modal-title"
          aria-modal="true"
          :aria-hidden="isOpen ? undefined : 'true'"
          class="bg-surface rounded-none border-2 border-ink max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          @click.stop
        >
          <!-- 헤더 -->
          <div class="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
                            <h2 id="help-modal-title" class="text-2xl font-bold text-text-primary">{{ t('help.title') }}</h2>
            </div>
            <button
              ref="closeBtnRef"
              class="inline-flex items-center justify-center w-11 h-11 text-text-secondary hover:text-text-primary transition-colors"
              @click="$emit('close')"
              :aria-label="t('help.close')"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- 본문 -->
          <div class="px-6 py-6 space-y-6">
            <section v-for="s in HELP_SECTIONS" :key="s.id" :data-testid="`help-section-${s.id}`">
              <h3 class="text-lg font-semibold text-text-primary mb-2">{{ t(`help.${s.id}Title`) }}</h3>
              <ol class="m-0 pl-5 list-decimal text-sm text-text-secondary leading-relaxed space-y-1.5 marker:text-text-secondary">
                <li v-for="k in itemsOf(s)" :key="k" dir="auto">{{ t(k) }}</li>
              </ol>
            </section>

            <!-- 정보 -->
            <section class="border-t border-border pt-6">
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.aboutTitle') }}
              </h3>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                <a
                  href="https://github.com/Kangchanghwan/only_ai_project/blob/master/PRIVACY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-ink hover:underline"
                >{{ t('footer.privacyPolicy') }}</a>
                <span class="text-text-secondary/50">·</span>
                <a
                  :href="FEEDBACK_FORM_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="feedback-link"
                  class="text-ink hover:underline"
                  @click="trackEvent('feedback_click')"
                >{{ t('footer.feedback') }}</a>
                <span class="text-text-secondary/50">·</span>
                <a
                  href="https://github.com/Kangchanghwan/only_ai_project"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-ink hover:underline"
                >{{ t('footer.sourceOnGitHub') }}</a>
                <span class="text-text-secondary/50">·</span>
                <span>
                  {{ t('footer.createdBy') }}
                  <a
                    href="https://github.com/Kangchanghwan"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-ink hover:underline"
                  >Kang Chang Hwan</a>
                </span>
                <span class="text-text-secondary/50">·</span>
                <span>&copy; {{ currentYear }}</span>
              </div>
            </section>

            <!-- 추가 안내(사용 안내·서비스 소개·푸터): 닫혀 있어도 DOM에 유지 -->
            <slot />
          </div>

          <!-- 푸터 -->
          <div class="sticky bottom-0 bg-surface border-t border-border px-6 py-4 flex justify-end">
            <button
              class="px-6 py-2 min-h-[44px] bg-ink text-on-ink rounded-none hover:opacity-90 transition-colors font-extrabold"
              @click="$emit('close')"
            >
              {{ t('help.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .bg-surface,
.modal-leave-active .bg-surface {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from .bg-surface,
.modal-leave-to .bg-surface {
  transform: scale(0.95);
  opacity: 0;
}
</style>
