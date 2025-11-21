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
import { useDownload } from './composables/useDownload'
import { useTextShare } from './composables/useTextShare'

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
const download = useDownload()
const textShare = useTextShare()
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
    textShare.clearAllTexts()

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
    } else if (message.type === 'text-shared') {
      // 다른 사용자가 텍스트를 공유한 경우
      // 중복 방지: 이미 존재하는 ID는 무시
      const exists = textShare.sharedTexts.value.some(t => t.id === message.textId)
      if (!exists) {
        const newText = {
          id: message.textId,
          content: message.content,
          timestamp: message.timestamp
        }
        textShare.sharedTexts.value.push(newText)
        notification.showInfo('새 텍스트가 공유되었습니다!')
      }
    } else if (message.type === 'text-removed') {
      // 다른 사용자가 텍스트를 삭제한 경우
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
      // 다른 사용자가 모든 텍스트를 삭제한 경우
      textShare.clearAllTexts()
      notification.showInfo('모든 텍스트가 삭제되었습니다.')
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

  // 파일이 있는지 확인
  const files = clipboard.extractFilesFromPaste(event)

  if (files.length > 0) {
    // 파일이 있으면 파일 업로드
    await uploadFiles(files)
  } else {
    // 파일이 없으면 텍스트로 처리
    const pastedText = event.clipboardData?.getData('text')
    if (pastedText && pastedText.trim()) {
      await handleAddText(pastedText.trim())
    }
  }
}

async function handleUploadFiles(files) {
  if (!roomManager.currentRoomId.value) return
  if (!files || files.length === 0) return

  await uploadFiles(files)
}

async function uploadFiles(files) {
  if (!roomManager.currentRoomId.value) return

  // 1. 전체 용량 미리 검증
  const maxRoomSizeMB = import.meta.env.VITE_MAX_ROOM_SIZE_MB || 500
  const MAX_ROOM_SIZE = maxRoomSizeMB * 1024 * 1024
  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)

  if (fileManager.totalSize.value + totalUploadSize > MAX_ROOM_SIZE) {
    const currentSizeMB = (fileManager.totalSize.value / 1024 / 1024).toFixed(2)
    const uploadSizeMB = (totalUploadSize / 1024 / 1024).toFixed(2)
    notification.showError(
      `총 업로드 용량이 제한(${maxRoomSizeMB}MB)을 초과합니다. 현재: ${currentSizeMB}MB, 업로드: ${uploadSizeMB}MB`
    )
    return
  }

  // 2. 병렬 업로드 (프로그레스바 지원)
  const results = await Promise.allSettled(
    files.map(async (file) => {
      const uploadId = crypto.randomUUID()

      // 업로드 시작 - 프로그레스바에 추가
      notification.addUpload(uploadId, file.name)

      try {
        const result = await fileManager.uploadFile(
          roomManager.currentRoomId.value,
          file,
          {
            onProgress: (percent) => {
              notification.updateUpload(uploadId, percent)
            }
          }
        )

        // 업로드 완료
        notification.completeUpload(uploadId)

        // 2초 후 프로그레스바에서 제거
        setTimeout(() => {
          notification.removeUpload(uploadId)
        }, 2000)

        return { file, result, uploadId }
      } catch (error) {
        // 업로드 실패
        notification.failUpload(uploadId, error.message)

        // 5초 후 프로그레스바에서 제거
        setTimeout(() => {
          notification.removeUpload(uploadId)
        }, 5000)

        throw error
      }
    })
  )

  // 3. 결과 처리
  let successCount = 0
  let failCount = 0

  for (const settledResult of results) {
    if (settledResult.status === 'fulfilled') {
      const { file, result } = settledResult.value
      socket.publishMessage({
        type: 'file-uploaded',
        fileName: result.fileName,
        url: result.url,
        roomId: roomManager.currentRoomId.value
      })
      fileManager.addFile({
        name: result.fileName,
        url: result.url,
        size: result.size,
        created: result.created
      })
      successCount++
    } else {
      failCount++
      const err = settledResult.reason
      // 에러에서 파일명 추출 시도
      if (err.message.includes('MB를 초과할 수 없습니다')) {
        notification.showError(err.message)
      } else if (err.message.includes('비어있습니다')) {
        notification.showError(err.message)
      } else {
        notification.showError(`업로드 실패: ${err.message}`)
      }
    }
  }

  // 최종 결과 알림
  if (successCount > 0) {
    notification.showSuccess(`${successCount}개 파일 업로드 완료!`)
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
// 파일 다운로드 핸들러
// ========================================

async function handleDownloadFile(file) {
  notification.showInfo(`${file.name} 다운로드 중...`)
  const result = await download.downloadFile(file)
  if (result.success) {
    notification.showSuccess('다운로드 완료!')
  } else {
    notification.showError('다운로드 실패')
  }
}

async function handleDownloadSelected(files) {
  if (!files || files.length === 0) return

  notification.showInfo(`${files.length}개 파일을 ZIP으로 압축 중...`)
  const zipName = `clipboard-share-${Date.now()}.zip`
  const result = await download.downloadAsZip(files, zipName)

  if (result.success) {
    notification.showSuccess(`${files.length}개 파일 다운로드 완료!`)
  } else {
    notification.showError('ZIP 다운로드 실패')
  }
}

async function handleDownloadParallel(files) {
  if (!files || files.length === 0) return

  notification.showInfo(`${files.length}개 파일을 병렬로 다운로드 중...`)
  const result = await download.downloadParallel(files)

  if (result.success) {
    if (result.failCount > 0) {
      notification.showInfo(
        `${result.successCount}개 성공, ${result.failCount}개 실패`
      )
    } else {
      notification.showSuccess(`${result.successCount}개 파일 다운로드 완료!`)
    }
  } else {
    notification.showError('병렬 다운로드 실패')
  }
}

async function handleDownloadAll(files) {
  if (!files || files.length === 0) return

  notification.showInfo(`전체 ${files.length}개 파일을 ZIP으로 압축 중...`)
  const zipName = `clipboard-share-all-${Date.now()}.zip`
  const result = await download.downloadAsZip(files, zipName)

  if (result.success) {
    notification.showSuccess(`${files.length}개 파일 다운로드 완료!`)
  } else {
    notification.showError('ZIP 다운로드 실패')
  }
}

async function handleCopySelectedToClipboard(files) {
  if (!files || files.length === 0) return

  // 브라우저 제한으로 단일 파일만 클립보드 복사 가능
  if (files.length > 1) {
    notification.showInfo('클립보드에 첫 번째 파일만 복사됩니다...')
  } else {
    notification.showInfo('클립보드에 복사 중...')
  }

  const result = await download.copyFilesToClipboard(files)

  if (result.success) {
    if (result.totalCount > 1) {
      notification.showSuccess(
        `${files[0].name}이 클립보드에 복사됨! (${result.totalCount}개 중 1개)\n` +
        '💡 여러 파일은 "선택 항목 다운로드"를 사용하세요.'
      )
    } else {
      notification.showSuccess('클립보드에 복사됨!')
    }
  } else {
    notification.showError('클립보드 복사 실패')
  }
}

// ========================================
// 텍스트 공유 핸들러
// ========================================

async function handleAddText(content) {
  if (!roomManager.currentRoomId.value) return

  const newText = textShare.addText(content)
  if (!newText) return

  // 소켓을 통해 다른 사용자에게 전송
  socket.publishMessage({
    type: 'text-shared',
    textId: newText.id,
    content: newText.content,
    timestamp: newText.timestamp,
    roomId: roomManager.currentRoomId.value
  })

  notification.showSuccess('텍스트가 공유되었습니다!')
}

async function handleRemoveText(textId) {
  if (!roomManager.currentRoomId.value) return

  const removed = textShare.removeText(textId)
  if (!removed) return

  // 소켓을 통해 다른 사용자에게 전송
  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: roomManager.currentRoomId.value
  })
}

