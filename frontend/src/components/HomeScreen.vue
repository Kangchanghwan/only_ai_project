<script setup>
import { ref } from 'vue'

const emit = defineEmits(['create-room', 'join-room'])

const showJoinModal = ref(false)
const joinRoomCode = ref('')

function handleCreateRoom() {
  emit('create-room')
}

function handleJoinRoom() {
  const code = joinRoomCode.value.trim()
  if (code) {
    emit('join-room', code)
    showJoinModal.value = false
    joinRoomCode.value = ''
  }
}
</script>

<template>
  <div class="home-screen">
    <div class="logo">📋</div>
    <h2>Clipboard Share</h2>
    <p>다른 디바이스와 이미지를 실시간으로 공유하세요</p>

    <div class="action-buttons">
      <button class="btn btn-primary" @click="handleCreateRoom">
        🎲 새 룸 만들기
      </button>
      <button class="btn btn-secondary" @click="showJoinModal = true">
        🔗 룸 코드로 입장
      </button>
    </div>

    <!-- 룸 입장 모달 -->
    <div v-if="showJoinModal" class="modal active" @click.self="showJoinModal = false">
      <div class="modal-content">
        <h3>룸 코드 입력</h3>
        <input
          v-model="joinRoomCode"
          type="text"
          placeholder="예: ABC123"
          maxlength="6"
          @keyup.enter="handleJoinRoom"
          style="text-transform: uppercase"
        />
        <div class="modal-buttons">
          <button class="btn btn-secondary" @click="showJoinModal = false">취소</button>
          <button class="btn btn-primary" @click="handleJoinRoom">입장</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-screen {
  max-width: 500px;
  margin: 60px auto;
  text-align: center;
  padding: 20px;
}

.logo {
  font-size: 6rem;
  margin-bottom: 30px;
}

h2 {
  font-size: 2.5rem;
  margin-bottom: 20px;
  color: white;
}

p {
  font-size: 1.1rem;
  opacity: 0.9;
  margin-bottom: 40px;
  color: white;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
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

.btn-primary {
  background: white;
  color: #667eea;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.3);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
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
  font-size: 1.1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 2px;
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
  padding: 12px;
  font-size: 1rem;
}

@media (max-width: 768px) {
  .logo {
    font-size: 4rem;
  }

  h2 {
    font-size: 1.8rem;
  }
}
</style>
