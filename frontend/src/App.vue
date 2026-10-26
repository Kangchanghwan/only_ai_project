<script setup>
/**
 * App.vue - 메인 애플리케이션 컴포넌트
 *
 * 전체 공유 룸(room-shared)과 IP 격리 룸에 동시 입장합니다.
 * 업로드 시 공유 대상을 선택할 수 있습니다.
 */
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useRoomManager } from './composables/useRoomManager'
import { useFileManager } from './composables/useFileManager'
import { useClipboard } from './composables/useClipboard'
import { useSocket } from './composables/useSocket'
import { useNotification } from './composables/useNotification'
import { useDownload } from './composables/useDownload'
import { useTextShare } from './composables/useTextShare'
import { useTextQueue, textBytes, TEXT_QUEUE_MAX_BYTES, TEXT_QUEUE_SENDER_QUOTA } from './composables/useTextQueue'
import { useShareScope, isPrivateScope, privateRoomIdOfScope, scopeForPrivateRoom } from './composables/useShareScope'
import { usePrivateRooms } from './composables/usePrivateRooms'
import { usePairFlow } from './composables/usePairFlow'
import { useSeoMeta } from './composables/useSeoMeta'
import { usePublicShareGuard } from './composables/usePublicShareGuard'
import { useLockState } from './composables/useLockState'
import { isEditableTarget } from './utils/editable'
import { parseRoute } from './utils/router'
import { applyFileMessage } from './utils/applyFileMessage'
import { trackEvent } from './utils/analytics'
import { useArrivalBadge } from './composables/useArrivalBadge'
import ArrivalNotifyPrompt from './components/ArrivalNotifyPrompt.vue'
import WindowDropOverlay from './components/WindowDropOverlay.vue'
import { parseSendLink, consumePendingSendLink } from './utils/sendLink'
import { formatSizeMB } from './utils/fileUtils'
import { socketService } from './services/socketService'
import { startP2pProbe } from './services/p2pProbe'
import { openFileInNewTab } from './utils/openFile'
import { createUploadProgress, cancelUpload, cancelAllUploads } from './utils/uploadProgress'
import { createNewDeviceTracker } from './utils/newDevices'
import { isValidIdentity, describeJoined, sameIdentity } from './utils/identity'
import { t } from './i18n/translate'

import RoomScreen from './components/RoomScreen.vue'
import DownloadPage from './components/DownloadPage.vue'
import LockedLinkPage from './components/LockedLinkPage.vue'
import NotificationToast from './components/NotificationToast.vue'
import ShareConfirmSheet from './components/ShareConfirmSheet.vue'
import PublicShareConfirm from './components/PublicShareConfirm.vue'
import PairRequestSheet from './components/PairRequestSheet.vue'
import PairConfirmSheet from './components/PairConfirmSheet.vue'

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
// 전체 공유로 처음 보낼 때 한 번 확인 (파일 선택/드롭/전역 붙여넣기/텍스트 공유 공통)
const publicGuard = usePublicShareGuard()
const lockState = useLockState()
// 로케일에 맞춰 title/description/og/canonical/lang을 갱신 (언어 전환 시 자동 반영)
useSeoMeta()
const isConnecting = ref(false)
const privateRooms = usePrivateRooms()
// 텍스트 10분 보관: 1:1 방은 방 키 암호문, 같은 네트워크·전체 공유는 잠금 꺼짐이면 평문, 켜짐이면 암호문
const textQueue = useTextQueue({ textShare, privateRooms, lockState, t, getMySocketId: () => socket.mySocketId?.value ?? null })

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

/** 목록 조회 대상: ip/global + 내가 들어가 있는 1:1 비공개 방 */
const allRoomIds = computed(() => [
  ...roomManager.roomIds.value,
  // 아직 입장권으로 다시 들어가지 못한 방('connecting')은 토큰이 없어 조회하지 않는다
  ...privateRooms.rooms.filter((r) => r.status !== 'connecting').map((r) => r.roomId)
])

/** 메시지의 roomId가 내가 들어간 방(ip, global, 내 비공개 방)인지 */
const isMyRoom = (roomId) =>
  !!roomId && (roomManager.roomIds.value.includes(roomId) || privateRooms.has(roomId))

/** socketService.publishMessage의 target: 'ip' | 'global' | 비공개 roomId */
const publishTargetForScope = (scope) => privateRoomIdOfScope(scope) ?? scope
function publishTargetForRoom(roomId) {
  if (privateRooms.has(roomId)) return roomId
  return roomId === roomManager.globalRoomId.value ? 'global' : 'ip'
}

