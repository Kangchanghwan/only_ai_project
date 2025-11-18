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
import { onMounted, onUnmounted } from 'vue'
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

// 이벤트 리스너 cleanup 함수들을 저장
let cleanupUserLeft = null

// ========================================
// 룸 관리 함수
// ========================================

/**
 * 룸에 입장합니다.
 *
 * Socket.IO를 통해 서버의 룸에 입장하고, 로컬 상태를 업데이트합니다.
 * 입장 후 해당 룸의 파일 목록을 불러옵니다.
 *
 * @param {string} roomCode - 입장할 룸 코드
 */
async function enterRoom(roomCode) {
  try {
    // Socket.io 룸 입장
    const roomNr = parseInt(roomCode)
    const { users } = await socket.joinRoom(roomNr)

    // 로컬 상태 업데이트
    roomManager.joinRoomByCode(roomCode)

    // 초기 파일 목록 로드
    await fileManager.loadFiles(roomCode)

    notification.showSuccess(`룸 ${roomCode}에 입장했습니다 (${users}명)`)
  } catch (error) {
    console.error('[App] 룸 입장 실패:', error)
    notification.showError('룸 입장에 실패했습니다')
  }
}

/**
 * 현재 룸에서 나갑니다.
 *
 * 소켓 연결을 해제하고, 파일 목록 및 룸 상태를 초기화합니다.
 */
function handleLeaveRoom() {
  console.log('[App] 룸 나가기')

  socket.disconnect()
  fileManager.clearFiles()
  roomManager.leaveRoom()

  notification.showInfo('룸에서 나왔습니다')
}

// ========================================
// 파일 업로드 및 공유
// ========================================

/**
 * 클립보드 붙여넣기 이벤트를 처리합니다.
 *
 * Vue 3 Best Practice: 이벤트 리스너는 onMounted에서 등록하고 onUnmounted에서 해제
 *
 * @param {ClipboardEvent} event - 클립보드 이벤트
 */
async function handlePaste(event) {
  // 룸에 입장하지 않은 경우 무시
  if (!roomManager.currentRoomId.value) {
    console.log('[App] 룸에 입장하지 않아 붙여넣기를 무시합니다')
    return
  }

  // 클립보드에서 이미지 파일 추출
  const imageFiles = clipboard.extractImagesFromPaste(event)

  if (imageFiles.length === 0) {
    console.log('[App] 붙여넣기에서 이미지를 찾지 못했습니다')
    return
  }

  console.log(`[App] ${imageFiles.length}개의 이미지 파일 발견`)

  // 각 이미지 파일을 업로드
  for (const file of imageFiles) {
    try {
      notification.showInfo('업로드 중...')

      const result = await fileManager.uploadFile(roomManager.currentRoomId.value, file)

      notification.showSuccess('이미지 업로드 완료!')

      // Socket.io로 다른 사용자에게 알림
      socket.publishMessage({
        type: 'file-uploaded',
        fileName: result.fileName,
        url: result.url,
        roomId: roomManager.currentRoomId.value
      })

      // 로컬 파일 목록 새로고침
      await fileManager.loadFiles(roomManager.currentRoomId.value)
    } catch (err) {
      console.error('[App] 업로드 실패:', err)
      notification.showError('업로드 실패: ' + err.message)
    }
  }
}

/**
 * 이미지를 클립보드에 복사합니다.
 *
 * @param {string} imageUrl - 복사할 이미지 URL
 */
async function handleCopyImage(imageUrl) {
  notification.showInfo('복사 중...')

  const result = await clipboard.copyImage(imageUrl)

  if (result.success) {
    notification.showSuccess('클립보드에 복사됨!')
  } else {
    // 폴백: 새 탭에서 열기
    window.open(imageUrl, '_blank')
    notification.showInfo('새 탭에서 열었습니다')
  }
}

/**
 * 룸 코드를 클립보드에 복사합니다.
 */
async function handleCopyRoomCode() {
  if (!roomManager.currentRoomId.value) {
    console.warn('[App] 현재 룸이 없습니다')
    return
  }

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

/**
 * 컴포넌트가 마운트될 때 실행됩니다.
 *
 * Vue 3 Best Practice:
 * - onMounted에서 초기화 로직 실행
 * - 이벤트 리스너 등록
 * - 비동기 작업 처리
 */
onMounted(async () => {
  try {
    console.log('[App] 애플리케이션 초기화 시작')

    // Socket.io 연결 및 자동 룸 생성
    const { roomNr } = await socket.connect()

    // 자동으로 생성된 룸으로 입장
    roomManager.joinRoomByCode(roomNr.toString())
    notification.showSuccess(`룸 ${roomNr}이 생성되었습니다`)

    console.log('[App] 룸 생성 및 입장 완료:', roomNr)

    // ========================================
    // Socket.IO 이벤트 리스너 등록
    // ========================================

    /**
     * 메시지 수신 이벤트
     * 다른 사용자가 파일을 업로드하면 파일 목록을 새로고침합니다.
     */
    socket.onMessage(async (message) => {
      console.log('[App] 메시지 수신:', message)

      if (message.type === 'file-uploaded') {
        notification.showInfo('새 파일이 업로드되었습니다!')

        // 파일 목록 새로고침
        if (roomManager.currentRoomId.value) {
          await fileManager.loadFiles(roomManager.currentRoomId.value)
        }
      }
    })

    /**
     * 사용자 퇴장 이벤트
     * 룸의 사용자 수가 변경되면 알림을 표시합니다.
     * cleanup 함수를 저장하여 언마운트 시 이벤트 리스너를 정리합니다.
     */
    cleanupUserLeft = socket.onUserLeft((userCount) => {
      console.log('[App] 사용자 퇴장, 현재 인원:', userCount)
      notification.showInfo(`현재 ${userCount}명이 룸에 있습니다`)
    })

    // ========================================
    // 전역 이벤트 리스너 등록
    // ========================================

    // 클립보드 붙여넣기 이벤트
    document.addEventListener('paste', handlePaste)

    console.log('[App] 애플리케이션 초기화 완료')
  } catch (error) {
    console.error('[App] 초기화 실패:', error)
    notification.showError('서버 연결에 실패했습니다')
  }
})

/**
 * 컴포넌트가 언마운트될 때 실행됩니다.
 *
 * Vue 3 Best Practice:
 * - onUnmounted에서 이벤트 리스너 해제
 * - 리소스 정리로 메모리 누수 방지
 */
onUnmounted(() => {
  console.log('[App] 애플리케이션 정리 시작')

  // Socket.IO 이벤트 리스너 해제
  if (cleanupUserLeft) {
    cleanupUserLeft()
  }

  // 전역 이벤트 리스너 해제
  document.removeEventListener('paste', handlePaste)

  // 소켓 연결 해제
  socket.disconnect()

  console.log('[App] 애플리케이션 정리 완료')
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
