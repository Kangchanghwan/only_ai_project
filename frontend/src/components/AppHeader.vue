<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import HelpModal from './HelpModal.vue'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggleButton from './ThemeToggleButton.vue'
import QRZoomModal from './QRZoomModal.vue'
import ConnectedDevices from './ConnectedDevices.vue'
import { useQRCode } from '../composables/useQRCode'

const { t } = useI18n()
const { qrCodeDataUrl, generateQRCodeForUrl } = useQRCode()

const props = defineProps({
  userCount: {
    type: Number,
    default: 1
  },
  isConnecting: {
    type: Boolean,
    default: false
  },
  devices: {
    type: Array,
    default: () => []
  }
})

const isHelpModalOpen = ref(false)
const isQrZoomOpen = ref(false)

function openHelpModal() {
  isHelpModalOpen.value = true
}

function closeHelpModal() {
  isHelpModalOpen.value = false
}

function openQrZoom() {
  isQrZoomOpen.value = true
}

function closeQrZoom() {
  isQrZoomOpen.value = false
}

onMounted(async () => {
  const homeUrl = window.location.origin + window.location.pathname
  await generateQRCodeForUrl(homeUrl)
})
</script>

<template>
  <header class="sticky top-0 z-40 bg-background border-b border-border py-3 flex justify-between items-center mb-8 flex-wrap gap-4">
    <div class="flex items-center gap-3 text-2xl">
      <span class="text-4xl" aria-hidden="true">📋</span>
      <h1 class="font-display font-bold text-2xl m-0">{{ t('app.title') }}</h1>
      <ConnectedDevices :devices="devices" />
    </div>
    <div class="flex items-center gap-4">
      <LanguageSelector />
      <ThemeToggleButton />
      <button
        class="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-lg transition-all duration-200 flex items-center justify-center border-2 border-primary/30 hover:border-primary/50"
        @click="openHelpModal"
        :title="t('app.helpTitle')"
        :aria-label="t('app.help')"
      >
        ?
      </button>
      <button
        v-if="qrCodeDataUrl"
        type="button"
        class="header-qr-button flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-border hover:opacity-90 transition-opacity"
        :aria-label="t('qr.backgroundHint')"
        @click="openQrZoom"
      >
        <img :src="qrCodeDataUrl" alt="" class="w-9 h-9 rounded" />
        <span class="text-[11px] font-semibold text-gray-900 leading-tight text-left max-w-[64px]">
          {{ t('qr.backgroundHint') }}
        </span>
      </button>
    </div>
  </header>

  <!-- 도움말 모달 -->
  <HelpModal
    :is-open="isHelpModalOpen"
    @close="closeHelpModal"
  />

  <!-- QR 확대 모달 -->
  <QRZoomModal
    :qr-code-data-url="qrCodeDataUrl"
    :is-open="isQrZoomOpen"
    @close="closeQrZoom"
  />
</template>