// 1:1 연결 흐름 (요청/확인 시트, 완료 처리). 소켓 어댑터가 없는 환경(테스트)에서는 비활성
const pairFlow = usePairFlow({
  adapter: socketService.getPairAdapter?.() ?? null,
  privateRooms,
  notify: notification,
  track: trackEvent,
  t,
  leaveRoom: (roomId) => socket.leavePrivate?.(roomId),
  onRoomReady: async (roomId) => {
    // 새 1:1 탭으로 자동 이동하고, 그 방의 파일 목록을 불러온다
    shareScope.setScope(scopeForPrivateRoom(roomId))
    await fileManager.loadFilesFromRooms(allRoomIds.value, { limit: FILE_PAGE_SIZE })
  }
})
// 받은 요청 시트: 요청 + (내가 수락해서 상대 확인을 기다리는 동안 같은 시트의 대기 문구). 옛 흐름의 그림 확인 시트가 뜨면 숨긴다
const incomingSession = computed(() =>
  pairFlow.confirming.value ? null : pairFlow.incoming.value || pairFlow.respondedWaiting.value
)

const deviceIsPeer = (d, peer) =>
  !!peer && (peer.socketId ? d.socketId === peer.socketId : sameIdentity(d.identity, peer.identity))

/** 1:1 방 접속 기기 목록에서 상대 기기 찾기 (방에는 나와 상대뿐이므로 "내가 아닌 기기") */
const findPeerDevice = (devs, peer) => {
  const me = socket.mySocketId?.value
  return devs.find((d) => (me ? d.socketId !== me : deviceIsPeer(d, peer))) || null
}

// 상대 접속 상태: 그 방의 room-users에 상대가 있으면 접속 중, 없으면 오프라인(나갔다고 보지 않는다).
// 'left'는 private-left 메시지로만, 'connecting'은 입장권으로 다시 들어가기 전까지 그대로 둔다.
watch(
  () => [socket.privateRoomDevices?.value, privateRooms.rooms.length],
  () => {
    const byRoom = socket.privateRoomDevices?.value || {}
    for (const r of privateRooms.rooms) {
      if (r.status === 'left' || r.status === 'connecting') continue
      const devs = byRoom[r.roomId]
      if (!Array.isArray(devs)) continue
      const peerDev = findPeerDevice(devs, r.peer)
      if (peerDev) privateRooms.setPeer(r.roomId, peerDev)
      privateRooms.setStatus(r.roomId, peerDev ? 'online' : 'offline')
    }
  },
  { deep: true }
)

// 연결이 끊기면 서버 쪽 방 입장도 사라지므로, 다시 입장하기 전까지 "연결 중"으로 표시한다
watch(
  () => socket.isConnected?.value,
  (connected) => {
    if (connected !== false) return
    for (const r of privateRooms.rooms) if (r.status !== 'left') privateRooms.setStatus(r.roomId, 'connecting')
  }
)

// 저장된 1:1 방을 시작하자마자 "연결 중…" 탭으로 보여 준다 (IndexedDB 불가 시 빈 목록)
privateRooms.hydrate()

let rejoinRunning = null
/** 저장된 입장권으로 1:1 방에 다시 들어간다 (registered/재연결/연결 복구 뒤) */
function rejoinPrivateRooms() {
  if (!rejoinRunning) {
    rejoinRunning = doRejoinPrivateRooms()
      .catch((e) => console.warn('[App] 1:1 방 다시 입장 실패:', e?.message || e))
      .finally(() => { rejoinRunning = null })
  }
  return rejoinRunning
}

async function doRejoinPrivateRooms() {
  await privateRooms.hydrate()
  const targets = privateRooms.rooms.filter((r) => r.status !== 'left' && r.ticket)
  if (targets.length === 0 || typeof socket.joinPrivate !== 'function') return
  const res = await socket.joinPrivate(targets.map((r) => r.ticket))
  if (!res?.ok) return
  const me = socket.mySocketId?.value
  const joined = []
  for (const entry of res.rooms || []) {
    if (!privateRooms.has(entry.roomId)) continue
    privateRooms.setTicket(entry.roomId, entry.ticket)
    const devs = Array.isArray(entry.devices) ? entry.devices : []
    const peerDev = devs.find((d) => d.socketId !== me) || null
    if (peerDev) privateRooms.setPeer(entry.roomId, peerDev)
    privateRooms.setStatus(entry.roomId, peerDev ? 'online' : 'offline')
    joined.push(entry.roomId)
  }
  let expired = 0
  for (const ticket of res.invalid || []) {
    const r = targets.find((x) => x.ticket === ticket)
    if (!r) continue
    if (shareScope.scope.value === scopeForPrivateRoom(r.roomId)) shareScope.setScope('ip')
    privateRooms.removeRoom(r.roomId)
    expired++
  }
  if (expired > 0) notification.showInfo(t('pair.expired'))
  if (joined.length > 0) {
    trackEvent('pair_rejoin', { count: joined.length })
    textQueue.loadRooms(joined)
    await fileManager.loadFilesFromRooms(allRoomIds.value, { limit: FILE_PAGE_SIZE })
  }
}

