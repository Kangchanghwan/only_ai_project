<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

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

const emit = defineEmits([
  'copy-room-code',
  'copy-image',
  'join-other-room',
  'upload-files',
  'download-file',
  'download-selected',
  'download-all',
  'copy-selected-to-clipboard'
])

const joinRoomCode = ref('')
const fileInputRef = ref(null)
const isDragging = ref(false)
const selectedFiles = ref(new Set())

// 환경 변수에서 최대 파일 크기 가져오기 (기본값: 10MB)
const maxFileSizeMB = computed(() => import.meta.env.VITE_MAX_FILE_SIZE_MB || 10)

// 선택된 파일 개수
const selectedCount = computed(() => selectedFiles.value.size)

// 선택된 파일 배열
const selectedFilesArray = computed(() => {
  return props.files.filter(file => selectedFiles.value.has(file.name))
})

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

// 파일 업로드 핸들러
function openFileDialog() {
  fileInputRef.value?.click()
}

function handleFileSelect(event) {
  const files = event.target.files
  if (files && files.length > 0) {
    emit('upload-files', Array.from(files))
    // 입력 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = ''
  }
}

// 드래그 앤 드롭 핸들러
function handleDragOver(event) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event) {
  event.preventDefault()
  isDragging.value = false
}

function handleDrop(event) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    // 모든 파일 형식 허용
    emit('upload-files', Array.from(files))
  }
}

// 파일 선택/해제
function toggleFileSelection(fileName) {
  if (selectedFiles.value.has(fileName)) {
    selectedFiles.value.delete(fileName)
  } else {
    selectedFiles.value.add(fileName)
  }
  // Set은 반응성을 위해 새 객체로 교체
  selectedFiles.value = new Set(selectedFiles.value)
}

// 개별 파일 다운로드
function downloadFile(file, event) {
  event.stopPropagation() // 카드 클릭(이미지 복사) 이벤트 방지
  emit('download-file', file)
}

// 선택 항목 다운로드
function downloadSelected() {
  if (selectedCount.value > 0) {
    emit('download-selected', selectedFilesArray.value)
  }
}

// 전체 다운로드
function downloadAll() {
  emit('download-all', props.files)
}

// Ctrl+C 키보드 이벤트 핸들러
function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    if (selectedCount.value > 0) {
      emit('copy-selected-to-clipboard', selectedFilesArray.value)
      // 기본 동작(텍스트 복사) 방지하지 않음 - 클립보드 API는 별도로 처리
    }
  }
}

