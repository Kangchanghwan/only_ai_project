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

// Enter 키 핸들러 제거 - 버튼으로만 전송

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
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Connect & send 섹션 -->
    <div class="bg-surface rounded-xl p-6 border border-border">
      <h2 class="text-lg font-semibold text-text-primary mb-2">
        Connect & send
      </h2>
      <p class="text-xs text-text-secondary mb-4">
        Enter the text to send
      </p>

      <!-- 입력 영역 -->
      <div class="space-y-3">
        <textarea
          v-model="inputText"
          placeholder="Enter the text to send"
          rows="6"
          class="w-full bg-background text-text-primary border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 resize-none font-mono text-sm"
        ></textarea>

        <button
          class="w-full bg-primary text-white border-none px-6 py-3 rounded-lg cursor-pointer text-sm font-semibold transition-all duration-200 disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed hover:not-disabled:bg-green-600 hover:not-disabled:shadow-lg hover:not-disabled:shadow-primary/30"
          :disabled="!inputText.trim()"
          @click="handleAddText"
        >
          Send
        </button>

        <p class="text-xs text-text-secondary">
          💡 Send 버튼을 눌러 전송하세요
        </p>
      </div>
    </div>

    <!-- Received text 섹션 -->
    <div class="bg-surface rounded-xl p-6 border border-border">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold text-text-primary">
          Received text
        </h2>
        <button
          v-if="texts.length > 0"
          class="text-xs text-text-secondary hover:text-primary transition-colors duration-200"
          @click="$emit('clear-all')"
          title="모든 텍스트 삭제"
        >
          🗑️ Clear all
        </button>
      </div>

      <p class="text-xs text-text-secondary mb-4">
        Once connected, the text you receive from the other device will be shown here
      </p>

      <!-- 텍스트 목록 -->
      <div class="space-y-2 max-h-[400px] overflow-y-auto">
        <!-- 빈 상태 -->
        <div
          v-if="texts.length === 0"
          class="text-center py-12 text-text-secondary"
        >
          <p class="text-sm">No messages yet</p>
        </div>

        <!-- 텍스트 아이템 -->
        <div
          v-for="text in texts"
          :key="text.id"
          class="bg-background border border-border rounded-lg p-3 hover:border-primary/50 transition-all duration-200 group"
        >
          <div class="flex items-start justify-between gap-3">
            <!-- 텍스트 내용 -->
            <div class="flex-1 min-w-0">
              <pre class="text-text-primary text-sm font-mono whitespace-pre-wrap break-words">{{ text.content }}</pre>
              <p class="text-xs text-text-secondary mt-2">
                {{ formatTime(text.timestamp) }}
              </p>
            </div>

            <!-- 액션 버튼 -->
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                class="text-text-secondary hover:text-primary transition-colors duration-200 p-1 text-sm"
                @click="$emit('copy-text', text.id)"
                title="Copy to clipboard"
              >
                📋
              </button>
              <button
                class="text-text-secondary hover:text-red-500 transition-colors duration-200 p-1 text-sm"
                @click="$emit('remove-text', text.id)"
                title="Delete"
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
        class="mt-3 text-center text-xs text-text-secondary"
      >
        {{ texts.length }} message{{ texts.length > 1 ? 's' : '' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind handles all styling */
</style>
