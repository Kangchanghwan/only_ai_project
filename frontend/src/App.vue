<script setup>
/**
 * App.vue - 메인 애플리케이션 컴포넌트
 *
 * 전체 공유 룸(room-shared)과 IP 격리 룸에 동시 입장합니다.
 * 업로드 시 공유 대상을 선택할 수 있습니다.
 */
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'
import { useNotification } from './composables/useNotification'
import { useDownload } from './composables/useDownload'
import { useTextShare } from './composables/useTextShare'
import { useShareScope } from './composables/useShareScope'
import { parseRoute } from './utils/router'

import RoomScreen from './components/RoomScreen.vue'
import DownloadPage from './components/DownloadPage.vue'
import NotificationToast from './components/NotificationToast.vue'
import ShareConfirmSheet from './components/ShareConfirmSheet.vue'

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
const shareScope = useShareScope()
const isConnecting = ref(false)
const currentRoute = ref({ type: 'home' })

// 현재 선택된 scope('ip'|'global')에 대응하는 룸 ID — 피드 필터링/업로드 대상 공통 기준
const activeRoomId = computed(() => roomManager.roomIdForScope(shareScope.scope.value))

// 화면에 표시할 파일/텍스트를 활성 scope로 필터링한다.
// 실제 데이터 로딩(loadFilesFromRooms, 소켓 수신)은 두 룸 모두 백그라운드로 계속 진행되며,
// 필터링은 표시 시점에만 적용되므로 탭 전환은 네트워크 요청 없이 즉시 반영된다.
const visibleFiles = computed(() =>
  fileManager.files.value.filter(f => f.roomId === activeRoomId.value)
)
const visibleTexts = computed(() =>
  textShare.sharedTexts.value.filter(t => t.roomId === activeRoomId.value)
)

// 이벤트 리스너 cleanup 함수들을 저장
let cleanupUserLeft = null
let cleanupOnMessage = null

// ========================================
// 재연결 콜백 등록
// ========================================

socket.onReconnected(() => {
  console.log('[App] 재연결 완료')
  roomManager.setRooms({
    globalRoomId: socket.globalRoomId.value,
    ipRoomId: socket.ipRoomId.value
  })

  // 기존 이벤트 리스너 정리 후 재설정
  if (cleanupUserLeft) cleanupUserLeft()
  if (cleanupOnMessage) cleanupOnMessage()
  setupSocketListeners()

  // 파일 목록 다시 로드
  fileManager.clearFiles()
  textShare.clearAllTexts()
  fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: 10 })

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

    // 소켓 연결 (자동으로 전체 공유 룸 + IP 격리 룸에 입장)
    const { globalRoomId, ipRoomId } = await socket.connect()

    roomManager.setRooms({ globalRoomId, ipRoomId })
    // 파일 로딩을 백그라운드에서 실행 (초기 10개만)
    fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: 10 })
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
      if (roomManager.roomIds.value.length > 0) {
        fileManager.loadFilesFromRooms(roomManager.roomIds.value)
      }
    } else if (message.type === 'text-shared') {
      const exists = textShare.sharedTexts.value.some(t => t.id === message.textId)
      if (!exists) {
        const newText = {
          id: message.textId,
          content: message.content,
          timestamp: message.timestamp,
          roomId: message.roomId
        }
        textShare.sharedTexts.value.push(newText)
        notification.showInfo('새 텍스트가 공유되었습니다!')
      }
    } else if (message.type === 'text-removed') {
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
      textShare.clearTextsForRoom(message.roomId)
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
  if (roomManager.roomIds.value.length === 0) return

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
  if (roomManager.roomIds.value.length === 0) return
  if (!files || files.length === 0) return

  await uploadFiles(files)
}

async function uploadFiles(files, scopeOverride) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = scopeOverride || shareScope.getScope()
  const targetRoomId = roomManager.roomIdForScope(targetScope)

  if (!targetRoomId) {
    notification.showError('공유 대상 룸을 찾을 수 없습니다.')
    return
  }

  const maxRoomSizeMB = import.meta.env.VITE_MAX_ROOM_SIZE_MB || 500
  const MAX_ROOM_SIZE = maxRoomSizeMB * 1024 * 1024
  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
  const currentRoomSize = fileManager.roomSize(targetRoomId)

  if (currentRoomSize + totalUploadSize > MAX_ROOM_SIZE) {
    const currentSizeMB = (currentRoomSize / 1024 / 1024).toFixed(2)
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
        targetRoomId,
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
        roomId: targetRoomId
      }, targetScope)

      fileManager.addFile({
        name: result.fileName,
        url: result.url,
        size: result.size,
        created: result.created,
        roomId: targetRoomId
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

async function handleAddText(content, scopeOverride) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = scopeOverride || shareScope.scope.value
  const targetRoomId = roomManager.roomIdForScope(targetScope)
  if (!targetRoomId) return

  const newText = textShare.addText(content, targetRoomId)
  if (!newText) return

  socket.publishMessage({
    type: 'text-shared',
    textId: newText.id,
    content: newText.content,
    timestamp: newText.timestamp,
    roomId: targetRoomId
  }, targetScope)

  notification.showSuccess('텍스트가 공유되었습니다!')
}

async function handleRemoveText(textId) {
  if (roomManager.roomIds.value.length === 0) return

  const removed = textShare.removeText(textId)
  if (!removed) return

  const targetScope = removed.roomId === roomManager.globalRoomId.value ? 'global' : 'ip'

  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: removed.roomId
  }, targetScope)
}

