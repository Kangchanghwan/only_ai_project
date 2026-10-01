<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['cancel'])

defineProps({
  cancellable: {
    type: Boolean,
    default: false
  },
  fileName: {
    type: String,
    required: true
  },
  percent: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    required: true,
    validator: (value) => ['uploading', 'completed', 'failed'].includes(value)
  }
})
</script>

<template>
  <div class="upload-item">
    <div class="file-info">
      <span class="file-name">{{ fileName }}</span>
      <span class="status-indicator">
        <template v-if="status === 'completed'">✓</template>
        <template v-else-if="status === 'failed'">✗</template>
        <template v-else>{{ percent }}%</template>
      </span>
      <button
        v-if="cancellable && status === 'uploading'"
        type="button"
        class="cancel-btn"
        :aria-label="t('notification.cancel')"
        :title="t('notification.cancel')"
        @click="emit('cancel')"
      >✕</button>
    </div>
    <div class="progress-bar">
      <div
        class="progress-fill"
        :class="status"
        :style="{ width: percent + '%' }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.upload-item {
  padding: 8px 0;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 4px;
}

.file-name {
  font-size: 0.8125rem;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}

.cancel-btn {
  flex: none;
  /* 실제 터치 영역 44px */
  width: 44px;
  height: 44px;
  margin: -0.5rem -0.5rem -0.5rem 0;
  line-height: 1;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--color-text-primary);
  font-size: 0.875rem;
  cursor: pointer;
}

.cancel-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.status-indicator {
  flex: none;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  min-width: 40px;
  text-align: right;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-fill.uploading {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

.progress-fill.completed {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.progress-fill.failed {
  background: linear-gradient(90deg, #ef4444, #f87171);
}
</style>
