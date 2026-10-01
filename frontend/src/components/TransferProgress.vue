<script setup>
/**
 * 작업 영역 안(inline)에 표시되는 전송 진행 패널. 업로드/다운로드 진행 상태 자체는 App.vue가 관리하고
 * 이 컴포넌트는 props로 받아 그리기만 한다. 취소 이벤트는 그대로 위로 올린다.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UploadProgressItem from './UploadProgressItem.vue'

const { t } = useI18n()

const props = defineProps({
  uploads: { type: Map, default: () => new Map() }
})
const emit = defineEmits(['cancel-upload', 'cancel-all'])

/** 취소할 수 있는 진행 중 업로드 수 (다운로드·완료·실패 제외) */
const cancellableCount = computed(() => {
  let count = 0
  for (const upload of props.uploads.values()) {
    if (upload.cancellable && upload.status === 'uploading') count++
  }
  return count
})
</script>

<template>
  <div role="region"
    v-if="uploads && uploads.size > 0"
    class="upload-panel"
    data-testid="transfer-progress"
    data-prerender-strip
    :aria-label="t('notification.activeHeader', { count: uploads.size })"
  >
    <div class="upload-header">
      <span>{{ t('notification.activeHeader', { count: uploads.size }) }}</span>
      <button
        v-if="cancellableCount >= 2"
        type="button"
        class="cancel-all-btn"
        @click="emit('cancel-all')"
      >{{ t('notification.cancelAll') }}</button>
    </div>
    <div class="upload-list">
      <UploadProgressItem
        v-for="[id, upload] in uploads"
        :key="id"
        :file-name="upload.fileName"
        :percent="upload.percent"
        :status="upload.status"
        :cancellable="!!upload.cancellable"
        @cancel="emit('cancel-upload', id)"
      />
    </div>
  </div>
</template>

<style scoped>
.upload-panel {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-background);
  color: var(--color-text-primary);
}
.upload-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}
.cancel-all-btn {
  min-height: 44px;
  padding: 0 0.75rem;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
}
.cancel-all-btn:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.upload-list { max-height: 18rem; overflow-y: auto; }
</style>
