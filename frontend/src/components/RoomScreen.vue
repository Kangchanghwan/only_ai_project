<script setup>
import { ref } from 'vue'

const props = defineProps({
  roomId: {
    type: String,
    required: true
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
  }
})

const emit = defineEmits(['leave-room', 'copy-room-code', 'copy-image', 'join-other-room'])

const showJoinModal = ref(false)
const joinRoomCode = ref('')

function formatTime(created) {
  if (!created) return '방금 전'
  return new Date(created).toLocaleString('ko-KR')
}

function handleJoinOtherRoom() {
  const code = joinRoomCode.value.trim()
  if (code) {
    emit('join-other-room', code)
    showJoinModal.value = false
    joinRoomCode.value = ''
  }
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>📋 Clipboard Share</h1>
    </div>

    <div class="room-info">
      <div class="room-code-section">
        <h3>🔗 룸 코드:</h3>
        <div class="room-code">{{ roomId }}</div>
        <p class="hint">다른 디바이스에서 이 코드로 입장하세요 ({{ userCount }}명 접속 중)</p>
      </div>
      <div class="room-actions">
        <button class="btn btn-secondary btn-small" @click="$emit('copy-room-code')">
          📋 코드 복사
        </button>
        <button class="btn btn-secondary btn-small" @click="showJoinModal = true">
          🔄 다른 룸 입장
        </button>
      </div>
    </div>

    <!-- 다른 룸 입장 모달 -->
    <div v-if="showJoinModal" class="modal active" @click.self="showJoinModal = false">
      <div class="modal-content">
        <h3>다른 룸 입장</h3>
        <input
          v-model="joinRoomCode"
          type="text"
          placeholder="6자리 룸 번호 입력"
          maxlength="6"
          @keyup.enter="handleJoinOtherRoom"
          autofocus
        />
        <div class="modal-buttons">
          <button class="btn btn-secondary btn-small" @click="showJoinModal = false">취소</button>
          <button class="btn btn-primary btn-small" @click="handleJoinOtherRoom">입장</button>
        </div>
      </div>
    </div>

    <div class="instructions">
      <ul>
        <li><strong>Ctrl+V</strong> (Mac: Cmd+V) - 클립보드의 이미지를 업로드</li>
        <li><strong>클릭</strong> - 이미지를 클립보드에 복사</li>
        <li>업로드된 이미지는 실시간으로 모든 디바이스에 표시됩니다</li>
      </ul>
    </div>

    <!-- 빈 상태 -->
    <div v-if="files.length === 0" class="empty-state">
      <div class="icon">📸</div>
      <p>Ctrl+V (Cmd+V)로 이미지를 붙여넣으세요</p>
    </div>

    <!-- 갤러리 -->
    <div v-else class="gallery">
      <div
        v-for="file in files"
        :key="file.name"
        class="image-card"
        @click="$emit('copy-image', file.url)"
      >
        <img :src="file.url" :alt="file.name" loading="lazy">
        <div class="image-info">
          <div class="time">{{ formatTime(file.created) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h1 {
  font-size: 3rem;
  color: white;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
}

.room-info {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 30px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.room-code-section {
  flex: 1;
}

.room-code-section h3 {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-bottom: 8px;
  color: white;
}

.room-code {
  font-size: 2rem;
  font-weight: bold;
  color: #ffd700;
  letter-spacing: 3px;
}

.hint {
  font-size: 0.9rem;
  opacity: 0.7;
  margin-top: 5px;
  color: white;
}

.room-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 18px 40px;
  font-size: 1.2rem;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-small {
  padding: 10px 20px;
  font-size: 0.9rem;
  border-radius: 8px;
}

.instructions {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  margin-bottom: 30px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.instructions ul {
  list-style: none;
  padding-left: 0;
}

.instructions li {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.instructions li:last-child {
  border-bottom: none;
}

.instructions strong {
  color: #ffd700;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  opacity: 0.7;
  color: white;
}

.empty-state .icon {
  font-size: 5rem;
  margin-bottom: 20px;
}

.empty-state p {
  font-size: 1.3rem;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.image-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.image-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.image-card img {
  width: 100%;
  height: 250px;
  object-fit: cover;
  display: block;
}

.image-info {
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  color: white;
}

.image-info .time {
  font-size: 0.85rem;
  opacity: 0.8;
}

.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(5px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.modal.active {
  display: flex;
}

.modal-content {
  background: white;
  color: #333;
  padding: 40px;
  border-radius: 20px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
}

.modal-content h3 {
  font-size: 1.8rem;
  margin-bottom: 20px;
  color: #667eea;
}

.modal-content input {
  width: 100%;
  padding: 15px;
  font-size: 1.5rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
  letter-spacing: 3px;
  font-weight: bold;
}

.modal-content input:focus {
  outline: none;
  border-color: #667eea;
}

.modal-buttons {
  display: flex;
  gap: 10px;
}

.modal-buttons .btn {
  flex: 1;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
}

@media (max-width: 768px) {
  .header h1 {
    font-size: 2rem;
  }

  .room-code {
    font-size: 1.5rem;
  }

  .gallery {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }

  .image-card img {
    height: 150px;
  }
}
</style>
