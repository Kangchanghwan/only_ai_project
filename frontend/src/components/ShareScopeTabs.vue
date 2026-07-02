<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  scope: {
    type: String,
    default: 'ip'
  }
})

const emit = defineEmits(['select'])
</script>

<template>
  <div
    class="flex items-center gap-1 p-1 mb-6 bg-surface rounded-full border border-border"
    role="tablist"
    :aria-label="t('shareScope.label')"
  >
    <button
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
      :class="scope === 'ip' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-background'"
      :aria-selected="scope === 'ip'"
      :title="t('shareScope.ipDescription')"
      @click="emit('select', 'ip')"
    >
      {{ t('shareScope.ip') }}
    </button>
    <button
      type="button"
      role="tab"
      class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
      :class="scope === 'global' ? 'bg-scope-global text-white' : 'text-text-secondary hover:bg-background'"
      :aria-selected="scope === 'global'"
      :title="t('shareScope.globalDescription')"
      @click="emit('select', 'global')"
    >
      {{ t('shareScope.global') }}
    </button>
  </div>
</template>
