<script setup>
import UploadProgressItem from './UploadProgressItem.vue'

const props = defineProps({
  message: {
    type: String,
    default: null
  },
  uploads: {
    type: Map,
    default: () => new Map()
  }
})
</script>

<template>
  <!-- 기존 메시지 알림 -->
  <transition name="fade">
    <div v-if="message" class="notification">
      {{ message }}
    </div>
  </transition>

  <!-- 업로드/다운로드 프로그레스 패널 -->
  <transition name="fade">
    <div v-if="uploads && uploads.size > 0" class="upload-panel">
      <div class="upload-header">
        진행 중 ({{ uploads.size }}개)
      </div>
      <div class="upload-list">
        <UploadProgressItem
          v-for="[id, upload] in uploads"
          :key="id"
          :file-name="upload.fileName"
          :percent="upload.percent"
          :status="upload.status"
        />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 15px 25px;
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 업로드 패널 스타일 */
.upload-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 15px;
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 280px;
  max-width: 320px;
  animation: slideIn 0.3s ease;
}

.upload-header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.upload-list {
  max-height: 300px;
  overflow-y: auto;
}

/* 업로드 패널이 있을 때 알림 위치 조정 */
.notification + .upload-panel,
.upload-panel ~ .notification {
  top: 80px;
}
</style>
