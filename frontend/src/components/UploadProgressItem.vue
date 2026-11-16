<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['cancel'])

defineProps({
  cancellable: {
    type: Boolean,
    default: false
  },
  /** 비밀번호 잠금 업로드: 잠그는 중 / 올리는 중 2단으로 보여 준다 */
  locked: {
    type: Boolean,
    default: false
  },
  encPercent: {
    type: Number,
    default: 0
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
      ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div v-if="locked && status === 'uploading'" class="progress-bar locked-bar" data-testid="locked-progress">
      <div class="progress-fill lock-enc" :style="{ width: encPercent / 2 + '%' }"></div>
      <div class="progress-fill lock-up" :style="{ width: percent / 2 + '%' }"></div>
    </div>
    <div v-else class="progress-bar">
      <div
        class="progress-fill"
        :class="status"
        :style="{ width: percent + '%' }"
      ></div>
    </div>
    <div v-if="locked && status === 'uploading'" class="lock-steps">
      <span :class="encPercent >= 100 ? 'done' : 'on'">{{ t('lock.progress.encrypting') }} {{ encPercent }}%</span>
      <span :class="percent >= 100 ? 'done' : (encPercent > 0 ? 'on' : '')">{{ t('lock.progress.uploading') }} {{ percent }}%</span>
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -0.5rem -0.5rem -0.5rem 0;
  line-height: 1;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--color-text-primary);
  font-size: 0.875rem;
  cursor: pointer;
}

.cancel-btn:hover {
  background: color-mix(in srgb, var(--color-ink) 15%, transparent);
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
  border-radius: 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 0;
  transition: width 0.3s ease;
}

.progress-fill.uploading {
  background: var(--color-scope-private);
}

.progress-fill.completed {
  background: var(--color-scope-global);
}

.progress-fill.failed {
  background: var(--color-danger);
}
.locked-bar {
  display: flex;
}
.progress-fill.lock-enc {
  background: var(--color-ink);
  transition: width 0.12s linear;
}
.progress-fill.lock-up {
  background: color-mix(in srgb, var(--color-ink) 45%, transparent);
  transition: width 0.12s linear;
}
.lock-steps {
  display: flex;
  gap: 0.75rem;
  margin-top: 4px;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.lock-steps .on {
  color: var(--color-text-primary);
  font-weight: 600;
}
.lock-steps .done {
  color: var(--color-scope-global);
}
</style>