// 라이프사이클 훅
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
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

      <!-- 파일 업로드 영역 -->
      <div class="upload-section">
        <!-- 숨겨진 파일 입력 -->
        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display: none"
          @change="handleFileSelect"
        />

        <!-- 드래그 앤 드롭 영역 -->
        <div
          class="drop-zone"
          :class="{ 'drag-over': isDragging }"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <div class="drop-zone-content">
            <div class="upload-icon">📤</div>
            <p class="upload-title">파일을 드래그하거나 클릭하여 업로드</p>
            <button class="file-upload-button" @click="openFileDialog">
              📁 파일 선택
            </button>
          </div>
        </div>

        <!-- 업로드 방법 안내 -->
        <div class="upload-instructions">
          <p><strong>업로드 방법:</strong></p>
          <ul>
            <li>📁 <strong>파일 선택</strong>: 버튼을 클릭하여 파일 선택</li>
            <li>🖱️ <strong>드래그 앤 드롭</strong>: 파일을 위 영역으로 드래그</li>
            <li>📋 <strong>붙여넣기</strong>: Ctrl+V (Cmd+V)로 클립보드에서 붙여넣기</li>
          </ul>
          <p class="file-size-limit">⚠️ 파일 크기 제한: {{ maxFileSizeMB }}MB 이하</p>
        </div>
      </div>

      <div v-if="isLoading" class="loading-gallery">
        <div class="spinner"></div>
      </div>

      <div v-else-if="files.length === 0" class="empty-state">
        <div class="empty-icon">🖼️</div>
        <p>이 룸은 아직 비어있습니다.</p>
        <p class="sub-text">클립보드의 이미지를 붙여넣어 공유를 시작하세요.</p>
      </div>

      <div v-else>
        <!-- 다운로드 컨트롤 버튼 -->
        <div v-if="files.length > 0" class="download-controls">
          <button
            class="download-selected-button"
            :disabled="selectedCount === 0"
            @click="downloadSelected"
          >
            📥 선택 항목 다운로드 ({{ selectedCount }})
          </button>
          <button class="download-all-button" @click="downloadAll">
            📦 전체 다운로드
          </button>
          <span v-if="selectedCount > 0" class="keyboard-hint">
            💡 Tip: Ctrl+C로 클립보드 복사 (단일 파일만 가능, 다중 파일은 ZIP 다운로드 권장)
          </span>
        </div>

        <div class="gallery">
          <div
            v-for="file in files"
            :key="file.name"
            class="image-card"
            :class="{ selected: selectedFiles.has(file.name) }"
            @click="$emit('copy-image', file.url)"
          >
            <!-- 체크박스 -->
            <input
              type="checkbox"
              class="file-checkbox"
              :checked="selectedFiles.has(file.name)"
              @click.stop
              @change="toggleFileSelection(file.name)"
            />

            <img :src="file.url" :alt="file.name" loading="lazy" class="image-preview" />

            <div class="image-overlay">
              <span class="image-time">{{ formatTime(file.created) }}</span>
              <div class="overlay-buttons">
                <button
                  class="file-download-button"
                  @click="downloadFile(file, $event)"
                  title="다운로드"
                >
                  ⬇️
                </button>
                <span class="image-copy-hint">클릭해서 복사</span>
              </div>
            </div>
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

/* 파일 업로드 영역 */
.upload-section {
  margin-bottom: 2rem;
}

.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 3rem 2rem;
  text-align: center;
  background-color: rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  margin-bottom: 1.5rem;
}

.drop-zone:hover {
  border-color: var(--primary-color);
  background-color: rgba(66, 184, 131, 0.05);
}

.drop-zone.drag-over {
  border-color: var(--primary-color);
  background-color: rgba(66, 184, 131, 0.1);
  transform: scale(1.02);
}

.drop-zone-content {
  pointer-events: none;
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.upload-title {
  font-size: 1.1rem;
  color: var(--text-color);
  margin-bottom: 1.5rem;
}

.file-upload-button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.file-upload-button:hover {
  background-color: #35a372;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 184, 131, 0.3);
}

.file-upload-button:active {
  transform: translateY(0);
}

/* 업로드 방법 안내 */
.upload-instructions {
  padding: 1rem 1.5rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  color: var(--text-secondary-color);
  font-size: 0.9rem;
}

.upload-instructions p {
  margin: 0.5rem 0;
}

.upload-instructions strong {
  color: var(--text-color);
}

.upload-instructions ul {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}

.upload-instructions li {
  padding: 0.5rem 0;
  line-height: 1.5;
}

.file-size-limit {
  font-size: 0.8rem;
  color: #ffa500;
  opacity: 0.9;
  margin-top: 1rem;
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

/* 다운로드 컨트롤 */
.download-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  flex-wrap: wrap;
}

.download-selected-button,
.download-all-button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.download-selected-button:hover:not(:disabled),
.download-all-button:hover {
  background-color: #35a372;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 184, 131, 0.3);
}

.download-selected-button:disabled {
  background-color: var(--border-color);
  color: var(--text-secondary-color);
  cursor: not-allowed;
  opacity: 0.5;
}

.keyboard-hint {
  font-size: 0.85rem;
  color: var(--text-secondary-color);
  font-style: italic;
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
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.image-card.selected {
  border-color: var(--primary-color);
  border-width: 3px;
  box-shadow: 0 0 0 3px rgba(66, 184, 131, 0.2);
}

.image-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

/* 파일 체크박스 */
.file-checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  z-index: 10;
  accent-color: var(--primary-color);
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

.overlay-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.file-download-button {
  background-color: rgba(66, 184, 131, 0.9);
  border: none;
  color: white;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.file-download-button:hover {
  background-color: var(--primary-color);
  transform: scale(1.1);
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
