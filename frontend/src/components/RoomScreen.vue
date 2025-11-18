<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  roomId: {
    type: String,
    default: null
  },
  files: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  userCount: {
    type: Number,
    default: 1
  },
  isConnecting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['copy-room-code', 'copy-image', 'join-other-room'])

const joinRoomCode = ref('')

// 환경 변수에서 최대 파일 크기 가져오기 (기본값: 10MB)
const maxFileSizeMB = computed(() => import.meta.env.VITE_MAX_FILE_SIZE_MB || 10)

function formatTime(created) {
  if (!created) return '방금 전'
  const now = new Date()
  const past = new Date(created)
  const diff = Math.round((now - past) / 1000)

  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.round(diff / 60)}분 전`
  if (diff < 86400) return `${Math.round(diff / 3600)}시간 전`
  return past.toLocaleDateString('ko-KR')
}

function handleJoinOtherRoom() {
  const code = joinRoomCode.value.trim().toUpperCase()
  if (code && code.length === 6) {
    emit('join-other-room', code)
    joinRoomCode.value = ''
  }
}
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="logo">
        <span class="logo-icon">📋</span>
        <span class="logo-text">Clipboard Share</span>
      </div>
      <div class="room-controls">
        <span class="user-count">{{ userCount }}명 접속 중</span>
        <div class="room-join">
          <input
            v-model="joinRoomCode"
            type="text"
            placeholder="다른 룸 코드로 입장"
            maxlength="6"
            class="room-join-input"
            :disabled="isConnecting"
            @keyup.enter="handleJoinOtherRoom"
          />
          <button class="room-join-button" :disabled="isConnecting" @click="handleJoinOtherRoom">→</button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div class="room-info">
        <span class="room-code-label">현재 룸 코드:</span>
        <div v-if="isConnecting" class="connecting-indicator">
          <div class="spinner-small"></div>
          <span>연결 중...</span>
        </div>
        <template v-else-if="roomId">
          <span class="room-code" @click="$emit('copy-room-code')">{{ roomId }}</span>
          <button class="copy-button" @click="$emit('copy-room-code')">복사</button>
        </template>
      </div>

      <div class="instructions">
        <p>📋 <strong>Ctrl+V</strong> (Cmd+V)로 이미지를 붙여넣거나, <strong>클릭</strong>해서 복사하세요.</p>
        <p class="file-size-limit">⚠️ 파일 크기 제한: {{ maxFileSizeMB }}MB 이하</p>
      </div>

      <div v-if="isLoading" class="loading-gallery">
        <div class="spinner"></div>
      </div>

      <div v-else-if="files.length === 0" class="empty-state">
        <div class="empty-icon">🖼️</div>
        <p>이 룸은 아직 비어있습니다.</p>
        <p class="sub-text">클립보드의 이미지를 붙여넣어 공유를 시작하세요.</p>
      </div>

      <div v-else class="gallery">
        <div
          v-for="file in files"
          :key="file.name"
          class="image-card"
          @click="$emit('copy-image', file.url)"
        >
          <img :src="file.url" :alt="file.name" loading="lazy" class="image-preview" />
          <div class="image-overlay">
            <span class="image-time">{{ formatTime(file.created) }}</span>
            <span class="image-copy-hint">클릭해서 복사</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
:root {
  --background-color: #1a1a1a;
  --surface-color: #2a2a2a;
  --primary-color: #42b883;
  --text-color: #e0e0e0;
  --text-secondary-color: #a0a0a0;
  --border-color: #3a3a3a;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem;
  color: var(--text-color);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.logo-icon {
  font-size: 2rem;
}

.room-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.user-count {
  font-size: 0.9rem;
  color: var(--text-secondary-color);
  white-space: nowrap;
}

.room-join {
  display: flex;
}

.room-join-input {
  background-color: var(--surface-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 0.5rem 1rem;
  border-radius: 8px 0 0 8px;
  width: 180px;
  font-size: 0.9rem;
  text-transform: uppercase;
}
.room-join-input::placeholder {
  color: var(--text-secondary-color);
  text-transform: none;
}
.room-join-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.room-join-button {
  background-color: var(--primary-color);
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0 8px 8px 0;
  cursor: pointer;
  font-weight: bold;
}

.room-join-input:disabled,
.room-join-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main-content {
  background-color: var(--surface-color);
  border-radius: 12px;
  padding: 2rem;
  border: 1px solid var(--border-color);
}

.room-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 1.2rem;
  min-height: 38px; /* To prevent layout shift */
}

.connecting-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.2rem;
  color: var(--text-secondary-color);
}

.spinner-small {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.room-code-label {
  color: var(--text-secondary-color);
}

.room-code {
  font-weight: bold;
  font-size: 1.5rem;
  color: var(--primary-color);
  cursor: pointer;
}

.copy-button {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary-color);
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
}
.copy-button:hover {
  background-color: var(--border-color);
  color: var(--text-color);
}

.instructions {
  margin-bottom: 2rem;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  color: var(--text-secondary-color);
  font-size: 0.9rem;
}

.instructions p {
  margin: 0.5rem 0;
}

.instructions p:first-child {
  margin-top: 0;
}

.instructions p:last-child {
  margin-bottom: 0;
}

.file-size-limit {
  font-size: 0.8rem;
  color: #ffa500;
  opacity: 0.9;
}

.loading-gallery, .empty-state {
  text-align: center;
  padding: 4rem 0;
  color: var(--text-secondary-color);
}

.loading-gallery .spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state p {
  font-size: 1.2rem;
  color: var(--text-color);
}
.empty-state .sub-text {
  font-size: 0.9rem;
  color: var(--text-secondary-color);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
}

.image-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.image-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.image-preview {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.image-card:hover .image-overlay {
  opacity: 1;
}

.image-time {
  font-size: 0.8rem;
  font-weight: 500;
}

.image-copy-hint {
  font-size: 0.8rem;
  color: var(--text-secondary-color);
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
  .room-controls {
    width: 100%;
    justify-content: space-between;
  }
  .room-join-input {
    width: 100%;
  }
  .gallery {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  .image-preview {
    height: 150px;
  }
}
</style>
