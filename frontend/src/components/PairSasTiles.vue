<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
/**
 * 1:1 확인 그림 4장 타일. 보내는 쪽(DeviceRow)과 받는 쪽(PairRequestSheet)이 같이 쓴다.
 * 그림이 준비되기 전에는 같은 크기의 빈 타일 4개(스켈레톤)를 보여 레이아웃이 튀지 않는다.
 */
defineProps({
  /** sasImages() 결과 ({ src, emoji }[]). 4장이면 준비된 것 */
  images: { type: Array, default: () => [] },
  /** 'md'(행 안) | 'lg'(시트) */
  size: { type: String, default: 'md' }
})
</script>

<template>
  <div
    v-if="images.length === 4"
    class="grid grid-cols-4 gap-2"
    data-testid="pair-sas"
  >
    <div
      v-for="(img, i) in images"
      :key="i"
      class="aspect-square bg-background border border-border flex items-center justify-center"
      :class="size === 'lg' ? 'rounded-xl p-2' : 'rounded-lg p-1.5'"
    >
      <img :src="img.src" :alt="img.emoji" draggable="false" class="w-full h-full object-contain select-none" data-testid="pair-sas-image" />
    </div>
  </div>
  <div v-else class="flex flex-col gap-2" data-testid="pair-sas-loading">
    <div class="grid grid-cols-4 gap-2" aria-hidden="true" data-testid="pair-sas-skeleton">
      <div
        v-for="i in 4"
        :key="i"
        class="aspect-square bg-background border border-border animate-pulse flex items-center justify-center"
        :class="size === 'lg' ? 'rounded-xl' : 'rounded-lg'"
        data-testid="pair-sas-skeleton-tile"
      >
        <span class="inline-block w-5 h-5 rounded-full border-2 border-scope-private border-t-transparent animate-spin"></span>
      </div>
    </div>
    <p class="m-0 text-xs text-text-secondary text-center" role="status" aria-busy="true" data-testid="pair-sas-loading-text">{{ t('identity.pairSasLoading') }}</p>
  </div>
</template>
