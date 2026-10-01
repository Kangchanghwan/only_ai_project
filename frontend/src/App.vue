<script setup>
/**
 * App.vue - 메인 애플리케이션 컴포넌트
 *
 * 전체 공유 룸(room-shared)과 IP 격리 룸에 동시 입장합니다.
 * 업로드 시 공유 대상을 선택할 수 있습니다.
 */
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'
import { useNotification } from './composables/useNotification'
import { useDownload } from './composables/useDownload'
import { useTextShare } from './composables/useTextShare'
import { useShareScope } from './composables/useShareScope'
import { useSeoMeta } from './composables/useSeoMeta'
import { parseRoute } from './utils/router'
import { applyFileMessage } from './utils/applyFileMessage'
import { trackEvent } from './utils/analytics'
import { formatSizeMB } from './utils/fileUtils'
import { socketService } from './services/socketService'
import { startP2pProbe } from './services/p2pProbe'
import { openFileInNewTab } from './utils/openFile'
import { createUploadProgress, cancelUpload, cancelAllUploads } from './utils/uploadProgress'
import { createNewDeviceTracker } from './utils/newDevices'
import { isValidIdentity, describeJoined } from './utils/identity'
import { t } from './i18n/translate'

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
// 로케일에 맞춰 title/description/og/canonical/lang을 갱신 (언어 전환 시 자동 반영)
useSeoMeta()
const isConnecting = ref(false)

// 같은 네트워크(ipRoom)에 새 기기가 들어오면 토스트로 알린다.
// 내 접속 직후의 초기 목록, 이미 본 기기의 재접속(연결 복구), 내 기기, 전체 공유 방은 알리지 않는다.
const newDeviceTracker = createNewDeviceTracker()
watch(
  () => socket.ipRoomDevices.value,
  (devices) => {
    const fresh = newDeviceTracker.update(devices, socket.mySocketId.value)
    const joined = fresh.filter((d) => isValidIdentity(d.identity))
    if (joined.length === 0) return
    notification.showInfo(describeJoined(joined[joined.length - 1], t))
    trackEvent('new_device_toast')
  }
)

async function handleRerollIdentity() {
  const result = await socket.rerollIdentity()
  if (result?.ok) trackEvent('identity_reroll')
}

const currentRoute = ref({ type: 'home' })

