<script setup>
/**
 * HelpModal.vue - 사용 방법 안내 모달
 *
 * 애플리케이션의 주요 기능과 사용 방법을 설명하는 모달 컴포넌트
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['close'])

/**
 * ESC 키로 모달 닫기
 */
function handleKeydown(event) {
  if (event.key === 'Escape' && props.isOpen) {
    emit('close')
  }
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
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click="handleBackdropClick"
      >
        <div
          class="bg-surface rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          @click.stop
        >
          <!-- 헤더 -->
          <div class="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-3xl">📋</span>
              <h2 class="text-2xl font-bold text-text-primary">{{ t('help.title') }}</h2>
            </div>
            <button
              class="text-text-secondary hover:text-text-primary transition-colors text-2xl"
              @click="$emit('close')"
              :aria-label="t('help.close')"
            >
              ✕
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
                ✨ {{ t('help.features') }}
              </h3>
              <ul class="space-y-2 text-text-secondary">
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature1') }}</strong> {{ t('help.feature1Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature2') }}</strong> {{ t('help.feature2Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature3') }}</strong> {{ t('help.feature3Desc') }}</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">{{ t('help.feature4') }}</strong> {{ t('help.feature4Desc') }}</span>
                </li>
              </ul>
            </section>

            <!-- 파일 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                📁 {{ t('help.fileShareTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.fileShare1') }}</h4>
                  <p class="text-sm text-text-secondary mb-2">{{ t('help.fileShare1Desc') }}</p>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• {{ t('help.fileShare1Step1') }}</li>
                    <li>• {{ t('help.fileShare1Step2') }}</li>
                    <li>• {{ t('help.fileShare1Step3') }}</li>
                  </ul>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.fileShare2') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.fileShare2Desc') }}</p>
                </div>
              </div>
            </section>

            <!-- 텍스트 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                💬 {{ t('help.textShareTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-lg p-4 space-y-2">
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
                ⬇️ {{ t('help.downloadTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.downloadSingle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.downloadSingleDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.downloadMulti') }}</h4>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• {{ t('help.downloadMultiStep1') }}</li>
                    <li>• {{ t('help.downloadMultiStep2') }}</li>
                    <li>• {{ t('help.downloadMultiStep3') }}</li>
                  </ul>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.downloadAll') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.downloadAllDesc') }}</p>
                </div>
              </div>
            </section>

            <!-- 룸 관리 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                🚪 {{ t('help.roomTitle') }}
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.roomCreate') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.roomCreateDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.roomJoin') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.roomJoinDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">{{ t('help.roomCopy') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.roomCopyDesc') }}</p>
                </div>
              </div>
            </section>

            <!-- 키보드 단축키 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ⌨️ {{ t('help.shortcutTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-lg p-4">
                <ul class="text-sm text-text-secondary space-y-2">
                  <li class="flex justify-between">
                    <span>{{ t('help.shortcutShare') }}</span>
                    <code class="bg-surface px-2 py-1 rounded text-xs border border-border">Ctrl+V / Cmd+V</code>
                  </li>
                  <li class="flex justify-between">
                    <span>{{ t('help.shortcutCopy') }}</span>
                    <code class="bg-surface px-2 py-1 rounded text-xs border border-border">Ctrl+C / Cmd+C</code>
                  </li>
                </ul>
              </div>
            </section>

            <!-- 제한사항 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ⚠️ {{ t('help.limitTitle') }}
              </h3>
              <div class="bg-background border border-border rounded-lg p-4">
                <ul class="text-sm text-text-secondary space-y-1 ml-4">
                  <li>• {{ t('help.limit1') }}</li>
                  <li>• {{ t('help.limit2') }}</li>
                  <li>• {{ t('help.limit3') }}</li>
                </ul>
              </div>
            </section>

            <!-- 팁 -->
            <section class="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                💡 {{ t('help.tipsTitle') }}
              </h3>
              <ul class="text-sm text-text-secondary space-y-1 ml-4">
                <li>• {{ t('help.tip1') }}</li>
                <li>• {{ t('help.tip2') }}</li>
                <li>• {{ t('help.tip3') }}</li>
              </ul>
            </section>
          </div>

          <!-- 푸터 -->
          <div class="sticky bottom-0 bg-surface border-t border-border px-6 py-4 flex justify-end">
            <button
              class="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
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
