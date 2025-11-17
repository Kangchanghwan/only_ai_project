<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'

import HomeScreen from './components/HomeScreen.vue'
import RoomScreen from './components/RoomScreen.vue'
import NotificationToast from './components/NotificationToast.vue'

// Composables
const roomManager = useRoomManager()
const fileManager = useFileManager()
const clipboard = useClipboard()
const socket = useSocket()

// 상태
const notification = ref(null)

// 알림 표시
function showNotification(message) {
  notification.value = message
  setTimeout(() => {
    notification.value = null
  }, 3000)
}

// 새 룸 생성 (자동)
async function handleCreateNewRoom() {
  // 이미 connect()에서 룸이 생성되므로 여기서는 아무것도 하지 않음
  if (socket.currentRoomNr.value) {
    roomManager.joinRoomByCode(socket.currentRoomNr.value.toString())
    showNotification(`룸 ${socket.currentRoomNr.value}이 생성되었습니다`)
  }
}

// 룸 입장
async function enterRoom(roomCode) {
  try {
    // Socket.io 룸 입장
    const roomNr = parseInt(roomCode)
    const { users } = await socket.joinRoom(roomNr)

    // 로컬 상태 업데이트
    roomManager.joinRoomByCode(roomCode)

    // 초기 파일 목록 로드
    await fileManager.loadFiles(roomCode)

    showNotification(`룸 ${roomCode}에 입장했습니다 (${users}명)`)
  } catch (error) {
    console.error('룸 입장 실패:', error)
    showNotification('룸 입장에 실패했습니다')
  }
}

// 룸 나가기
function handleLeaveRoom() {
  socket.disconnect()
  fileManager.clearFiles()
  roomManager.leaveRoom()
}

// 클립보드 붙여넣기 처리
async function handlePaste(event) {
  if (!roomManager.currentRoomId.value) return

  const imageFiles = clipboard.extractImagesFromPaste(event)

  if (imageFiles.length === 0) return

  for (const file of imageFiles) {
    try {
      showNotification('업로드 중...')

      const result = await fileManager.uploadFile(roomManager.currentRoomId.value, file)

      showNotification('이미지 업로드 완료!')

      // Socket.io로 다른 사용자에게 알림
      socket.publishMessage({
        type: 'file-uploaded',
        fileName: result.fileName,
        url: result.url,
        roomId: roomManager.currentRoomId.value
      })

      // 로컬에 즉시 추가
      await fileManager.loadFiles(roomManager.currentRoomId.value)
    } catch (err) {
      console.error('업로드 실패:', err)
      showNotification('업로드 실패: ' + err.message)
    }
  }
}

// 이미지 복사
async function handleCopyImage(imageUrl) {
  showNotification('복사 중...')

  const result = await clipboard.copyImage(imageUrl)

  if (result.success) {
    showNotification('클립보드에 복사됨! ✓')
  } else {
    // 폴백: 새 탭에서 열기
    window.open(imageUrl, '_blank')
    showNotification('새 탭에서 열었습니다')
  }
}

// 룸 코드 복사
async function handleCopyRoomCode() {
  if (!roomManager.currentRoomId.value) return

  const result = await clipboard.copyText(roomManager.currentRoomId.value)

  if (result.success) {
    showNotification('룸 코드 복사됨!')
  } else {
    showNotification('복사 실패')
  }
}

// 라이프사이클
onMounted(async () => {
  try {
    // Socket.io 연결 및 자동 룸 생성
    const { roomNr } = await socket.connect()

    // 자동으로 생성된 룸으로 입장
    roomManager.joinRoomByCode(roomNr.toString())
    showNotification(`룸 ${roomNr}이 생성되었습니다`)

    // 메시지 수신 이벤트 리스너
    socket.onMessage(async (message) => {
      console.log('메시지 수신:', message)

      if (message.type === 'file-uploaded') {
        showNotification('새 파일이 업로드되었습니다!')

        // 파일 목록 새로고침
        if (roomManager.currentRoomId.value) {
          await fileManager.loadFiles(roomManager.currentRoomId.value)
        }
      }
    })

    // 사용자 퇴장 이벤트
    socket.onUserLeft((userCount) => {
      console.log('사용자 퇴장, 현재 인원:', userCount)
      showNotification(`현재 ${userCount}명이 룸에 있습니다`)
    })

    // 클립보드 붙여넣기 이벤트
    document.addEventListener('paste', handlePaste)
  } catch (error) {
    console.error('초기화 실패:', error)
    showNotification('서버 연결에 실패했습니다')
  }
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
  socket.disconnect()
})
</script>

<template>
  <div id="app">
    <!-- 룸 화면 (자동 생성됨) -->
    <RoomScreen
      v-if="roomManager.currentRoomId.value"
      :room-id="roomManager.currentRoomId.value"
      :files="fileManager.files.value"
      :is-loading="fileManager.isLoading.value"
      :user-count="socket.usersInRoom.value"
      @leave-room="handleLeaveRoom"
      @copy-room-code="handleCopyRoomCode"
      @copy-image="handleCopyImage"
      @join-other-room="enterRoom"
    />

    <!-- 로딩 화면 -->
    <div v-else class="loading-screen">
      <div class="spinner"></div>
      <p>룸 생성 중...</p>
    </div>

    <!-- 알림 토스트 -->
    <NotificationToast :message="notification" />
  </div>
</template>

<style scoped>
#app {
  width: 100%;
  min-height: 100vh;
}

.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-screen p {
  font-size: 1.2rem;
  opacity: 0.8;
}
</style>