async function handlePrivateLeave(roomId) {
  if (!privateRooms.has(roomId)) return
  const res = await socket.leavePrivate?.(roomId)
  if (res && !res.ok && res.code !== 'NOT_MEMBER') {
    notification.showError(t('pair.errors.leaveFailed'))
    return
  }
  trackEvent('pair_leave')
  if (shareScope.scope.value === scopeForPrivateRoom(roomId)) shareScope.setScope('ip')
  privateRooms.removeRoom(roomId)
  fileManager.clearRoomFiles?.(roomId)
  textShare.clearTextsForRoom(roomId)
}

function handlePrivateLeftMessage(message) {
  if (!privateRooms.has(message.roomId)) return
  // 상대가 연결을 끊음: 화면에는 안내용으로 남기고 내 저장소에서는 지운다(setStatus가 처리)
  privateRooms.setStatus(message.roomId, 'left')
  notification.showInfo(t('pair.peerLeftToast'))
}

// 현재 선택된 scope('ip'|'global')에 대응하는 룸 ID — 피드 필터링/업로드 대상 공통 기준
const activeRoomId = computed(() => roomManager.roomIdForScope(shareScope.scope.value))

// 화면에 표시할 파일/텍스트를 활성 scope로 필터링한다.
// 실제 데이터 로딩(loadFilesFromRooms, 소켓 수신)은 두 룸 모두 백그라운드로 계속 진행되며,
// 필터링은 표시 시점에만 적용되므로 탭 전환은 네트워크 요청 없이 즉시 반영된다.
const visibleFiles = computed(() =>
  fileManager.files.value.filter(f => f.roomId === activeRoomId.value)
)
// 보관 남은 시간 표시·만료 정리용 시계 (15초마다)
const nowTick = ref(Date.now())
let nowTimer = null
const visibleTexts = computed(() => {
  void lockState.version.value // 비밀번호를 확인하면 보관 취소 가능 여부가 바뀐다
  void nowTick.value // 15초마다 다시 계산 (텍스트가 바뀔 때도 다시 계산되므로 시각은 지금 값을 쓴다)
  const now = Date.now()
  return textShare.sharedTexts.value
    .filter(t => t.roomId === activeRoomId.value)
    .map((t) => {
      const queued = textQueue.isQueued(t, now)
      return { ...t, expiresAt: queued ? t.expiresAt : undefined, remainingMs: queued ? t.expiresAt - now : 0, canCancel: textQueue.canCancel(t, now) }
    })
})

/** 현재 범위에서 텍스트를 받을 수 있는 다른 기기 수 (나 제외) */
const textReceiverCount = computed(() => {
  const me = socket.mySocketId?.value
  const scope = shareScope.scope.value
  const prvId = privateRoomIdOfScope(scope)
  const devices = prvId
    ? socket.privateRoomDevices?.value?.[prvId] || []
    : scope === 'global' ? socket.globalRoomDevices.value : socket.ipRoomDevices.value
  return (devices || []).filter((d) => d.socketId !== me).length
})

/**
 * 지금 범위로 보내는 텍스트를 어떻게 보관하는지:
 * 'private' 1:1 방 키 암호문 | 'locked' 범위 잠금 암호문 | 'plain' 평문 | 'none' 보관 안 함(구버전 백엔드)
 */
const textStorageMode = computed(() => {
  if (textQueue.supported.value === false) return 'none'
  const scope = shareScope.scope.value
  if (isPrivateScope(scope)) return 'private'
  return lockState.isLocked(scope) ? 'locked' : 'plain'
})