// 룸별 목록 페이지 크기. 백엔드가 최신순으로 정렬해 주므로 첫 페이지가 곧 최신 파일들이다.
// 10개였을 때는 R2 이름순 첫 10개만 보여 방금 올린 파일이 "더 보기" 뒤에 숨는 문제가 있었다.
const FILE_PAGE_SIZE = 50

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
  // 재접속 후 처음 받는 목록은 초기 목록으로 취급해 토스트를 띄우지 않는다
  newDeviceTracker.markInitial()
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
  fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: FILE_PAGE_SIZE })

  notification.showSuccess(t('notification.reconnected'))
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
    // 파일 로딩을 백그라운드에서 실행 (룸별 최신 FILE_PAGE_SIZE개, 나머지는 "더 보기")
    fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: FILE_PAGE_SIZE })
    notification.showSuccess(t('notification.connected'))

    // 새 이벤트 리스너 설정
    setupSocketListeners()

    // P2P 연결 사전 점검 (화면 변화 없음, 실패해도 무영향, 내부에서 예외를 모두 처리)
    startP2pProbe(socketService)
  } catch (error) {
    console.error('[App] 연결 실패:', error)
    notification.showError(error.message || t('notification.connectFailed'))
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
    if (message.type === 'file-uploaded' || message.type === 'file-deleted' || message.type === 'files-cleared') {
      // 메시지에 담긴 정보만으로 로컬 목록을 갱신한다 — 업로드마다 전체 목록을 재조회하지 않는다.
      // 정보가 부족한 구버전 메시지('reload')일 때만 기존처럼 재조회한다.
      const action = applyFileMessage(message, fileManager)
      if (action === 'added') {
        notification.showInfo(t('file.uploaded'))
      } else if (action === 'reload' && roomManager.roomIds.value.length > 0) {
        notification.showInfo(t('file.uploaded'))
        fileManager.loadFilesFromRooms(roomManager.roomIds.value)
      }
    } else if (message.type === 'text-shared') {
      const exists = textShare.sharedTexts.value.some(t => t.id === message.textId)
      if (!exists) {
        const newText = {
          id: message.textId,
          content: message.content,
          timestamp: message.timestamp,
          roomId: message.roomId,
          // 서버가 붙인 보낸 사람 (구버전 백엔드는 없음 → 표시 생략)
          ...(message.sender ? { sender: message.sender } : {})
        }
        textShare.sharedTexts.value.push(newText)
        notification.showInfo(t('text.newText'))
      }
    } else if (message.type === 'text-removed') {
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
      textShare.clearTextsForRoom(message.roomId)
      notification.showInfo(t('text.cleared'))
    }
  })

  cleanupUserLeft = socket.onUserLeft((userCount) => {
    notification.showInfo(t('room.userCount', { count: userCount }))
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
    notification.showError(t('notification.shareRoomNotFound'))
    return
  }

  const maxRoomSizeMB = import.meta.env.VITE_MAX_ROOM_SIZE_MB || 10240
  const MAX_ROOM_SIZE = maxRoomSizeMB * 1024 * 1024
  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
  const currentRoomSize = fileManager.roomSize(targetRoomId)

  if (currentRoomSize + totalUploadSize > MAX_ROOM_SIZE) {
    const currentSizeMB = (currentRoomSize / 1024 / 1024).toFixed(2)
    const uploadSizeMB = (totalUploadSize / 1024 / 1024).toFixed(2)
    notification.showError(
      t('notification.sizeLimitExceeded', { limit: formatSizeMB(maxRoomSizeMB), current: formatSizeMB(currentSizeMB), upload: formatSizeMB(uploadSizeMB) })
    )
    return
  }

  // 배치 presign 1회 + 제한 병렬 업로드. 성공한 파일은 useFileManager가 목록에 바로 반영한다.
  // 진행 카드는 실제 전송이 시작된 파일에만 만든다 (거절/사전 실패 파일은 토스트만).
  const progress = createUploadProgress(notification)

  const summary = await fileManager.uploadFiles(targetRoomId, files, {
    onQueue: (file, handle) => progress.queue(file, handle),
    onStart: (file) => progress.start(file),
    onCancel: (file, info) => progress.cancelled(file, info),
    onProgress: (file, percent) => progress.progress(file, percent),
    onComplete: (file, result) => {
      // size/created를 함께 보내 수신 측이 목록을 재조회하지 않고 바로 추가할 수 있게 한다
      try {
        socket.publishMessage({
          type: 'file-uploaded',
          fileName: result.fileName,
          url: result.url,
          size: result.size,
          created: result.created,
          roomId: targetRoomId
        }, targetScope)
      } catch (error) {
        console.warn('[App] 업로드 알림 전송 실패 (파일은 업로드됨):', error)
      }

      // 내가 올린 파일에 내 이름표를 붙인다 (목록 재조회 없이도 "나"로 표시)
      const uploader = socket.getSelfSender()
      if (uploader) {
        fileManager.addFile({ name: result.fileName, url: result.url, size: result.size, created: result.created, roomId: targetRoomId, uploader })
      }

      progress.complete(file)
    },
    onError: (file, error) => progress.fail(file, error),
    onResume: () => notification.showInfo(t('notification.uploadResumed'))
  })

  if (summary.successCount > 0) {
    // GA4 주요 이벤트: 실제로 업로드에 성공한 파일 수만 집계한다
    trackEvent('file_upload', { file_count: summary.successCount, scope: targetScope })
    notification.showSuccess(t('notification.uploadComplete', { count: summary.successCount }))
  }
}

/** 룸 ID에 해당하는 공유 scope ('global' | 'ip') */
function scopeForRoom(roomId) {
  return roomId === roomManager.globalRoomId.value ? 'global' : 'ip'
}

/** 같은 룸의 다른 클라이언트가 목록을 재조회하지 않고 삭제를 반영하도록 알린다 */
function publishFileDeleted(file) {
  try {
    socket.publishMessage({ type: 'file-deleted', fileName: file.name, roomId: file.roomId }, scopeForRoom(file.roomId))
  } catch (error) {
    console.warn('[App] 삭제 알림 전송 실패 (파일은 삭제됨):', error)
  }
}

async function handleCopyImage(imageUrl) {
  notification.showInfo(t('notification.copying'))
  const result = await clipboard.copyImage(imageUrl)
  if (result.success) {
    notification.showSuccess(t('file.copied'))
  } else {
    const file = fileManager.files.value.find(f => f.url === imageUrl) || { name: '', url: imageUrl }
    await openFileInNewTab(file)
    notification.showInfo(t('notification.openedNewTab'))
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
    trackEvent('file_download', { file_count: 1 })
    notification.showSuccess(t('file.downloadComplete'))
  } else {
    notification.failUpload(downloadId, result.error?.message || t('file.downloadFailed'))
    setTimeout(() => {
      notification.removeUpload(downloadId)
    }, 5000)
    notification.showError(t('file.downloadFailed'))
  }
}

