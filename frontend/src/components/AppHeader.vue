<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
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

// ⋯ 더 보기 메뉴: 언어·테마·설치
const moreOpen = ref(false)
const moreRoot = ref(null)
const onMoreDown = (e) => { if (moreRoot.value && !moreRoot.value.contains(e.target)) moreOpen.value = false }
const onMoreKey = (e) => { if (e.key === 'Escape') moreOpen.value = false }
watch(moreOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onMoreDown)
    document.addEventListener('keydown', onMoreKey)
  } else {
    document.removeEventListener('pointerdown', onMoreDown)
    document.removeEventListener('keydown', onMoreKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onMoreDown)
  document.removeEventListener('keydown', onMoreKey)
})

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
   <div class="mx-auto w-full max-w-[880px] box-border px-4 sm:px-6 py-2 flex justify-between items-center flex-wrap gap-x-4 gap-y-1">
    <div class="flex items-center gap-3 text-2xl min-w-0">
      <span class="text-3xl sm:text-4xl" aria-hidden="true">📋</span>
      <h1 class="font-display font-extrabold text-ink text-xl sm:text-2xl m-0 truncate">{{ t('app.title') }}</h1>
    </div>
    <div class="flex items-center gap-2 sm:gap-4">
      <div ref="moreRoot" class="relative">
        <button
          type="button"
          class="header-more-button w-11 h-11 rounded-none bg-transparent hover:bg-tint text-ink font-bold text-lg transition-colors duration-200 flex items-center justify-center border border-border"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          :title="t('file.moreActions')"
          :aria-label="t('file.moreActions')"
          data-testid="header-more-button"
          @click="moreOpen = !moreOpen"
        ><span aria-hidden="true">⋯</span></button>
        <div
          v-if="moreOpen"
          class="absolute right-0 top-full mt-1 z-50 bg-surface border-2 border-ink rounded-none p-3 flex flex-col items-stretch gap-3"
          data-testid="header-more-menu"
        >
          <LanguageSelector />
          <ThemeToggleButton />
          <button
            v-if="showInstall"
            type="button"
            class="header-install-button h-11 min-w-11 px-0 sm:px-4 rounded-none bg-transparent hover:bg-tint text-ink font-bold text-sm transition-colors duration-200 flex items-center justify-center gap-2 border-2 border-ink w-11 sm:w-auto"
            :title="t('pwa.installAria')"
            :aria-label="t('pwa.installAria')"
            data-testid="header-install-button"
            @click="moreOpen = false; onInstallClick()"
          >
            <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><rect x="4" y="15" width="16" height="6" rx="2" />
            </svg>
            <span class="hidden sm:inline whitespace-nowrap">{{ t('pwa.installLabel') }}</span>
          </button>
          <a
            href="https://github.com/Kangchanghwan/only_ai_project/blob/master/PRIVACY.md"
            target="_blank"
            rel="noopener noreferrer"
            class="h-11 px-3 flex items-center justify-center text-ink text-sm font-bold hover:underline whitespace-nowrap"
            data-testid="header-privacy-link"
            @click="moreOpen = false"
          >{{ t('footer.privacyPolicy') }}</a>
        </div>
      </div>
      <button
        class="w-11 h-11 rounded-none bg-transparent hover:bg-tint text-ink font-bold text-lg transition-colors duration-200 flex items-center justify-center border border-border"
        @click="openHelpModal"
        :title="t('app.helpTitle')"
        :aria-label="t('app.help')"
      >
        ?
      </button>
      <button
        v-if="qrCodeDataUrl"
        type="button"
        class="header-qr-button w-11 h-11 flex items-center justify-center bg-white rounded-none border border-border hover:opacity-90 transition-opacity"
        :title="t('qr.backgroundHint')"
        :aria-label="t('qr.backgroundHint')"
        @click="openQrZoom"
      >
        <img :src="qrCodeDataUrl" alt="" class="w-full h-full" />
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
