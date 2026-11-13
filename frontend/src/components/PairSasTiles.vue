<script setup>
/**
 * 1:1 확인 그림 4장 타일. 보내는 쪽(DeviceRow)과 받는 쪽(PairRequestSheet, PairConfirmSheet)이 같이 쓴다.
 * 그림 데이터가 없거나, 4장 <img>가 모두 load(또는 error)되기 전에는 로딩 표시(스피너 타일 + 문구)를 보이고
 * ready=false를 알린다. error가 난 그림은 이모지 글자로 대신 보여 비교할 수 있게 하고 준비된 것으로 센다.
 * 8초가 지나도 못 받은 그림은 글자로 대신하고 준비 완료로 본다.
 */
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps({
  /** sasImages() 결과 ({ src, emoji }[]). 4장이면 데이터가 준비된 것 */
  images: { type: Array, default: () => [] },
  /** 'md'(행 안) | 'lg'(시트) */
  size: { type: String, default: 'md' },
  /** 그림이 안 뜰 때까지 기다리는 최대 시간(ms) */
  timeoutMs: { type: Number, default: 8000 }
})
const emit = defineEmits(['ready-change'])

/** 타일별 상태: 'loading' | 'loaded' | 'failed' */
const status = ref([])
let timer = null
const hasData = computed(() => props.images.length === 4)
const ready = computed(() => hasData.value && status.value.length === 4 && status.value.every((s) => s !== 'loading'))

const key = computed(() => props.images.map((i) => i.src).join('|'))
watch(key, () => {
  clearTimeout(timer)
  status.value = hasData.value ? props.images.map((i) => (i.src ? 'loading' : 'failed')) : []
  if (hasData.value && !ready.value) {
    timer = setTimeout(() => {
      status.value = status.value.map((s) => (s === 'loading' ? 'failed' : s))
    }, props.timeoutMs)
  }
}, { immediate: true })
watch(ready, (v) => { if (v) clearTimeout(timer); emit('ready-change', v) }, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const mark = (i, s) => { if (status.value[i] === 'loading') status.value = status.value.map((x, j) => (j === i ? s : x)) }
</script>

<template>
  <div class="flex flex-col gap-2" :data-testid="ready ? 'pair-sas-wrap' : 'pair-sas-loading'">
    <div v-if="hasData" class="grid grid-cols-4 gap-2" data-testid="pair-sas" :aria-busy="!ready">
      <div
        v-for="(img, i) in images"
        :key="`${i}-${img.src}`"
        class="relative aspect-square bg-background border border-border flex items-center justify-center overflow-hidden"
        :class="size === 'lg' ? 'rounded-xl p-2' : 'rounded-lg p-1.5'"
      >
        <img
          v-if="status[i] !== 'failed'"
          :src="img.src"
          :alt="img.emoji"
          draggable="false"
          class="w-full h-full object-contain select-none transition-opacity"
          :class="status[i] === 'loaded' ? 'opacity-100' : 'opacity-0'"
          data-testid="pair-sas-image"
          @load="mark(i, 'loaded')"
          @error="mark(i, 'failed')"
        />
        <span v-else class="text-3xl leading-none select-none" role="img" :aria-label="img.emoji" data-testid="pair-sas-label">{{ img.emoji }}</span>
        <span
          v-if="status[i] === 'loading'"
          class="absolute inset-0 flex items-center justify-center bg-background animate-pulse"
          aria-hidden="true"
          data-testid="pair-sas-skeleton-tile"
        ><span class="inline-block w-5 h-5 rounded-full border-2 border-scope-private border-t-transparent animate-spin"></span></span>
      </div>
    </div>
    <div v-else class="grid grid-cols-4 gap-2" aria-hidden="true" data-testid="pair-sas-skeleton">
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
    <p v-if="!ready" class="m-0 text-xs text-text-secondary text-center" role="status" data-testid="pair-sas-loading-text">{{ t('identity.pairSasLoading') }}</p>
  </div>
</template>
