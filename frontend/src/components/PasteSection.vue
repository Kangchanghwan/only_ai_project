<script setup>
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

const props = defineProps({
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['paste-content'])

const {
  text: accentText,
  hoverBorder: accentHoverBorder,
  hoverShadow30: accentHoverShadow30
} = useScopeAccent(() => props.scope)

function handlePasteClick() {
  emit('paste-content')
}
</script>

<template>
  <!-- 붙여넣기 카드 -->
  <div
    class="relative rounded-lg overflow-hidden cursor-pointer border-2 border-dashed border-border bg-background transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
    :class="[accentHoverShadow30, accentHoverBorder]"
    @click="handlePasteClick"
  >
    <!-- 메인 컨텐츠 영역 -->
    <div class="w-full h-[200px] flex flex-col items-center justify-center gap-3 bg-surface/50">
      <!-- SVG 아이콘으로 대체하여 LCP 성능 개선 -->
      <svg
        class="w-20 h-20"
        :class="accentText"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
      <p class="text-sm font-semibold text-text-primary">{{ t('clipboard.pasteTitle') }}</p>
      <p class="text-xs text-text-secondary px-4 text-center">
        {{ t('clipboard.pasteDescription') }}<br />
        {{ t('clipboard.pasteDescription2') }}
      </p>
    </div>

    <!-- 상단 정보 오버레이 -->
    <div class="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📲</span>
        <div class="flex items-center gap-2 text-xs text-white/90">
          <span>{{ t('clipboard.mobileSupport') }}</span>
        </div>
      </div>
    </div>

    <!-- 하단 액션 오버레이 (호버시 표시) -->
    <div
      class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-end opacity-0 transition-opacity duration-200 hover:opacity-100"
    >
      <span class="text-xs font-medium text-white">{{ t('clipboard.pasteHint') }}</span>
    </div>
  </div>
</template>
