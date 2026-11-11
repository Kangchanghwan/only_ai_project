<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '../composables/usePWAInstall.js'
import { usePush } from '../composables/usePush.js'
import { useNotification } from '../composables/useNotification.js'
import { FEEDBACK_FORM_URL } from '../constants/feedback.js'
import { trackEvent } from '../utils/analytics.js'

const { t } = useI18n()
const { canInstall, isInstalled, promptInstall } = usePWAInstall()
const push = usePush()
const notification = useNotification()
const pushBusy = ref(false)

async function onPushEnable() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const r = await push.enable()
    if (r.ok) notification.showSuccess(t('arrival.pushEnabled'))
    else if (r.reason === 'error') notification.showError(t('arrival.pushError'))
  } finally {
    pushBusy.value = false
  }
}

async function onPushDisable() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    await push.disable()
    notification.showInfo(t('arrival.pushDisabled'))
  } finally {
    pushBusy.value = false
  }
}

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
    <div
      v-if="push.supported.value && push.permission.value !== 'denied'"
      data-testid="push-row"
      class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-text-secondary mb-3"
    >
      <button
        v-if="!push.enabled.value"
        type="button"
        data-testid="push-enable"
        :disabled="pushBusy"
        class="px-3 py-1 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        @click="onPushEnable"
      >
        {{ t('arrival.pushEnable') }}
      </button>
      <template v-else>
        <span>{{ t('arrival.pushOn') }}</span>
        <span class="text-text-secondary/50">·</span>
        <button
          type="button"
          data-testid="push-disable"
          :disabled="pushBusy"
          class="text-primary hover:underline disabled:opacity-60"
          @click="onPushDisable"
        >
          {{ t('arrival.pushOff') }}
        </button>
      </template>
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
        :href="FEEDBACK_FORM_URL"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="feedback-link"
        class="text-primary hover:underline"
        @click="trackEvent('feedback_click')"
      >{{ t('footer.feedback') }}</a>
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