// 비밀번호를 확인하면(잠긴 파일을 풀었거나 잠금을 켬) 같은 묶음의 잠긴 텍스트도 푼다
watch(() => lockState.version.value, () => textQueue.unlockKnown())

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
  fileManager.loadFilesFromRooms(allRoomIds.value, { limit: FILE_PAGE_SIZE })
  // 보관 중인 텍스트(10분)를 다시 받는다. 같은 textId는 한 번만 보인다
  textQueue.loadRooms(allRoomIds.value)
  // 1:1 방은 서버가 소켓별로 입장을 기억하므로 입장권으로 다시 들어간다 (끝나면 파일 목록도 다시 불러온다)
  rejoinPrivateRooms()

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
    // 내가 없는 동안 보관된 텍스트(10분)를 받는다 (1:1 방은 다시 입장한 뒤 불러온다)
    textQueue.loadRooms(roomManager.roomIds.value)
    notification.showSuccess(t('notification.connected'))
    // 저장된 1:1 방에 입장권으로 다시 들어간다 (백그라운드)
    rejoinPrivateRooms()

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

// 탭이 뒤에 있을 때 도착 표시 (제목 숫자·파비콘 점·선택 알림)
const isMobile = /iPhone|iPad|iPod|Android|Mobi/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')
const arrival = useArrivalBadge({ getMySocketId: () => socket.mySocketId?.value, isMobile })

/**
 * 받은 텍스트를 목록에 넣는다. 1:1 방은 암호문(enc)만 오며 평문 content는 쓰지 않는다.
 * 잠긴 텍스트는 이 범위 비밀번호를 확인한 기기에서만 풀린다. 같은 textId(내가 보낸 것의 되돌아옴 포함)는 한 번만.
 */
async function receiveText(message) {
  const added = await textQueue.ingest(message)
  if (!added) return
  notification.showInfo(t('text.newText'))
  arrival.onArrival({ kind: 'text', count: 1, sender: message.sender })
}

/**
 * 소켓 이벤트 리스너를 설정합니다.
 */
