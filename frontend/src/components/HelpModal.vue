<script setup>
/**
 * HelpModal.vue - 사용 방법 안내 모달
 *
 * 애플리케이션의 주요 기능과 사용 방법을 설명하는 모달 컴포넌트
 */
import { ref, onMounted, onUnmounted } from 'vue'

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
              <h2 class="text-2xl font-bold text-text-primary">Clipboard Share 사용 가이드</h2>
            </div>
            <button
              class="text-text-secondary hover:text-text-primary transition-colors text-2xl"
              @click="$emit('close')"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <!-- 본문 -->
          <div class="px-6 py-6 space-y-6">
            <!-- 소개 -->
            <section>
              <p class="text-text-secondary leading-relaxed">
                <strong class="text-text-primary">Clipboard Share</strong>는 실시간으로 파일과 텍스트를 공유할 수 있는 웹 애플리케이션입니다.
                룸 코드를 통해 여러 사용자가 같은 공간에서 클립보드 콘텐츠를 즉시 공유할 수 있습니다.
              </p>
            </section>

            <!-- 주요 기능 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ✨ 주요 기능
              </h3>
              <ul class="space-y-2 text-text-secondary">
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">실시간 파일 공유:</strong> 이미지, 문서 등 다양한 파일을 즉시 공유</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">텍스트 공유:</strong> 코드, 링크, 메모 등 텍스트 콘텐츠 공유</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">자동 룸 생성:</strong> 접속 시 6자리 룸 코드 자동 생성</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-primary mt-0.5">•</span>
                  <span><strong class="text-text-primary">다중 다운로드:</strong> 여러 파일을 선택하여 ZIP으로 일괄 다운로드</span>
                </li>
              </ul>
            </section>

            <!-- 파일 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                📁 파일 공유 방법
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">1. 클립보드 붙여넣기</h4>
                  <p class="text-sm text-text-secondary mb-2">가장 빠른 방법입니다:</p>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• 파일을 복사 (Ctrl+C / Cmd+C)</li>
                    <li>• 페이지 어디서나 붙여넣기 (Ctrl+V / Cmd+V)</li>
                    <li>• 자동으로 업로드되어 모든 참가자와 공유됩니다</li>
                  </ul>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">2. 파일 선택 버튼</h4>
                  <p class="text-sm text-text-secondary">파일 업로드 카드의 버튼을 클릭하여 파일을 선택할 수 있습니다.</p>
                </div>
              </div>
            </section>

            <!-- 텍스트 공유 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                💬 텍스트 공유 방법
              </h3>
              <div class="bg-background border border-border rounded-lg p-4 space-y-2">
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">자동 공유:</strong> 텍스트를 복사한 후 페이지에 붙여넣기 (Ctrl+V / Cmd+V)하면 자동으로 공유됩니다.
                </p>
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">복사하기:</strong> 공유된 텍스트를 클릭하면 클립보드에 자동 복사됩니다.
                </p>
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">삭제하기:</strong> 텍스트에 마우스를 올리면 나타나는 휴지통 아이콘을 클릭하세요.
                </p>
              </div>
            </section>

            <!-- 파일 다운로드 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ⬇️ 파일 다운로드
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">개별 다운로드</h4>
                  <p class="text-sm text-text-secondary">파일 카드를 클릭하면 해당 파일을 다운로드합니다.</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">다중 선택 다운로드</h4>
                  <ul class="text-sm text-text-secondary space-y-1 ml-4">
                    <li>• 파일 카드의 체크박스를 클릭하여 선택</li>
                    <li>• "선택 항목 다운로드" 버튼으로 ZIP 파일로 다운로드</li>
                    <li>• "선택 항목 병렬 다운로드"로 개별 파일로 동시 다운로드</li>
                  </ul>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">전체 다운로드</h4>
                  <p class="text-sm text-text-secondary">"전체 다운로드" 버튼으로 모든 파일을 ZIP으로 다운로드합니다.</p>
                </div>
              </div>
            </section>

            <!-- 룸 관리 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                🚪 룸 관리
              </h3>
              <div class="space-y-3">
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">룸 생성</h4>
                  <p class="text-sm text-text-secondary">페이지 접속 시 자동으로 6자리 룸 코드가 생성됩니다. 이 코드를 다른 사용자와 공유하세요.</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">룸 입장</h4>
                  <p class="text-sm text-text-secondary">"다른 룸 입장" 버튼을 클릭하고 6자리 룸 코드를 입력하면 해당 룸에 참여할 수 있습니다.</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-2">룸 코드 복사</h4>
                  <p class="text-sm text-text-secondary">룸 코드 옆의 복사 버튼을 클릭하면 클립보드에 코드가 복사됩니다.</p>
                </div>
              </div>
            </section>

            <!-- 키보드 단축키 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ⌨️ 키보드 단축키
              </h3>
              <div class="bg-background border border-border rounded-lg p-4">
                <ul class="text-sm text-text-secondary space-y-2">
                  <li class="flex justify-between">
                    <span>파일/텍스트 공유</span>
                    <code class="bg-surface px-2 py-1 rounded text-xs border border-border">Ctrl+V / Cmd+V</code>
                  </li>
                  <li class="flex justify-between">
                    <span>선택한 파일 클립보드 복사</span>
                    <code class="bg-surface px-2 py-1 rounded text-xs border border-border">Ctrl+C / Cmd+C</code>
                  </li>
                </ul>
              </div>
            </section>

            <!-- 제한사항 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                ⚠️ 제한사항
              </h3>
              <div class="bg-background border border-border rounded-lg p-4">
                <ul class="text-sm text-text-secondary space-y-1 ml-4">
                  <li>• 파일 크기 제한: 파일당 최대 10MB</li>
                  <li>• 룸은 마지막 사용자가 나가면 자동으로 삭제됩니다</li>
                  <li>• 브라우저 클립보드 복사는 단일 파일만 지원됩니다</li>
                </ul>
              </div>
            </section>

            <!-- 팁 -->
            <section class="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                💡 팁
              </h3>
              <ul class="text-sm text-text-secondary space-y-1 ml-4">
                <li>• 스크린샷을 찍고 바로 Ctrl+V로 공유할 수 있습니다</li>
                <li>• 같은 네트워크에 있지 않아도 룸 코드만 알면 공유 가능합니다</li>
                <li>• 모든 파일과 텍스트는 실시간으로 동기화됩니다</li>
              </ul>
            </section>
          </div>

          <!-- 푸터 -->
          <div class="sticky bottom-0 bg-surface border-t border-border px-6 py-4 flex justify-end">
            <button
              class="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
              @click="$emit('close')"
            >
              확인
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
