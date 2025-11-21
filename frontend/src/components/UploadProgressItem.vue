<script setup>
defineProps({
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
  margin-bottom: 4px;
}

.file-name {
  font-size: 12px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.status-indicator {
  font-size: 12px;
  font-weight: 500;
  min-width: 40px;
  text-align: right;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
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
