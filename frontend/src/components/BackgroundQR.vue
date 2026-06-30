<script setup>
/**
 * BackgroundQR.vue - 공유 룸 화면의 배경 워터마크 QR 레이어
 *
 * 평소엔 옅은 워터마크(불투명도 0.18)로 표시되고,
 * 데스크톱은 호버/포커스, 모바일은 탭으로 콘텐츠 위 스포트라이트가 되어
 * 또렷하게 스캔된다. 스캔 시 같은 공유 공간(home URL)으로 입장한다.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQRCode } from '../composables/useQRCode'

const { t } = useI18n()
const { qrCodeDataUrl, generateQRCodeForUrl } = useQRCode()

const isRevealed = ref(false)
const reducedMotion = ref(false)
const isTouch = ref(false)
let dimTimer = null

function clearDim() {
  if (dimTimer) {
    clearTimeout(dimTimer)
    dimTimer = null
  }
}

function scheduleDim() {
  clearDim()
  dimTimer = setTimeout(() => {
    isRevealed.value = false
    dimTimer = null
  }, 3000)
}

function reveal() {
  isRevealed.value = true
  if (isTouch.value) scheduleDim()
}

function unreveal() {
  isRevealed.value = false
  clearDim()
}

function onPointerEnter() {
  if (!isTouch.value) reveal()
}

function onPointerLeave() {
  if (!isTouch.value) unreveal()
}

function onPlateClick() {
  if (!isTouch.value) return
  if (isRevealed.value) unreveal()
  else reveal()
}

function onScrimClick() {
  unreveal()
}

onMounted(async () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    isTouch.value = window.matchMedia('(hover: none)').matches
  }
  const homeUrl = window.location.origin + window.location.pathname
  await generateQRCodeForUrl(homeUrl)
})

onBeforeUnmount(() => {
  clearDim()
})
</script>

<template>
  <div
    v-if="qrCodeDataUrl"
    class="bg-qr-layer"
    :class="{ 'is-revealed': isRevealed, 'reduced-motion': reducedMotion }"
  >
    <div class="bg-qr-scrim" @click="onScrimClick"></div>
    <button
      type="button"
      class="bg-qr-plate"
      :aria-label="t('qr.backgroundHint')"
      @mouseenter="onPointerEnter"
      @mouseleave="onPointerLeave"
      @focus="onPointerEnter"
      @blur="onPointerLeave"
      @click="onPlateClick"
    >
      <img :src="qrCodeDataUrl" class="bg-qr-img" alt="" />
      <span class="bg-qr-caption">{{ t('qr.backgroundHint') }}</span>
    </button>
  </div>
</template>

<style scoped>
.bg-qr-layer {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0.18;
  transition: opacity 0.22s ease;
}
.bg-qr-layer.is-revealed {
  opacity: 0.97;
}
.bg-qr-layer.reduced-motion {
  transition: none;
}

.bg-qr-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
}
.bg-qr-layer.is-revealed .bg-qr-scrim {
  opacity: 1;
  pointer-events: auto;
}
.bg-qr-layer.reduced-motion .bg-qr-scrim {
  transition: none;
}

.bg-qr-plate {
  position: relative;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: #ffffff;
  border: none;
  border-radius: 16px;
  padding: 18px;
  cursor: pointer;
  transition: transform 0.22s ease;
}
.bg-qr-layer.is-revealed .bg-qr-plate {
  transform: scale(1.04);
}
.bg-qr-layer.reduced-motion .bg-qr-plate {
  transition: none;
}

.bg-qr-img {
  width: clamp(200px, 45vmin, 420px);
  height: clamp(200px, 45vmin, 420px);
  display: block;
}

.bg-qr-caption {
  display: none;
  font-size: 14px;
  font-weight: 700;
  color: #111111;
}
.bg-qr-layer.is-revealed .bg-qr-caption {
  display: block;
}
</style>