function setupSocketListeners() {
  cleanupOnMessage = socket.onMessage((message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'private-left') {
      handlePrivateLeftMessage(message)
      return
    }
    // 내가 들어간 방(ip, global, 내 1:1 방)이 아닌 roomId의 메시지는 무시한다
    if (!isMyRoom(message.roomId)) return
    if (message.type === 'file-uploaded' || message.type === 'file-deleted' || message.type === 'files-cleared') {
      // 메시지에 담긴 정보만으로 로컬 목록을 갱신한다 — 업로드마다 전체 목록을 재조회하지 않는다.
      // 정보가 부족한 구버전 메시지('reload')일 때만 기존처럼 재조회한다.
      const action = applyFileMessage(message, fileManager)
      if (action === 'added') {
        notification.showInfo(t('file.uploaded'))
        if (message.type === 'file-uploaded') arrival.onArrival({ kind: 'file', count: Array.isArray(message.files) ? message.files.length || 1 : 1, sender: message.sender })
      } else if (action === 'reload' && roomManager.roomIds.value.length > 0) {
        notification.showInfo(t('file.uploaded'))
        fileManager.loadFilesFromRooms(roomManager.roomIds.value)
      }
    } else if (message.type === 'text-shared') {
      receiveText(message)
    } else if (message.type === 'text-removed') {
      // 다른 방의 텍스트를 지우는 메시지는 무시한다
      const target = textShare.sharedTexts.value.find((x) => x.id === message.textId)
      if (target && target.roomId === message.roomId) textShare.removeText(message.textId)
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
  // textarea 등 입력 요소에 붙여넣을 때는 일반 입력으로 두고 자동 전송하지 않는다 (공유 버튼으로 전송)
  if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return

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

  // scope를 지금 시점으로 고정한다. 확인창을 기다리는 동안 탭이 바뀌어도 이 전송은 고정된 scope의 룸으로만 간다.
  const targetScope = scopeOverride || shareScope.getScope()
  if (scopeOverride) {
    // 공유 시트에서 사용자가 범위를 직접 고른 경우가 곧 공개 범위 확인이다
    if (scopeOverride === 'global') publicGuard.markConfirmed()
  } else if (!(await publicGuard.ensure(targetScope))) {
    return
  }
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

  // 이 범위에 비밀번호 잠금이 켜져 있으면 이 기기에서 잠근 뒤 올린다 (확인창에서 방금 켠 경우 포함)
  // 1:1 방은 항상 방 키로 잠금 업로드한다. 일반(공개) 업로드 경로는 절대 쓰지 않는다
  const isPrv = isPrivateScope(targetScope)
  const lock = isPrv ? privateRooms.lockFor(targetRoomId) : lockState.getLock(targetScope)
  if (isPrv && !lock) {
    notification.showError(t('pair.errors.noRoom'))
    return
  }
  const target = publishTargetForScope(targetScope)

  const summary = await fileManager.uploadFiles(targetRoomId, files, {
    lock,
    onQueue: (file, handle) => progress.queue(file, handle),
    onStart: (file) => progress.start(file),
    onCancel: (file, info) => progress.cancelled(file, info),
    onProgress: (file, percent, extra) => progress.progress(file, percent, extra),
    onComplete: (file, result) => {
      // size/created를 함께 보내 수신 측이 목록을 재조회하지 않고 바로 추가할 수 있게 한다
      try {
        if (isPrv && !result.locked) return
        socket.publishMessage(result.locked
          ? {
              // 잠긴 파일: 공개 URL·원래 이름은 보내지 않는다
              type: 'file-uploaded',
              locked: true,
              fileName: result.fileName,
              size: result.size,
              created: result.created,
              roomId: targetRoomId
            }
          : {
              type: 'file-uploaded',
              fileName: result.fileName,
              url: result.url,
              size: result.size,
              created: result.created,
              roomId: targetRoomId
            }, target)
      } catch (error) {
        console.warn('[App] 업로드 알림 전송 실패 (파일은 업로드됨):', error)
      }

      // 내가 올린 파일에 내 이름표를 붙인다 (목록 재조회 없이도 "나"로 표시)
      if (result.locked) {
        lockState.rememberName(targetRoomId, result.fileName, result.originalName)
        lockState.rememberDeleteKey(targetRoomId, result.fileName, result.deleteKey)
      }
      const uploader = socket.getSelfSender()
      if (uploader) {
        fileManager.addFile(result.locked
          ? { name: result.fileName, locked: true, size: result.size, created: result.created, roomId: targetRoomId, uploader }
          : { name: result.fileName, url: result.url, size: result.size, created: result.created, roomId: targetRoomId, uploader })
      }

      progress.complete(file)
    },
    onError: (file, error) => progress.fail(file, error),
    onResume: () => notification.showInfo(t('notification.uploadResumed'))
  })

  if (summary.successCount > 0) {
    // GA4 주요 이벤트: 실제로 업로드에 성공한 파일 수만 집계한다
    if (isPrv) trackEvent('private_upload', { file_count: summary.successCount })
    else trackEvent('file_upload', { file_count: summary.successCount, scope: targetScope })
    notification.showSuccess(t('notification.uploadComplete', { count: summary.successCount }))
  }
}

/** 룸 ID에 해당하는 발행 대상 ('global' | 'ip' | 비공개 roomId) */
function scopeForRoom(roomId) {
  return publishTargetForRoom(roomId)
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

/** @returns {Promise<boolean>} 실제로 공유했으면 true (취소/빈 입력/실패는 false) */
async function handleAddText(content, scopeOverride) {
  if (roomManager.roomIds.value.length === 0) return false
  if (!content || !String(content).trim()) return false

  // scope 고정 (확인창 대기 중 scope 변경 방지)
  const targetScope = scopeOverride || shareScope.scope.value
  if (scopeOverride) {
    if (scopeOverride === 'global') publicGuard.markConfirmed()
  } else if (!(await publicGuard.ensure(targetScope))) {
    return false
  }
  const targetRoomId = roomManager.roomIdForScope(targetScope)
  if (!targetRoomId) return false

  // 1:1 방: 방 키로 암호화한 enc만 보낸다 (평문 content 없음)
  // 같은 네트워크·전체 공유: 그 범위 잠금이 켜져 있으면 잠금 키로 암호화해 보낸다 (서버가 10분 보관)
  const isPrv = isPrivateScope(targetScope)
  const scopeLock = isPrv ? null : lockState.getLock(targetScope)
  let enc = null
  let sealed = null
  try {
    if (isPrv) enc = await privateRooms.encryptFor(targetRoomId, content.trim())
    else if (scopeLock) sealed = await textQueue.sealForScope(scopeLock, targetRoomId, content.trim())
  } catch (error) {
    console.warn('[App] 텍스트 암호화 실패:', error)
    notification.showError(isPrv ? t('pair.errors.noRoom') : t('lock.errors.setFailed'))
    return false
  }

  const newText = textShare.addText(content, targetRoomId)
  if (!newText) return false
  if (sealed) {
    newText.locked = true
    newText.salt = sealed.lock.salt
    // 보관 취소용 삭제 키 (이 기기 메모리에만)
    lockState.rememberDeleteKey(targetRoomId, newText.id, sealed.deleteKey)
  }

  // 내가 보낸 텍스트에는 내 이름표를 붙인다 ("나"로 표시)
  const self = socket.getSelfSender()
  if (self) newText.sender = self

  const base = { type: 'text-shared', textId: newText.id, timestamp: newText.timestamp, roomId: targetRoomId }
  const message = isPrv
    ? { ...base, enc }
    : sealed
      ? { ...base, locked: true, lock: sealed.lock, enc: sealed.enc }
      : { ...base, content: newText.content }
  const target = publishTargetForScope(targetScope)
  let res = { success: true }
  try {
    if (typeof socket.publishWithAck === 'function') res = await socket.publishWithAck(message, target)
    else socket.publishMessage(message, target)
  } catch (error) {
    console.warn('[App] 텍스트 전송 실패:', error)
    textShare.removeText(newText.id)
    notification.showError(t('notification.connectFailed'))
    return false
  }
  if (res?.success === false) {
    // 속도 제한 등으로 서버가 받지 않았다: 아무에게도 가지 않았으므로 입력을 남긴다
    textShare.removeText(newText.id)
    notification.showError(res.code === 'RATE_LIMITED' ? t('text.rateLimited') : t('notification.connectFailed'))
    return false
  }

  if (isPrv) trackEvent('private_text')
  else trackEvent('text_share', { scope: targetScope, locked: !!sealed })

  // 보관 결과: 크기 초과·서버 보관함 가득이면 지금 열린 기기에만 갔다고 알린다 (구버전 백엔드는 이유가 없어 크기로 판단)
  const tooLarge = res?.notStored === 'TOO_LARGE' ||
    (!res?.expiresAt && textQueue.supported.value !== false && textBytes(newText.content) > TEXT_QUEUE_MAX_BYTES)
  if (tooLarge || res?.notStored === 'FULL') {
    textQueue.markNotStored(newText.id, tooLarge ? 'TOO_LARGE' : 'FULL')
    notification.showInfo(tooLarge ? t('text.tooLargeToast') : t('text.notKeptFull'))
    return true
  }
  if (res?.expiresAt) {
    const entry = textShare.sharedTexts.value.find((x) => x.id === newText.id)
    if (entry && !entry.expiresAt) entry.expiresAt = res.expiresAt
  }
  if (res?.evicted?.length) {
    // 보낸 쪽 몫을 넘어 내 가장 오래된 보관분이 밀려났다
    textQueue.markEvicted(res.evicted)
    notification.showInfo(t('text.quotaEvicted', { count: isPrv ? TEXT_QUEUE_SENDER_QUOTA * 2 : TEXT_QUEUE_SENDER_QUOTA }))
    return true
  }

  notification.showSuccess(t('text.shared'))
  return true
}

/** 텍스트 탭의 직접 입력 공유. 결과를 done(ok)으로 돌려줘 성공 시에만 입력을 비운다 */
/** #/send?t= 링크로 채운 텍스트 (RoomScreen → TextShareBox 입력란) */
const prefillText = ref('')
let prefillPending = false

/** 입력란을 채운다(전송 안 함). 같은 텍스트가 다시 와도 감시자가 반응하도록 한 번 비웠다가 넣는다 */
async function applySendLink(text) {
  if (!text || currentRoute.value.type !== 'home') return
  prefillText.value = ''
  await nextTick()
  prefillText.value = text
  prefillPending = true
  trackEvent('send_link_open', { chars: text.length })
}

/** 이미 열린 탭에서 #/send?t= 로 바뀐 경우 (index.html이 가로채 cs-send-link 이벤트를 보낸다) */
function onSendLinkEvent() {
  applySendLink(consumePendingSendLink())
}

async function handleShareText({ content, done }) {
  let ok = false
  try {
    ok = await handleAddText(content)
    if (ok && prefillPending) {
      prefillPending = false
      trackEvent('send_link_share', { chars: content.length })
    }
  } finally {
    done?.(ok)
  }
}

async function handleRemoveText(textId) {
  if (roomManager.roomIds.value.length === 0) return

  const target = textShare.sharedTexts.value.find((x) => x.id === textId)
  if (!target) return
  // 보관 중이면 서버 대기열에서도 지운다. 지울 증명이 없으면(남이 잠근 텍스트) 이 기기 목록에서만 뺀다
  const res = await textQueue.removeFromServer(target.roomId, { textIds: [textId] })
  const removed = textShare.removeText(textId)
  if (!removed || res?.forbidden?.includes(textId)) return

  const targetScope = publishTargetForRoom(removed.roomId)

  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: removed.roomId
  }, targetScope)
}

/** 보관 취소: 서버에서 지우고 다른 기기 목록에서도 사라지게 한다 */
async function handleCancelQueuedText(textId) {
  const target = textShare.sharedTexts.value.find((x) => x.id === textId)
  if (!target) return
  const res = await textQueue.removeFromServer(target.roomId, { textIds: [textId] })
  if (!res?.deleted?.includes(textId)) {
    notification.showError(t('text.cancelFailed'))
    return
  }
  textShare.removeText(textId)
  try {
    socket.publishMessage({ type: 'text-removed', textId, roomId: target.roomId }, publishTargetForRoom(target.roomId))
  } catch (error) {
    console.warn('[App] 보관 취소 알림 전송 실패 (서버에서는 삭제됨):', error)
  }
  trackEvent('text_queue_cancel')
  notification.showInfo(t('text.keepCancelled'))
}

/** 보관되지 않은(너무 큰) 텍스트를 .txt 파일로 올린다. 파일은 하루 보관된다 */
async function handleSendTextAsFile(textId) {
  const target = textShare.sharedTexts.value.find((x) => x.id === textId)
  if (!target || typeof target.content !== 'string') return
  const d = new Date(target.timestamp || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  const name = `text-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`
  trackEvent('text_as_file')
  await uploadFiles([new File([target.content], name, { type: 'text/plain' })])
}

/** 잠긴 텍스트를 비밀번호로 푼다. 결과는 done({ok, code?, remaining?})으로 카드에 돌려준다 */
async function handleUnlockText({ id, password, done }) {
  try {
    await textQueue.unlockWithPassword(id, password)
    trackEvent('text_unlock')
    done?.({ ok: true })
  } catch (error) {
    done?.({ ok: false, code: error?.code, remaining: error?.remaining })
  }
}

async function handleClearAllTexts() {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = publishTargetForScope(shareScope.scope.value)
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  // 서버 대기열도 함께 지운다 (1:1 방은 모두, 공개 범위는 지울 증명이 있는 잠긴 텍스트만)
  await textQueue.removeFromServer(targetRoomId, { all: true })
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
    const shownName = file.locked ? (lockState.nameFor(file.roomId, file.name) || t('lock.lockedFile')) : file.name
    notification.showSuccess(t('notification.deleted', { name: shownName }))
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
  // 잠긴 파일 링크는 index.html이 주소창에서 미리 지우고 window.__csLockedLink에 옮겨 둔다
  const hash = window.__csLockedLink || window.location.hash
  window.__csLockedLink = undefined
  currentRoute.value = parseRoute(hash)
  const sendHash = window.__csSendLink || hash
  window.__csSendLink = undefined
  const sendText = parseSendLink(sendHash)

  console.log('[App] 라우트 파싱 결과:', currentRoute.value)

  // 다운로드 페이지인 경우 소켓 연결하지 않고 바로 렌더링
  if (currentRoute.value.type === 'download') {
    console.log('[App] 다운로드 페이지 렌더링')
    return
  }

  // 잠긴 파일 링크도 룸에 접속하지 않고 그 파일 하나만 받는다
  if (currentRoute.value.type === 'locked' || currentRoute.value.type === 'locked-invalid') return

  // share-target 파라미터 감지
  const isShareTarget = new URLSearchParams(window.location.search).has('share-target')

  // 프리렌더 중에는 소켓에 연결하지 않아 정적 HTML에 접속 상태·토스트·룸 파일 목록이 구워지지 않게 한다
  if (window.__PRERENDER__) return

  window.addEventListener('cs-send-link', onSendLinkEvent)

  // 보관 남은 시간 갱신 + 만료된 잠긴 텍스트 정리
  nowTimer = setInterval(() => {
    nowTick.value = Date.now()
    textQueue.expire(nowTick.value)
  }, 15000)

  // 공유 룸에 연결
  await connectToRoom()

  // Web Share Target으로 진입한 경우 공유 데이터 처리
  if (isShareTarget) {
    console.log('[App] Share target 감지, 공유 데이터 처리 중...')
    await handleShareTargetData()
  }

  // 텍스트 미리 채우기 링크: 입력란만 채운다. 전송은 사용자가 '공유'를 눌러야 한다
  if (sendText) await applySendLink(sendText)
  // 연결하는 동안 해시가 바뀌어 들어온 링크도 처리
  onSendLinkEvent()

  // URL을 깨끗하게 정리
  window.history.replaceState(null, '', window.location.pathname)

  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  clearInterval(nowTimer)
  if (cleanupUserLeft) cleanupUserLeft()
  if (cleanupOnMessage) cleanupOnMessage()
  document.removeEventListener('paste', handlePaste)
  window.removeEventListener('cs-send-link', onSendLinkEvent)
  pairFlow.destroy()
  socket.destroy()
})
</script>

<template>
  <div id="app">
    <div class="app-frame" :class="{ 'app-frame--narrow': currentRoute.type === 'download' }">
      <!-- 잠긴 파일 QR·링크 받기 -->
      <LockedLinkPage
        v-if="currentRoute.type === 'locked' || currentRoute.type === 'locked-invalid'"
        :link="currentRoute.type === 'locked' ? currentRoute : null"
      />

      <!-- 다운로드 페이지 -->
      <DownloadPage
        v-else-if="currentRoute.type === 'download'"
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
        :text-receiver-count="textReceiverCount"
        :text-storage-mode="textStorageMode"
        :is-loading="fileManager.isLoading.value || isConnecting"
        :user-count="socket.usersInRoom.value"
        :scope="shareScope.scope.value"
        :ip-room-devices="socket.ipRoomDevices.value"
        :global-room-devices="socket.globalRoomDevices.value"
        :my-identity="socket.myIdentity.value"
        :my-socket-id="socket.mySocketId.value"
        :reroll-available-at="socket.rerollAvailableAt.value"
        :pair-enabled="pairFlow.enabled"
        :private-rooms="privateRooms.rooms"
        :private-devices="socket.privateRoomDevices?.value ?? {}"
        :pair-states="pairFlow.pairStates.value"
        :highlight-room-id="pairFlow.highlightRoomId.value"
        @pair-invite="pairFlow.invite"
        @pair-cancel="pairFlow.cancel"
        @pair-confirm="pairFlow.confirmInvite"
        @leave-private="handlePrivateLeave"
        @reroll-identity="handleRerollIdentity"
        @hint-copied="notification.showSuccess(t('file.copied'))"
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
        @cancel-text="handleCancelQueuedText"
        @unlock-text="handleUnlockText"
        @send-text-as-file="handleSendTextAsFile"
        @clear-all-texts="handleClearAllTexts"
        @copy-text="handleCopyText"
        @paste-content="handlePasteContent"
        :prefill-text="prefillText"
        @share-text="handleShareText"
        :uploads="notification.uploads.value"
        @cancel-upload="cancelUpload"
        @cancel-all="cancelAllUploads"
        @load-more="handleLoadMore"
      />

      <ArrivalNotifyPrompt :visible="arrival.promptVisible.value" @enable="arrival.enableNotifications" @dismiss="arrival.dismissPrompt" />

      <!-- 창 전체 드롭 -->
      <WindowDropOverlay
        :disabled="isMobile"
        :enabled="roomManager.roomIds.value.length > 0"
        :blocked="isShareConfirmOpen || publicGuard.isOpen.value || !!pairFlow.confirming.value || !!incomingSession"
        :scope-kind="isPrivateScope(shareScope.scope.value) ? 'private' : shareScope.scope.value"
        @drop-files="handleUploadFiles"
      />

      <!-- 알림 토스트 -->
      <NotificationToast :message="notification.notification.value" />

      <PublicShareConfirm
        :is-open="publicGuard.isOpen.value"
        @confirm="publicGuard.accept()"
        @cancel="publicGuard.cancel()"
      />

      <!-- 1:1 연결: 받은 요청 / 그림 확인 -->
      <PairRequestSheet
        :session="incomingSession"
        :announcement="pairFlow.announcement.value"
        @respond="({ accept, block, same, mismatch }) => pairFlow.respond(accept, { block, same, mismatch })"
        @cancel="pairFlow.cancel(incomingSession?.sessionId)"
      />
      <PairConfirmSheet
        :session="pairFlow.confirming.value"
        :me="{ identity: socket.myIdentity.value }"
        @confirm="pairFlow.confirm"
        @cancel="pairFlow.cancelConfirming"
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
  /* 작업 영역 폭(760/1040px)은 RoomScreen이 정한다. 다운로드 페이지만 좁게 유지 */
  max-width: 100%;
  min-height: 100dvh;
  background-color: var(--color-surface);
  box-shadow: 0 0 3.125rem rgba(22, 28, 1, 0.1);
}

.app-frame--narrow {
  max-width: 30rem;
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
