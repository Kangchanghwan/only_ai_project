<script setup>
/**
 * App.vue - 메인 애플리케이션 컴포넌트
 *
 * 단일 공유 룸(room-shared)에 자동 입장합니다.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'
import { useNotification } from './composables/useNotification'
import { useDownload } from './composables/useDownload'
import { useTextShare } from './composables/useTextShare'
import { parseRoute } from './utils/router'

import RoomScreen from './components/RoomScreen.vue'
import DownloadPage from './components/DownloadPage.vue'
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
const currentRoute = ref({ type: 'home' })

// 이벤트 리스너 cleanup 함수들을 저장
let cleanupUserLeft = null
let cleanupOnMessage = null

// ========================================
// 재연결 콜백 등록
// ========================================

socket.onReconnected(() => {
  console.log('[App] 재연결 완료')
  roomManager.enterSharedRoom()

  // 기존 이벤트 리스너 정리 후 재설정
  if (cleanupUserLeft) cleanupUserLeft()
  if (cleanupOnMessage) cleanupOnMessage()
  setupSocketListeners()

  // 파일 목록 다시 로드
  fileManager.clearFiles()
  textShare.clearAllTexts()
  fileManager.loadFiles(roomManager.currentRoomId.value, { limit: 10 })

  notification.showSuccess('재연결 완료')
})

// ========================================
// 룸 관리 및 소켓 통신
// ========================================

/**
 * 공유 룸에 연결하고 관련 이벤트 리스너를 설정합니다.
 */
async function connectToRoom() {
  isConnecting.value = true
  await new Promise((resolve) => setTimeout(resolve, 245))
  try {
    // 기존 연결 및 리스너 정리
    if (socket.isConnected.value) {
      socket.disconnect()
    }
    if (cleanupUserLeft) cleanupUserLeft()
    if (cleanupOnMessage) cleanupOnMessage()
    fileManager.clearFiles()
    textShare.clearAllTexts()

    // 소켓 연결 (자동으로 room-shared에 입장)
    await socket.connect()

    roomManager.enterSharedRoom()
    // 파일 로딩을 백그라운드에서 실행 (초기 10개만)
    fileManager.loadFiles(roomManager.currentRoomId.value, { limit: 10 })
    notification.showSuccess('연결되었습니다.')

    // 새 이벤트 리스너 설정
    setupSocketListeners()
  } catch (error) {
    console.error('[App] 연결 실패:', error)
    notification.showError(error.message || '연결에 실패했습니다.')
    roomManager.leaveRoom()
  } finally {
    isConnecting.value = false
  }
}

/**
 * 소켓 이벤트 리스너를 설정합니다.
 */
function setupSocketListeners() {
  cleanupOnMessage = socket.onMessage((message) => {
    if (message.type === 'file-uploaded') {
      notification.showInfo('새 파일이 업로드되었습니다!')
      if (roomManager.currentRoomId.value) {
        fileManager.loadFiles(roomManager.currentRoomId.value)
      }
    } else if (message.type === 'text-shared') {
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
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
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

  const files = clipboard.extractFilesFromPaste(event)

  if (files.length > 0) {
    await uploadFiles(files)
  } else {
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

  let successCount = 0
  let failCount = 0

  // 파일을 순차적으로 업로드
  for (const file of files) {
    const uploadId = crypto.randomUUID()
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

      notification.completeUpload(uploadId)

      setTimeout(() => {
        notification.removeUpload(uploadId)
      }, 1500)
    } catch (error) {
      failCount++
      notification.failUpload(uploadId, error.message)

      if (error.message.includes('MB를 초과할 수 없습니다')) {
        notification.showError(error.message)
      } else if (error.message.includes('비어있습니다')) {
        notification.showError(error.message)
      } else {
        notification.showError(`업로드 실패: ${error.message}`)
      }

      setTimeout(() => {
        notification.removeUpload(uploadId)
      }, 5000)
    }
  }

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

// ========================================
// 파일 다운로드 핸들러
// ========================================

async function handleDownloadFile(file) {
  const downloadId = crypto.randomUUID()
  notification.addUpload(downloadId, file.name)

  const result = await download.downloadFile(file)

  if (result.success) {
    notification.completeUpload(downloadId)
    setTimeout(() => {
      notification.removeUpload(downloadId)
    }, 1500)
    notification.showSuccess('다운로드 완료!')
  } else {
    notification.failUpload(downloadId, result.error?.message || '다운로드 실패')
    setTimeout(() => {
      notification.removeUpload(downloadId)
    }, 5000)
    notification.showError('다운로드 실패')
  }
}

async function handleDownloadParallel(files) {
  if (!files || files.length === 0) return

  notification.showInfo(`${files.length}개 파일을 다운로드 중...`)

  const downloadIds = new Map()

  const result = await download.downloadParallel(files, {
    onProgress: (file, status, error) => {
      if (status === 'start') {
        const downloadId = crypto.randomUUID()
        downloadIds.set(file.name, downloadId)
        notification.addUpload(downloadId, file.name)
      } else if (status === 'complete') {
        const downloadId = downloadIds.get(file.name)
        if (downloadId) {
          notification.completeUpload(downloadId)
          setTimeout(() => {
            notification.removeUpload(downloadId)
          }, 1500)
        }
      } else if (status === 'failed') {
        const downloadId = downloadIds.get(file.name)
        if (downloadId) {
          notification.failUpload(downloadId, error?.message || '다운로드 실패')
          setTimeout(() => {
            notification.removeUpload(downloadId)
          }, 5000)
        }
      }
    }
  })

  if (result.success) {
    if (result.failCount > 0) {
      notification.showInfo(
        `${result.successCount}개 성공, ${result.failCount}개 실패`
      )
    } else {
      notification.showSuccess(`${result.successCount}개 파일 다운로드 완료!`)
    }
  } else {
    notification.showError('다운로드 실패')
  }
}

async function handleCopySelectedToClipboard(files) {
  if (!files || files.length === 0) return

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
        '여러 파일은 "선택 항목 다운로드"를 사용하세요.'
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

  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: roomManager.currentRoomId.value
  })
}

async function handleClearAllTexts() {
  if (!roomManager.currentRoomId.value) return

  textShare.clearAllTexts()

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

async function handlePasteContent() {
  if (!roomManager.currentRoomId.value) return

  try {
    const clipboardItems = await navigator.clipboard.read()

    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        const file = new File([blob], `clipboard-image-${Date.now()}.png`, { type: imageType })
        await uploadFiles([file])
        return
      }

      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain')
        const text = await blob.text()
        if (text && text.trim()) {
          await handleAddText(text.trim())
        }
        return
      }
    }

    notification.showInfo('클립보드가 비어있습니다.')
  } catch (error) {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim()) {
        await handleAddText(text.trim())
      } else {
        notification.showInfo('클립보드가 비어있습니다.')
      }
    } catch (textError) {
      console.error('[App] 클립보드 읽기 실패:', textError)
      notification.showError('클립보드 접근 권한이 필요합니다.')
    }
  }
}

