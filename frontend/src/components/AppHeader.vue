<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import HelpModal from './HelpModal.vue'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggleButton from './ThemeToggleButton.vue'
import QRZoomModal from './QRZoomModal.vue'
import { useQRCode } from '../composables/useQRCode'
import InstallGuideSheet from './InstallGuideSheet.vue'
import { trackEvent } from '../utils/analytics'
import { usePWAInstall, isIOS, isStandalone } from '../composables/usePWAInstall'

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
  }
})

const isHelpModalOpen = ref(false)
const isQrZoomOpen = ref(false)
const isInstallGuideOpen = ref(false)

const { canInstall, isInstalled, promptInstall } = usePWAInstall()
const ios = isIOS()
const showInstall = computed(() => !isInstalled.value && !isStandalone() && (canInstall.value || ios))

function onInstallClick() {
  if (canInstall.value) {
    promptInstall()
  } else if (ios) {
    trackEvent('pwa_install_click', { platform: 'ios_guide' })
    isInstallGuideOpen.value = true
  }
}

function openHelpModal() {
  isHelpModalOpen.value = true
}

function closeHelpModal() {
  isHelpModalOpen.value = false
}

function openQrZoom() {
  isQrZoomOpen.value = true
  trackEvent('qr_open', { qr_type: 'site' })
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
  <header class="sticky top-0 z-40 bg-surface border-b border-border mb-4">
   <div class="mx-auto w-full max-w-[1040px] box-border px-4 sm:px-6 py-2 flex justify-between items-center flex-wrap gap-x-4 gap-y-1">
    <div class="flex items-center gap-3 text-2xl min-w-0">
      <span class="text-3xl sm:text-4xl" aria-hidden="true">📋</span>
      <h1 class="font-display font-bold text-xl sm:text-2xl m-0 truncate">{{ t('app.title') }}</h1>
    </div>
    <div class="flex items-center gap-2 sm:gap-4">
      <LanguageSelector />
      <ThemeToggleButton />
      <button
        v-if="showInstall"
        type="button"
        class="header-install-button h-11 min-w-11 px-0 sm:px-4 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 border-2 border-primary/30 hover:border-primary/50 w-11 sm:w-auto"
        :title="t('pwa.installAria')"
        :aria-label="t('pwa.installAria')"
        data-testid="header-install-button"
        @click="onInstallClick"
      >
        <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><rect x="4" y="15" width="16" height="6" rx="2" />
        </svg>
        <span class="hidden sm:inline whitespace-nowrap">{{ t('pwa.installLabel') }}</span>
      </button>
      <button
        class="w-11 h-11 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-lg transition-all duration-200 flex items-center justify-center border-2 border-primary/30 hover:border-primary/50"
        @click="openHelpModal"
        :title="t('app.helpTitle')"
        :aria-label="t('app.help')"
      >
        ?
      </button>
      <button
        v-if="qrCodeDataUrl"
        type="button"
        class="header-qr-button w-11 h-11 flex items-center justify-center bg-white rounded-lg border border-border hover:opacity-90 transition-opacity"
        :title="t('qr.backgroundHint')"
        :aria-label="t('qr.backgroundHint')"
        @click="openQrZoom"
      >
        <img :src="qrCodeDataUrl" alt="" class="w-full h-full rounded-lg" />
      </button>
    </div>
   </div>
  </header>

  <!-- 도움말 모달 -->
  <HelpModal
    :is-open="isHelpModalOpen"
    @close="closeHelpModal"
  />

  <InstallGuideSheet :is-open="isInstallGuideOpen" @close="isInstallGuideOpen = false" />

  <!-- QR 확대 모달 -->
  <QRZoomModal
    :qr-code-data-url="qrCodeDataUrl"
    :is-open="isQrZoomOpen"
    @close="closeQrZoom"
  />
</template>
