<script setup>
/**
 * App.vue - 메인 애플리케이션 컴포넌트
 *
 * Vue 3 Best Practice:
 * - <script setup> 사용으로 간결한 컴포넌트 작성
 * - Composables를 통한 로직 재사용
 * - 명확한 이벤트 핸들링
 * - onMounted/onUnmounted로 라이프사이클 관리
 */
import { onMounted, onUnmounted, watch, ref } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'
import { useNotification } from './composables/useNotification'

import RoomScreen from './components/RoomScreen.vue'
import NotificationToast from './components/NotificationToast.vue'

// ========================================
// Composables 초기화
// ========================================

const roomManager = useRoomManager()
const fileManager = useFileManager()
const clipboard = useClipboard()
const socket = useSocket()
const notification = useNotification()
const isConnecting = ref(false)

// 이벤트 리스너 cleanup 함수들을 저장
let cleanupUserLeft = null
let cleanupOnMessage = null

// ========================================
// 룸 관리 및 소켓 통신
// ========================================

/**
 * 특정 룸에 연결하고 관련 이벤트 리스너를 설정합니다.
 * @param {string} [roomCode] - 입장할 룸 코드. 없으면 새로 생성합니다.
 */
async function connectToRoom(roomCode) {
  isConnecting.value = true
  await new Promise((resolve) => setTimeout(resolve, 1000))
  try {
    // 기존 연결 및 리스너 정리
    if (socket.isConnected.value) {
      socket.disconnect()
    }
    if (cleanupUserLeft) cleanupUserLeft()
    if (cleanupOnMessage) cleanupOnMessage()
    fileManager.clearFiles()

    // 소켓 연결
    const { roomNr } = await socket.connect()
    let targetRoom = roomCode || roomNr.toString()

    // 룸 입장
    if (roomCode) {
      await socket.joinRoom(parseInt(roomCode))
    }

    roomManager.joinRoomByCode(targetRoom)
    await fileManager.loadFiles(targetRoom)
    notification.showSuccess(`룸 ${targetRoom}에 연결되었습니다.`)

    // 새 이벤트 리스너 설정
    setupSocketListeners()
  } catch (error) {
    console.error('[App] 룸 연결 실패:', error)
    notification.showError(error.message || '룸 연결에 실패했습니다.')
    // 실패 시 초기 화면으로 돌아가기 위해 룸 ID를 null로 설정
    roomManager.leaveRoom()
  } finally {
    isConnecting.value = false
  }
}

/**
 * 소켓 이벤트 리스너를 설정합니다.
 */
function setupSocketListeners() {
  cleanupOnMessage = socket.onMessage(async (message) => {
    if (message.type === 'file-uploaded') {
      notification.showInfo('새 파일이 업로드되었습니다!')
      if (roomManager.currentRoomId.value) {
        await fileManager.loadFiles(roomManager.currentRoomId.value)
      }
    }
  })

  cleanupUserLeft = socket.onUserLeft((userCount) => {
    notification.showInfo(`현재 ${userCount}명이 룸에 있습니다.`)
  })
}

// ========================================
// 파일 및 클립보드 핸들러
// ========================================

async function handlePaste(event) {
  if (!roomManager.currentRoomId.value) return
  const imageFiles = clipboard.extractImagesFromPaste(event)
  if (imageFiles.length === 0) return

  notification.showInfo('업로드 중...')
  for (const file of imageFiles) {
    try {
      const result = await fileManager.uploadFile(roomManager.currentRoomId.value, file)
      socket.publishMessage({
        type: 'file-uploaded',
        fileName: result.fileName,
        url: result.url,
        roomId: roomManager.currentRoomId.value
      })
      // 로컬 목록에 즉시 추가 (UX 개선)
      fileManager.addFile(result)
      notification.showSuccess('이미지 업로드 완료!')
    } catch (err) {
      // 파일 크기 제한 에러는 더 명확한 메시지로 표시
      if (err.message.includes('MB를 초과할 수 없습니다')) {
        notification.showError(`${file.name}: ${err.message}`)
      } else if (err.message.includes('비어있습니다')) {
        notification.showError('파일이 비어있습니다')
      } else {
        notification.showError('업로드 실패: ' + err.message)
      }
    }
  }
}

async function handleCopyImage(imageUrl) {
  notification.showInfo('복사 중...')
  const result = await clipboard.copyImage(imageUrl)
  if (result.success) {
    notification.showSuccess('클립보드에 복사됨!')
  } else {
    window.open(imageUrl, '_blank')
    notification.showInfo('새 탭에서 열었습니다.')
  }
}

async function handleCopyRoomCode() {
  if (!roomManager.currentRoomId.value) return
  const result = await clipboard.copyText(roomManager.currentRoomId.value)
  if (result.success) {
    notification.showSuccess('룸 코드 복사됨!')
  } else {
    notification.showError('복사 실패')
  }
}

// ========================================
// 라이프사이클 훅
// ========================================

onMounted(() => {
  connectToRoom() // 초기 룸 연결
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  if (cleanupUserLeft) cleanupUserLeft()
  if (cleanupOnMessage) cleanupOnMessage()
  document.removeEventListener('paste', handlePaste)
  socket.disconnect()
})
</script>

<template>
  <div id="app">
    <RoomScreen
      :is-connecting="isConnecting"
      :room-id="roomManager.currentRoomId.value"
      :files="fileManager.files.value"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      @copy-room-code="handleCopyRoomCode"
      @copy-image="handleCopyImage"
      @join-other-room="connectToRoom"
    />

    <!-- 알림 토스트 -->
    <NotificationToast :message="notification.notification.value" />
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
