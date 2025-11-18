<script setup>
/**
 * TextShareBox.vue - 텍스트 공유 컴포넌트
 *
 * 룸 내 사용자들 간 텍스트를 공유하는 UI 컴포넌트
 *
 * Vue 3 Best Practice:
 * - Composition API with <script setup>
 * - Props and emits pattern for component communication
 * - Tailwind CSS for styling
 */
import { ref } from 'vue'

defineProps({
  /**
   * 공유된 텍스트 목록
   * @type {Array<{id: string, content: string, timestamp: number}>}
   */
  texts: {
    type: Array,
    required: true,
    default: () => []
  }
})

const emit = defineEmits([
  'add-text',
  'remove-text',
  'clear-all',
  'copy-text'
])

// 입력 필드 상태
const inputText = ref('')

/**
 * 텍스트 추가 핸들러
 */
function handleAddText() {
  if (inputText.value.trim()) {
    emit('add-text', inputText.value)
    inputText.value = '' // 입력 필드 초기화
  }
}

/**
 * Enter 키 이벤트 핸들러
 */
function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleAddText()
  }
}

/**
 * 시간 포맷팅 함수
 */
function formatTime(timestamp) {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}
</script>

<template>
  <div class="bg-surface rounded-xl p-6 border border-border">
    <!-- 헤더 -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-text-primary">
        💬 텍스트 공유
      </h2>
      <button
        v-if="texts.length > 0"
        class="text-sm text-text-secondary hover:text-primary transition-colors duration-200"
        @click="$emit('clear-all')"
        title="모든 텍스트 삭제"
      >
        🗑️ 전체 삭제
      </button>
    </div>

    <!-- 입력 영역 -->
    <div class="mb-4">
      <div class="flex gap-2">
        <input
          v-model="inputText"
          type="text"
          placeholder="공유할 텍스트를 입력하세요..."
          class="flex-1 bg-background text-text-primary border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
          @keydown="handleKeydown"
        />
        <button
          class="bg-primary text-white border-none px-6 py-2.5 rounded-lg cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed hover:not-disabled:bg-green-600 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-lg hover:not-disabled:shadow-primary/30"
          :disabled="!inputText.trim()"
          @click="handleAddText"
          title="텍스트 공유"
        >
          전송
        </button>
      </div>
      <p class="text-xs text-text-secondary mt-2">
        💡 Enter 키로 빠르게 전송할 수 있습니다
      </p>
    </div>

    <!-- 텍스트 목록 -->
    <div class="space-y-2">
      <!-- 빈 상태 -->
      <div
        v-if="texts.length === 0"
        class="text-center py-12 text-text-secondary"
      >
        <p class="text-lg mb-2">📝</p>
        <p class="text-sm">아직 공유된 텍스트가 없습니다</p>
        <p class="text-xs mt-1">위 입력창에 텍스트를 입력해보세요</p>
      </div>

      <!-- 텍스트 아이템 -->
      <div
        v-for="text in texts"
        :key="text.id"
        class="bg-background border border-border rounded-lg p-4 hover:border-primary/50 transition-all duration-200 group"
      >
        <div class="flex items-start justify-between gap-3">
          <!-- 텍스트 내용 -->
          <div class="flex-1 min-w-0">
            <p class="text-text-primary break-words whitespace-pre-wrap">
              {{ text.content }}
            </p>
            <p class="text-xs text-text-secondary mt-2">
              {{ formatTime(text.timestamp) }}
            </p>
          </div>

          <!-- 액션 버튼 -->
          <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              class="text-text-secondary hover:text-primary transition-colors duration-200 p-1"
              @click="$emit('copy-text', text.id)"
              title="클립보드에 복사"
            >
              📋
            </button>
            <button
              class="text-text-secondary hover:text-red-500 transition-colors duration-200 p-1"
              @click="$emit('remove-text', text.id)"
              title="삭제"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 텍스트 개수 표시 -->
    <div
      v-if="texts.length > 0"
      class="mt-4 text-center text-sm text-text-secondary"
    >
      총 {{ texts.length }}개의 텍스트
    </div>
  </div>
</template>

<style scoped>
/* Tailwind handles all styling */
</style>
