<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="app-footer">
    <div class="footer-content">
      <a
        href="https://github.com/Kangchanghwan/only_ai_project/blob/master/PRIVACY.md"
        target="_blank"
        rel="noopener noreferrer"
        class="footer-link"
      >
        {{ t('footer.privacyPolicy') }}
      </a>
      <span class="footer-divider">-</span>
      <a
        href="https://github.com/Kangchanghwan/only_ai_project"
        target="_blank"
        rel="noopener noreferrer"
        class="footer-link"
      >
        {{ t('footer.sourceOnGitHub') }}
      </a>
      <span class="footer-divider">-</span>
      <span class="footer-text">
        {{ t('footer.createdBy') }}
        <a
          href="https://github.com/Kangchanghwan"
          target="_blank"
          rel="noopener noreferrer"
          class="footer-link"
        >
          Kang Chang Hwan
        </a>
      </span>
      <span class="footer-divider">-</span>
      <span class="footer-text footer-copyright">
        &copy; {{ currentYear }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  width: 100%;
  padding: 2rem 1.5rem;
  margin-top: 3rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-content {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
}

.footer-link {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.2s ease;
}

.footer-link:hover {
  color: rgba(255, 255, 255, 1);
  text-decoration: underline;
}

.footer-divider {
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0.25rem;
}

.footer-text {
  color: rgba(255, 255, 255, 0.6);
}

.footer-copyright {
  font-size: 0.8rem;
}

/* Mobile responsive */
@media (max-width: 640px) {
  .footer-content {
    font-size: 0.8rem;
    gap: 0.4rem;
  }

  .footer-divider {
    display: none;
  }

  .footer-content {
    flex-direction: column;
    gap: 0.75rem;
  }
}
</style>
