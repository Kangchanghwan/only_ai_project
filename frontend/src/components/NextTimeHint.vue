<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { iosShortcutHrefFor } from '../utils/iosShortcut'
import { bookmarkKey } from '../composables/useNextTimeHint'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** 'ios_shortcut' | 'install' | 'bookmark' | null */
  variant: { type: String, default: null }
})
const emit = defineEmits(['action', 'dismiss'])
const { t, locale } = useI18n()

const text = computed(() => {
  if (props.variant === 'ios_shortcut') return t('nextTime.iosText')
  if (props.variant === 'install') return t('nextTime.installText')
  if (props.variant === 'bookmark') return t('nextTime.bookmarkText', { key: bookmarkKey() })
  return ''
})
const actionLabel = computed(() => {
  if (props.variant === 'ios_shortcut') return t('nextTime.iosAction')
  if (props.variant === 'install') return t('nextTime.installAction')
  return ''
})
const href = computed(() => iosShortcutHrefFor(locale.value))
const isKo = computed(() => locale.value === 'ko')
</script>

<template>
  <div v-if="visible && variant" class="next-time-hint" role="status" data-testid="next-time-hint" data-prerender-strip>
    <span class="next-time-hint__text">{{ text }}</span>
    <a
      v-if="variant === 'ios_shortcut'"
      class="next-time-hint__btn next-time-hint__btn--primary"
      data-testid="next-time-hint-action"
      :href="href"
      :target="isKo ? undefined : '_blank'"
      :rel="isKo ? undefined : 'noopener noreferrer'"
      @click="emit('action')"
    >{{ actionLabel }}</a>
    <button
      v-else-if="variant === 'install'"
      type="button"
      class="next-time-hint__btn next-time-hint__btn--primary"
      data-testid="next-time-hint-action"
      @click="emit('action')"
    >{{ actionLabel }}</button>
    <button type="button" class="next-time-hint__close" data-testid="next-time-hint-close" :aria-label="t('nextTime.close')" @click="emit('dismiss')">&times;</button>
  </div>
</template>

<style scoped>
.next-time-hint {
  position: fixed;
  /* ArrivalNotifyPrompt와 같은 자리. 같은 때에 둘이 뜨지 않도록 App에서 도착 알림이 있으면 건너뛴다 */
  bottom: calc(1.5rem + env(safe-area-inset-bottom));
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
.next-time-hint__btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 0.5rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  cursor: pointer;
  text-decoration: none;
}
.next-time-hint__btn--primary { background: #f97316; border-color: #f97316; color: #fff; font-weight: 600; }
.next-time-hint__close {
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  font-size: 1.125rem;
  line-height: 1;
  padding: 0.125rem 0.375rem;
  cursor: pointer;
}
.next-time-hint__close:hover { opacity: 1; }
</style>
