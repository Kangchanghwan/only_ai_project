<script setup>
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '../composables/usePWAInstall.js'

const { t } = useI18n()
const { canInstall, isInstalled, promptInstall } = usePWAInstall()

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border px-6 py-6">
    <div
      v-if="canInstall && !isInstalled"
      data-testid="pwa-install-row"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-text-secondary mb-3"
    >
      <span>{{ t('footer.installPrompt') }}</span>
      <button
        type="button"
        data-testid="pwa-install-button"
        class="px-3 py-1 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="promptInstall"
      >
        {{ t('footer.installButton') }}
      </button>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-text-secondary">
      <a
        href="https://github.com/Kangchanghwan/only_ai_project/blob/master/PRIVACY.md"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline"
      >{{ t('footer.privacyPolicy') }}</a>
      <span class="text-text-secondary/50">·</span>
      <a
        href="https://github.com/Kangchanghwan/only_ai_project"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline"
      >{{ t('footer.sourceOnGitHub') }}</a>
      <span class="text-text-secondary/50">·</span>
      <span>
        {{ t('footer.createdBy') }}
        <a
          href="https://github.com/Kangchanghwan"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
        >Kang Chang Hwan</a>
      </span>
      <span class="text-text-secondary/50">·</span>
      <span>&copy; {{ currentYear }}</span>
    </div>
  </footer>
</template>