async function handleClearAllTexts() {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.scope.value
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  textShare.clearTextsForRoom(targetRoomId)

  socket.publishMessage({
    type: 'texts-cleared',
    roomId: targetRoomId
  }, targetScope)

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
  if (roomManager.roomIds.value.length === 0) return

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
  if (!file?.roomId) return

  try {
    await fileManager.deleteFile(file.roomId, file.name)
    notification.showSuccess(`${file.name} 삭제됨`)
  } catch (error) {
    notification.showError(`삭제 실패: ${error.message}`)
  }
}

async function handleDeleteSelected(files) {
  if (!files || files.length === 0) return

  if (!window.confirm(`선택한 ${files.length}개 파일을 삭제하시겠습니까?`)) return

  let successCount = 0
  let failCount = 0

  for (const file of files) {
    try {
      await fileManager.deleteFile(file.roomId, file.name)
      successCount++
    } catch (error) {
      failCount++
      console.error(`[App] 파일 삭제 실패: ${file.name}`, error)
    }
  }

  if (successCount > 0) {
    notification.showSuccess(`${successCount}개 파일 삭제 완료`)
  }
  if (failCount > 0) {
    notification.showError(`${failCount}개 파일 삭제 실패`)
  }
}

async function handleClearStorage() {
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  if (!window.confirm('저장소의 모든 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return

  try {
    await fileManager.deleteAllFiles(targetRoomId)
    notification.showSuccess('저장소가 초기화되었습니다')
  } catch (error) {
    console.error('[App] 저장소 초기화 실패:', error)
    notification.showError('초기화 실패')
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

// 모바일 Share Sheet 확인 시트 상태
const isShareConfirmOpen = ref(false)
const shareConfirmSummary = ref({ fileCount: 0, hasText: false })
let shareConfirmResolve = null

/**
 * 확인 시트를 열고 사용자가 scope를 고르거나 취소할 때까지 대기한다.
 * 취소 시 null을 resolve한다.
 */
function requestShareConfirmation(fileCount, hasText) {
  shareConfirmSummary.value = { fileCount, hasText }
  isShareConfirmOpen.value = true
  return new Promise((resolve) => {
    shareConfirmResolve = resolve
  })
}

function handleShareConfirm(scope) {
  isShareConfirmOpen.value = false
  shareConfirmResolve?.(scope)
  shareConfirmResolve = null
}

function handleShareCancel() {
  isShareConfirmOpen.value = false
  shareConfirmResolve?.(null)
  shareConfirmResolve = null
}

/**
 * Service Worker에서 공유 데이터를 가져와 확인 시트를 거쳐 업로드/텍스트 공유 처리
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

    const fileList = data.files && data.files.length > 0 ? Array.from(data.files) : []
    const textParts = [data.title, data.text, data.url].filter(Boolean)
    const combinedText = textParts.join('\n').trim()

    if (fileList.length === 0 && !combinedText) {
      console.log('[App] Share target 데이터에 파일/텍스트가 없어 확인 시트를 생략')
      return
    }

    const scope = await requestShareConfirmation(fileList.length, Boolean(combinedText))
    if (!scope) {
      console.log('[App] 사용자가 공유를 취소함')
      return
    }

    if (fileList.length > 0) {
      await uploadFiles(fileList, scope)
    }

    if (combinedText) {
      await handleAddText(combinedText, scope)
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
    <div class="app-frame">
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
        :room-id="activeRoomId"
        :files="visibleFiles"
        :texts="visibleTexts"
        :is-loading="fileManager.isLoading.value || isConnecting"
        :user-count="socket.usersInRoom.value"
        :scope="shareScope.scope.value"
        :ip-room-devices="socket.ipRoomDevices.value"
        :global-room-devices="socket.globalRoomDevices.value"
        :has-more="fileManager.hasMoreForRoom(activeRoomId)"
        @copy-image="handleCopyImage"
        @upload-files="handleUploadFiles"
        @select-scope="shareScope.setScope"
        @download-file="handleDownloadFile"
        @download-parallel="handleDownloadParallel"
        @copy-selected-to-clipboard="handleCopySelectedToClipboard"
        @delete-file="handleDeleteFile"
        @delete-selected="handleDeleteSelected"
        @clear-storage="handleClearStorage"
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

      <!-- 모바일 Share Sheet 공유 확인 시트 -->
      <ShareConfirmSheet
        :is-open="isShareConfirmOpen"
        :file-count="shareConfirmSummary.fileCount"
        :has-text="shareConfirmSummary.hasText"
        @confirm="handleShareConfirm"
        @cancel="handleShareCancel"
      />
    </div>
  </div>
</template>

<style scoped>
#app {
  display: flex;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
}

/* 데스크톱에서도 모바일 폭(480px)의 "폰 프레임"으로 렌더링한다.
   position:fixed 요소(하단 액션바 등)는 실제 뷰포트에 고정된 채로 두고,
   각 요소 쪽에서 프레임 폭에 맞춰 스스로 중앙 정렬한다 (contain으로 containing
   block을 바꾸면 fixed 요소가 스크롤에 따라 같이 움직여버리기 때문에 사용하지 않음). */
.app-frame {
  position: relative;
  width: 100%;
  max-width: 30rem;
  min-height: 100dvh;
  background-color: var(--color-surface);
  box-shadow: 0 0 3.125rem rgba(22, 28, 1, 0.1);
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
