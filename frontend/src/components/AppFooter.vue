<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border px-6 py-6">
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
