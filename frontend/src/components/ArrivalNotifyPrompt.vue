<script setup>
import { useI18n } from 'vue-i18n'
defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['enable', 'dismiss'])
const { t } = useI18n()
</script>

<template>
  <div v-if="visible" class="arrival-prompt" role="status" data-testid="arrival-notify-prompt" data-prerender-strip>
    <span class="arrival-prompt__text">{{ t('arrival.notifyPrompt') }}</span>
    <button type="button" class="arrival-prompt__btn arrival-prompt__btn--primary" data-testid="arrival-enable" @click="emit('enable')">{{ t('arrival.notifyEnable') }}</button>
    <button type="button" class="arrival-prompt__btn" data-testid="arrival-dismiss" @click="emit('dismiss')">{{ t('arrival.notifyDismiss') }}</button>
  </div>
</template>

<style scoped>
.arrival-prompt {
  position: fixed;
  top: calc(0.75rem + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100vw - 2rem);
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.8125rem;
  background: rgba(20, 18, 16, 0.92);
  color: #fff;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}
.arrival-prompt__btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 0.5rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  cursor: pointer;
}
.arrival-prompt__btn--primary { background: #f97316; border-color: #f97316; color: #fff; font-weight: 600; }
</style>
