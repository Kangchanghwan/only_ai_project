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
            <!-- 소개 -->
            <section>
              <p class="text-text-secondary leading-relaxed">
                <strong class="text-text-primary">{{ t('app.title') }}</strong>{{ t('help.intro') }}
              </p>
            </section>

            <!-- 주요 기능 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.features') }}
              </h3>
              <ul class="space-y-2 text-text-secondary">
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature1') }}</strong> {{ t('help.feature1Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature2') }}</strong> {{ t('help.feature2Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature3') }}</strong> {{ t('help.feature3Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature4') }}</strong> {{ t('help.feature4Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature5') }}</strong> {{ t('help.feature5Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-ink mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature6') }}</strong> {{ t('help.feature6Desc') }}</span>
                </li>
              </ul>
            </section>

            <!-- 공유 범위 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.scopeTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('shareScope.ip') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('shareScope.ipDescription') }}</p>
                </div>
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('shareScope.global') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('shareScope.globalDescription') }}</p>
                </div>
              </div>
              <p class="text-sm text-text-secondary mt-3">{{ t('help.scopeDevicesDesc') }}</p>
              <p class="text-sm text-text-secondary mt-1">{{ t('identity.verifyHint') }}</p>
            </section>

            <!-- 파일 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.fileShareTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.fileShare1') }}</h4>
                  <p class="text-sm text-text-secondary mb-2">{{ t('help.fileShare1Desc') }}</p>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• {{ t('help.fileShare1Step1') }}</li>
                    <li>• {{ t('help.fileShare1Step2') }}</li>
                    <li>• {{ t('help.fileShare1Step3') }}</li>
                  </ul>
                </div>
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.fileShare2') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.fileShare2Desc') }}</p>
                </div>
              </div>
            </section>

            <!-- 텍스트 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.textShareTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-none p-4 space-y-2">
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">{{ t('help.textShareAuto') }}</strong> {{ t('help.textShareAutoDesc') }}
                </p>
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">{{ t('help.textShareCopy') }}</strong> {{ t('help.textShareCopyDesc') }}
                </p>
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">{{ t('help.textShareDelete') }}</strong> {{ t('help.textShareDeleteDesc') }}
                </p>
              </div>
            </section>

            <!-- 파일 다운로드 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.downloadTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.downloadSingle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.downloadSingleDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.downloadMulti') }}</h4>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• {{ t('help.downloadMultiStep1') }}</li>
                    <li>• {{ t('help.downloadMultiStep2') }}</li>
                    <li>• {{ t('help.downloadMultiStep3') }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- 키보드 단축키 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.shortcutTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-none p-4">
                <ul class="text-sm text-text-secondary space-y-2">
                  <li class="flex justify-between">
                    <span>{{ t('help.shortcutShare') }}</span>
                    <code class="bg-surface px-2 py-1 rounded-none text-xs border border-border">Ctrl+V / Cmd+V</code>
                  </li>
                  <li class="flex justify-between">
                    <span>{{ t('help.shortcutCopy') }}</span>
                    <code class="bg-surface px-2 py-1 rounded-none text-xs border border-border">Ctrl+C / Cmd+C</code>
                  </li>
                </ul>
              </div>
            </section>

            <!-- 제한사항 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.limitTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-none p-4">
                <ul class="text-sm text-text-secondary space-y-1 ml-4">
                  <li>• {{ t('help.limit1') }}</li>
                  <li>• {{ t('help.limit2') }}</li>
                  <li>• {{ t('help.limit3') }}</li>
                  <li>• {{ t('help.limit4') }}</li>
                </ul>
              </div>
            </section>

            <!-- 앱 설치 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                {{ t('help.pwaTitle') }}
              </h3>
              <div class="space-y-3">
                <p class="text-sm text-text-secondary">{{ t('help.pwaIntro') }}</p>
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('help.pwaAndroidTitle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.pwaAndroidDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-none p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('help.pwaIOSTitle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.pwaIOSDesc') }}</p>
                </div>
              </div>
            </section>

            <!-- 팁 -->
            <section class="bg-tint border border-ink rounded-none p-4">
              <h3 class="text-lg font-semibold text-ink mb-2 flex items-center gap-2">
                {{ t('help.tipsTitle') }}
              </h3>
              <ul class="text-sm text-text-secondary space-y-1 ml-4">
                <li>• {{ t('help.tip1') }}</li>
                <li>• {{ t('help.tip2') }}</li>
                <li>• {{ t('help.tip3') }}</li>
                <li>• {{ t('help.tip4') }}</li>
              </ul>
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