async function handleDeleteFile(file) {
  if (!roomManager.currentRoomId.value) return

  try {
    await fileManager.deleteFile(roomManager.currentRoomId.value, file.name)
    notification.showSuccess(`${file.name} 삭제됨`)
  } catch (error) {
    notification.showError(`삭제 실패: ${error.message}`)
  }
}

async function handleLoadMore() {
  try {
    await fileManager.loadMore({ limit: 10 })
    console.log('[App] 추가 파일 로드 완료')
  } catch (error) {
    console.error('[App] 추가 파일 로드 실패:', error)
    notification.showError('추가 파일 로드에 실패했습니다.')
  }
}

// ========================================
// 라이프사이클 훅
// ========================================

/**
 * Service Worker에서 공유 데이터를 가져와 업로드/텍스트 공유 처리
 */
async function handleShareTargetData() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    console.warn('[App] Service Worker not ready for share target')
    return
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => reject(new Error('SW timeout')), 3000)

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data?.data || null)
      }

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_SHARE_DATA' },
        [channel.port2]
      )
    })

    if (!data) {
      console.log('[App] No share data from SW')
      return
    }

    // 파일이 있으면 업로드
    if (data.files && data.files.length > 0) {
      const fileList = Array.from(data.files)
      await uploadFiles(fileList)
    }

    // 텍스트가 있으면 공유 (text, url, title 조합)
    const textParts = [data.title, data.text, data.url].filter(Boolean)
    const combinedText = textParts.join('\n').trim()
    if (combinedText) {
      await handleAddText(combinedText)
    }
  } catch (error) {
    console.error('[App] Share target 처리 실패:', error)
  }
}

onMounted(async () => {
  const hash = window.location.hash
  currentRoute.value = parseRoute(hash)

  console.log('[App] 라우트 파싱 결과:', currentRoute.value)

  // 다운로드 페이지인 경우 소켓 연결하지 않고 바로 렌더링
  if (currentRoute.value.type === 'download') {
    console.log('[App] 다운로드 페이지 렌더링')
    return
  }

  // share-target 파라미터 감지
  const isShareTarget = new URLSearchParams(window.location.search).has('share-target')

  // 공유 룸에 연결
  await connectToRoom()

  // Web Share Target으로 진입한 경우 공유 데이터 처리
  if (isShareTarget) {
    console.log('[App] Share target 감지, 공유 데이터 처리 중...')
    await handleShareTargetData()
  }

  // URL을 깨끗하게 정리
  window.history.replaceState(null, '', window.location.pathname)

  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  if (cleanupUserLeft) cleanupUserLeft()
  if (cleanupOnMessage) cleanupOnMessage()
  document.removeEventListener('paste', handlePaste)
  socket.destroy()
})
</script>

<template>
  <div id="app">
    <!-- 다운로드 페이지 -->
    <DownloadPage
      v-if="currentRoute.type === 'download'"
      :room-id="currentRoute.roomId"
      :file-names-base64="currentRoute.fileNamesBase64"
    />

    <!-- 일반 룸 화면 -->
    <RoomScreen
      v-else
      :is-connecting="isConnecting"
      :room-id="roomManager.currentRoomId.value"
      :files="fileManager.files.value"
      :texts="textShare.sharedTexts.value"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      :has-more="fileManager.hasMore.value"
      @copy-image="handleCopyImage"
      @upload-files="handleUploadFiles"
      @download-file="handleDownloadFile"
      @download-parallel="handleDownloadParallel"
      @copy-selected-to-clipboard="handleCopySelectedToClipboard"
      @delete-file="handleDeleteFile"
      @remove-text="handleRemoveText"
      @clear-all-texts="handleClearAllTexts"
      @copy-text="handleCopyText"
      @paste-content="handlePasteContent"
      @load-more="handleLoadMore"
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