async function handleClearAllTexts() {
  if (!roomManager.currentRoomId.value) return

  textShare.clearAllTexts()

  // 소켓을 통해 다른 사용자에게 전송
  socket.publishMessage({
    type: 'texts-cleared',
    roomId: roomManager.currentRoomId.value
  })

  notification.showInfo('모든 텍스트가 삭제되었습니다.')
}

async function handleCopyText(textId) {
  const result = await textShare.copyTextToClipboard(textId)
  if (result.success) {
    notification.showSuccess('클립보드에 복사됨!')
  } else {
    notification.showError('복사 실패')
  }
}

// ========================================
// 라이프사이클 훅
// ========================================

onMounted(() => {
  // URL에서 룸 코드 파라미터 확인 (예: /#/ABC123)
  const hash = window.location.hash
  const roomCodeFromUrl = hash.startsWith('#/') ? hash.substring(2) : null

  if (roomCodeFromUrl && roomCodeFromUrl.length > 0) {
    // URL에 룸 코드가 있으면 해당 룸으로 연결
    connectToRoom(roomCodeFromUrl)
    // URL을 깨끗하게 정리
    window.history.replaceState(null, '', window.location.pathname)
  } else {
    // 일반적인 초기 룸 연결
    connectToRoom()
  }

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
      :texts="textShare.sharedTexts.value"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      @copy-room-code="handleCopyRoomCode"
      @copy-image="handleCopyImage"
      @join-other-room="connectToRoom"
      @upload-files="handleUploadFiles"
      @download-file="handleDownloadFile"
      @download-selected="handleDownloadSelected"
      @download-parallel="handleDownloadParallel"
      @download-all="handleDownloadAll"
      @copy-selected-to-clipboard="handleCopySelectedToClipboard"
      @remove-text="handleRemoveText"
      @clear-all-texts="handleClearAllTexts"
      @copy-text="handleCopyText"
    />

    <!-- 알림 토스트 -->
    <NotificationToast
      :message="notification.notification.value"
      :uploads="notification.uploads.value"
    />
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