async function handleDownloadParallel(files) {
  if (!files || files.length === 0) return

  notification.showInfo(t('notification.downloadingCount', { count: files.length }))

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
          notification.failUpload(downloadId, error?.message || t('file.downloadFailed'))
          setTimeout(() => {
            notification.removeUpload(downloadId)
          }, 5000)
        }
      }
    }
  })

  // GA4 주요 이벤트: 실제로 받아진 파일 수만 집계한다 (실패분 제외)
  if (result.success && result.successCount > 0) {
    trackEvent('file_download', { file_count: result.successCount })
  }

  if (result.success) {
    if (result.failCount > 0) {
      notification.showInfo(
        t('notification.downloadPartial', { success: result.successCount, fail: result.failCount })
      )
    } else {
      notification.showSuccess(t('notification.downloadCountComplete', { count: result.successCount }))
    }
  } else {
    notification.showError(t('file.downloadFailed'))
  }
}

async function handleCopySelectedToClipboard(files) {
  if (!files || files.length === 0) return

  if (files.length > 1) {
    notification.showInfo(t('notification.copyFirstOnly'))
  } else {
    notification.showInfo(t('notification.copyingToClipboard'))
  }

  const result = await download.copyFilesToClipboard(files)

  if (result.success) {
    if (result.totalCount > 1) {
      notification.showSuccess(
        t('notification.copiedWithCount', { name: files[0].name, total: result.totalCount })
      )
    } else {
      notification.showSuccess(t('file.copied'))
    }
  } else {
    notification.showError(t('file.copyFailed'))
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

  // 내가 보낸 텍스트에는 내 이름표를 붙인다 ("나"로 표시)
  const self = socket.getSelfSender()
  if (self) newText.sender = self

  socket.publishMessage({
    type: 'text-shared',
    textId: newText.id,
    content: newText.content,
    timestamp: newText.timestamp,
    roomId: targetRoomId
  }, targetScope)

  trackEvent('text_share', { scope: targetScope })

  notification.showSuccess(t('text.shared'))
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

  notification.showInfo(t('text.cleared'))
}

async function handleCopyText(textId) {
  const result = await textShare.copyTextToClipboard(textId)
  if (result.success) {
    notification.showSuccess(t('file.copied'))
  } else {
    notification.showError(t('file.copyFailed'))
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

    notification.showInfo(t('clipboard.empty'))
  } catch (error) {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim()) {
        await handleAddText(text.trim())
      } else {
        notification.showInfo(t('clipboard.empty'))
      }
    } catch (textError) {
      console.error('[App] 클립보드 읽기 실패:', textError)
      notification.showError(t('clipboard.permissionDenied'))
    }
  }
}

async function handleDeleteFile(file) {
  if (!file?.roomId) return

  try {
    await fileManager.deleteFile(file.roomId, file.name)
    publishFileDeleted(file)
    notification.showSuccess(t('notification.deleted', { name: file.name }))
  } catch (error) {
    notification.showError(t('notification.deleteFailed', { message: error.message }))
  }
}

async function handleDeleteSelected(files) {
  if (!files || files.length === 0) return

  if (!window.confirm(t('notification.confirmDeleteSelected', { count: files.length }))) return

  let successCount = 0
  let failCount = 0

  for (const file of files) {
    try {
      await fileManager.deleteFile(file.roomId, file.name)
      publishFileDeleted(file)
      successCount++
    } catch (error) {
      failCount++
      console.error(`[App] 파일 삭제 실패: ${file.name}`, error)
    }
  }

  if (successCount > 0) {
    notification.showSuccess(t('notification.deleteCountDone', { count: successCount }))
  }
  if (failCount > 0) {
    notification.showError(t('notification.deleteCountFailed', { count: failCount }))
  }
}

async function handleClearStorage() {
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  if (!window.confirm(t('notification.confirmClearStorage'))) return

  try {
    await fileManager.deleteAllFiles(targetRoomId)
    try {
      socket.publishMessage({ type: 'files-cleared', roomId: targetRoomId }, scopeForRoom(targetRoomId))
    } catch (publishError) {
      console.warn('[App] 초기화 알림 전송 실패 (파일은 삭제됨):', publishError)
    }
    notification.showSuccess(t('notification.storageCleared'))
  } catch (error) {
    console.error('[App] 저장소 초기화 실패:', error)
    notification.showError(t('notification.clearFailed'))
  }
}

async function handleLoadMore() {
  try {
    await fileManager.loadMore({ limit: FILE_PAGE_SIZE })
    console.log('[App] 추가 파일 로드 완료')
  } catch (error) {
    console.error('[App] 추가 파일 로드 실패:', error)
    notification.showError(t('notification.loadMoreFailed'))
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

  // 프리렌더 중에는 소켓에 연결하지 않아 정적 HTML에 접속 상태·토스트·룸 파일 목록이 구워지지 않게 한다
  if (window.__PRERENDER__) return

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
        :my-identity="socket.myIdentity.value"
        :my-socket-id="socket.mySocketId.value"
        :reroll-available-at="socket.rerollAvailableAt.value"
        @reroll-identity="handleRerollIdentity"
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
        @cancel-upload="cancelUpload"
        @cancel-all="cancelAllUploads"
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
