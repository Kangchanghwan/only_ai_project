<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits(['paste-content'])

function handlePasteClick() {
  emit('paste-content')
}
</script>

<template>
  <!-- 붙여넣기 카드 -->
  <div
    class="relative rounded-lg overflow-hidden cursor-pointer border-2 border-dashed border-border bg-background transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/30 hover:border-primary"
    @click="handlePasteClick"
  >
    <!-- 메인 컨텐츠 영역 -->
    <div class="w-full h-[200px] flex flex-col items-center justify-center gap-3 bg-surface/50">
      <div class="text-[80px]">📋</div>
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
