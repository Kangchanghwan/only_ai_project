<script setup>
/**
 * TextShareBox.vue - 텍스트 공유 컴포넌트
 *
 * 룸 내 사용자들 간 텍스트를 공유하는 UI 컴포넌트
 * 문서 전체에서 붙여넣기 시 자동으로 텍스트가 공유됩니다.
 *
 * Vue 3 Best Practice:
 * - Composition API with <script setup>
 * - Props and emits pattern for component communication
 * - Tailwind CSS for styling
 */

const props = defineProps({
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
  'remove-text',
  'clear-all',
  'copy-text'
])

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
  <div>
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
        💡 텍스트를 붙여넣으면 자동으로 공유됩니다 (Ctrl+V / Cmd+V)
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
            <!-- 텍스트 내용 (클릭 시 복사) -->
            <div
              class="flex-1 min-w-0 cursor-pointer"
              @click="$emit('copy-text', text.id)"
              title="Click to copy"
            >
              <pre class="text-text-primary text-sm font-mono whitespace-pre-wrap break-words">{{ text.content }}</pre>
              <p class="text-xs text-text-secondary mt-2">
                {{ formatTime(text.timestamp) }}
              </p>
            </div>

            <!-- 액션 버튼 -->
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                class="text-text-secondary hover:text-red-500 transition-colors duration-200 p-1 text-xl"
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
