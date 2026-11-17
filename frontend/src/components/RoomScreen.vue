<script setup>
import { computed, ref, provide, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import ConnectionCard from './ConnectionCard.vue'
import TransferProgress from './TransferProgress.vue'
import { formatSizeMB } from '../utils/fileUtils'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'
import LandingContent from './LandingContent.vue'
import { roomDisplayName } from '../utils/roomDisplayName'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import { useScopeAccent } from '../composables/useScopeAccent'
import { isPrivateScope, privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { isMeDevice } from '../utils/devices'
import { sameIdentity } from '../utils/identity'
import { readListHint, saveListHint, readDeviceHint } from '../utils/layoutHint'
import { isGroupRoomId } from '../utils/groupRoom'

const { t } = useI18n()

const props = defineProps({
  /** #/send?t= 링크로 받은 텍스트: 텍스트 탭을 열고 입력란을 채운다 */
  prefillText: { type: String, default: '' },
  roomId: {
    type: String,
    default: null
  },
  files: {
    type: Array,
    default: () => []
  },
  texts: {
    type: Array,
    default: () => []
  },
  /** 현재 범위에서 텍스트를 받을 수 있는 다른 기기 수 */
  textReceiverCount: { type: Number, default: null },
  /** 지금 범위로 보내는 텍스트의 보관 방식: private | locked | plain | none(보관 안 함) */
  textStorageMode: { type: String, default: 'none' },
  isLoading: {
    type: Boolean,
    default: false
  },
  userCount: {
    type: Number,
    default: 1
  },
  isConnecting: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  scope: {
    type: String,
    default: 'ip'
  },
  ipRoomDevices: {
    type: Array,
    default: () => []
  },
  globalRoomDevices: {
    type: Array,
    default: () => []
  },
  /** 내 정체성/소켓 ID (구버전 백엔드면 null → 기존 아이콘 표시로 폴백) */
  myIdentity: {
    type: Object,
    default: null
  },
  mySocketId: {
    type: String,
    default: null
  },
  rerollAvailableAt: {
    type: Number,
    default: 0
  },
  /** 1:1 연결: 비공개 방 목록 [{roomId, peer, status}] / 방별 접속 기기 / 기기 행 상태 / 방금 연결된 방 */
  pairEnabled: { type: Boolean, default: false },
  privateRooms: { type: Array, default: () => [] },
  privateDevices: { type: Object, default: () => ({}) },
  pairStates: { type: Object, default: () => ({}) },
  /** 받은 1:1 요청 세션(state === 'incoming') 또는 null: 보낸 기기 카드에서 수락/거절 */
  pairIncoming: { type: Object, default: null },
  highlightRoomId: { type: String, default: null },
  /** 진행 중인 업로드/다운로드 (App.vue 상태) */
  uploads: {
    type: Map,
    default: () => new Map()
  }
})

const emit = defineEmits([
  'copy-image',
  'hint-copied',
  'upload-files',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'delete-file',
  'delete-selected',
  'clear-storage',
  'remove-text',
  'cancel-text',
  'unlock-text',
  'send-text-as-file',
  'clear-all-texts',
  'copy-text',
  'paste-content',
  'load-more',
  'select-scope',
  'reroll-identity',
  'share-text',
  'cancel-upload',
  'cancel-all',
  'pair-invite',
  'pair-cancel',
  'pair-confirm',
  'leave-private',
  'group-create',
  'group-add',
  'code-enter',
  'group-invite'
])

const maxFileSizeMB = import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120


// 1:1 탭이면 그 방의 접속 기기(나 + 상대)를 보여 준다
const currentRoom = computed(() => {
  const id = privateRoomIdOfScope(props.scope)
  return id ? props.privateRooms.find((r) => r.roomId === id) || null : null
})
const activeDevices = computed(() => {
  if (isPrivateScope(props.scope)) {
    const room = currentRoom.value
    return props.privateDevices[room?.roomId] ?? (room?.peer ? [room.peer] : [])
  }
  return props.scope === 'global' ? props.globalRoomDevices : props.ipRoomDevices
})

// 그룹 방은 "상대" 한 명이 없다: 나갔어요/오프라인/다시 연결 안내를 쓰지 않는다
const isGroupRoom = computed(() => isGroupRoomId(currentRoom.value?.roomId))
const groupMemberCount = computed(() => {
  const id = currentRoom.value?.roomId
  const devs = id ? props.privateDevices[id] : null
  return Array.isArray(devs) ? devs.length : null
})
const groupOthers = computed(() => {
  const id = currentRoom.value?.roomId
  const devs = id ? props.privateDevices[id] : null
  return Array.isArray(devs) ? devs.filter((d) => !isMeDevice(d, props.mySocketId, props.myIdentity)) : []
})
// 상대가 나갔을 때 "다시 연결": 같은 상대가 ip/전체 공유 목록에 보이면 다시 초대할 수 있다
const peerLeft = computed(() => !isGroupRoom.value && currentRoom.value?.status === 'left')
// 상대 오프라인: 파일은 올릴 수 있고(상대가 나중에 받음), 텍스트도 10분 보관되므로 보낼 수 있다
// (보관을 지원하지 않는 구버전 서버면 접속 중인 상대에게만 가므로 막는다)
const peerOffline = computed(() => !isGroupRoom.value && currentRoom.value?.status === 'offline')
const peerConnecting = computed(() => currentRoom.value?.status === 'connecting')

// 다른 네트워크 기기: 전체 공유 방에는 있고 내 IP 방에는 없는 기기 (socketId 기준)
const otherNetworkDevices = computed(() => {
  const inIp = new Set(props.ipRoomDevices.map((d) => d.socketId))
  return props.globalRoomDevices.filter((d) => !inIp.has(d.socketId) && !isMeDevice(d, props.mySocketId, props.myIdentity))
})
const reinviteDevice = computed(() => {
  const peer = isGroupRoom.value ? null : currentRoom.value?.peer
  if (!peer || !peerLeft.value) return null
  return [...props.ipRoomDevices, ...props.globalRoomDevices].find((d) =>
    !isMeDevice(d, props.mySocketId, props.myIdentity) &&
    (d.socketId === peer.socketId || sameIdentity(d.identity, peer.identity))
  ) || null
})
const reinviteState = computed(() => (reinviteDevice.value ? props.pairStates[reinviteDevice.value.socketId] || null : null))

// 1:1 연결 동작을 기기 목록(DeviceList)에 내려준다. pairEnabled가 아니면 제공하지 않아 버튼이 나타나지 않는다
if (props.pairEnabled) {
  provide(PAIR_CONTEXT_KEY, {
    states: computed(() => props.pairStates),
    invite: (device) => emit('pair-invite', device),
    cancel: (sessionId) => emit('pair-cancel', sessionId),
    confirm: (sessionId) => emit('pair-confirm', sessionId),
    incoming: computed(() => props.pairIncoming),
    open: (roomId) => emit('select-scope', scopeForPrivateRoom(roomId))
  })
}

// 파일 카드/텍스트 항목의 보낸 사람 표시(나/타인/나간 기기)에 쓰이는 문맥
provide(SENDER_CONTEXT_KEY, {
  mySocketId: toRef(props, 'mySocketId'),
  myIdentity: toRef(props, 'myIdentity'),
  devices: activeDevices
})

/** 1:1·그룹 방(prv:)에서는 같은 네트워크/전체 공유용 안내 대신 방 기준 안내를 보여 준다 */
const inRoom = computed(() => isPrivateScope(props.scope))
// 공개 범위(ip/전체)에서 목록이 "비어 있음"으로 확정되면 안내·소개·푸터를 메인 화면 목록 아래에 보인다
const extraTarget = ref(null)
const isPrerender = typeof window !== 'undefined' && !!window.__PRERENDER__
const showExtraInMain = computed(() =>
  (props.scope === 'ip' || props.scope === 'global') &&
  props.files.length === 0 && props.texts.length === 0 &&
  (!props.isLoading || isPrerender)
)
const { bg: accentBg } = useScopeAccent(() => props.scope)

// ── 지난번 목록 배치 기억: 로딩 중 입력 칸 높이와 자리 표시 줄 수를 지난번과 같게 잡아 목록이 움직이지 않게 한다 ──
const listHint = computed(() => (props.isLoading && !isPrerender ? readListHint(props.scope) : null))
/** 서버 연결 전(기기 목록이 아직 없음)에 지난번 받을 기기 수: 안내 글의 글자 자리를 잡는 데만 쓴다 */
const receiverHint = computed(() => {
  if (isPrerender || activeDevices.value.length > 0) return null
  const others = (readDeviceHint(props.scope)?.cards || 0) - 1
  return others > 0 ? others : null
})
/** 입력 칸을 낮게 그릴지: 항목이 있거나, 로딩 중인데 지난번에 항목이 있었을 때 */
const composerHasItems = computed(() => props.files.length > 0 || props.texts.length > 0 || (listHint.value?.rows || 0) > 0)
// 로딩이 끝난 뒤의 목록 상태만 기억한다 (연결 전의 빈 목록은 저장하지 않도록 즉시 실행하지 않는다)
watch(
  [() => props.isLoading, () => props.files.length, () => props.texts.length, () => props.scope],
  ([loading, nFiles, nTexts, scope]) => {
    if (loading || isPrerender) return
    saveListHint(scope, { files: nFiles, texts: nTexts })
  }
)
</script>

<template>
  <div :class="['text-text-primary', files.length > 0 && !isLoading ? 'pb-24' : 'pb-6']">
    <AppHeader :user-count="userCount" :is-connecting="isConnecting">
      <!-- 안내·소개·푸터: 도움말 창 안에 두고 화면에서는 숨김(DOM 유지, SEO) -->
      <Teleport :to="extraTarget" :disabled="!showExtraInMain || !extraTarget">
      <div class="help-extra" data-testid="help-extra">
        <section class="border-t border-border pt-6 text-sm" data-testid="usage-notes">
          <h3 class="text-lg font-semibold text-text-primary mb-3">{{ t('guide.title') }}</h3>
          <ul class="flex flex-col list-none p-0 m-0 text-text-secondary leading-relaxed [&>li]:border-b [&>li]:border-border [&>li]:py-2">
            <li v-if="inRoom" data-testid="room-retention">{{ t('guide.roomRetention') }}</li>
            <li v-else>{{ t('guide.retention') }}</li>
            <li>{{ t('file.limitResume', { size: formatSizeMB(maxFileSizeMB) }) }}</li>
            <li v-if="inRoom" data-testid="room-visibility">{{ t('guide.roomVisibility') }}</li>
            <li v-else>{{ t('identity.ipNotice') }}</li>
            <li>{{ t('identity.notAuth') }}</li>
          </ul>
        </section>
        <div class="landing-separator border-t border-border pt-6" data-testid="landing-separator">
          <LandingContent />
        </div>
        <div class="border-t border-border pt-6">
          <AppFooter />
        </div>
      </div>
      </Teleport>
    </AppHeader>

    <div class="page-shell px-4 sm:px-6">
      <!-- 방 + 기기 줄: 어느 방인지, 누가 있는지 한 줄에 -->
      <div class="bleed-line-b relative flex items-stretch border-b border-border mb-3" data-testid="room-row">
        <ShareScopeTabs
          :scope="scope"
          :private-rooms="privateRooms"
          :highlight-room-id="highlightRoomId"
          :group-create="pairEnabled"
          @select="$emit('select-scope', $event)"
          @group-create="$emit('group-add')"
        />
      </div>
      <div class="flex flex-wrap items-start gap-x-5 gap-y-2 mb-3" data-testid="device-row">
        <div class="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <ConnectionCard
            :devices="activeDevices"
            :my-socket-id="mySocketId"
            :my-identity="myIdentity"
            :reroll-available-at="rerollAvailableAt"
            :scope="scope"
            :other-network-devices="otherNetworkDevices"
            :other-network-pending="scope === 'ip' && globalRoomDevices.length === 0"
            @reroll="$emit('reroll-identity')"
            @hint-copied="$emit('hint-copied', $event)"
            @group-create="$emit('group-create')"
            @code-enter="$emit('code-enter')"
          />
        </div>
      </div>

      <!-- 전체 공유 경고: 항상 상단에 분명하게 -->
      <div
        v-if="scope === 'global'"
        class="global-warning mb-4 rounded-none border border-scope-global bg-scope-global/10 p-3 text-sm text-text-primary"
        role="note"
        data-testid="global-warning"
      >
        {{ t('identity.globalWarning') }}
      </div>

      <!-- 1:1 안내 띠: 전체 공유 경고와 같은 자리 -->
      <PrivateRoomStrip
        v-if="currentRoom"
        :room="currentRoom"
        :display-name="currentRoom ? roomDisplayName(privateRooms, currentRoom.roomId, t('group.unnamed')) : ''"
        :member-count="groupMemberCount"
        :others="groupOthers"
        @leave="$emit('leave-private', $event)"
        @invite="$emit('group-invite', $event)"
      />

      <div class="workspace">
        <main class="ws-main sm:bg-surface sm:rounded-none p-0 sm:p-6 sm:border sm:border-border min-w-0">
          <div class="flex flex-col gap-8">
            <section data-testid="workspace-stack">
              <p v-if="peerOffline" class="m-0 mb-2 text-xs text-text-secondary" role="status" data-testid="peer-offline-upload-note">{{ t('pair.offlineUploadNote') }}</p>
              <FileGallery
                :files="files"
                :room-id="roomId"
                :is-loading="isLoading"
                :has-more="hasMore"
                :scope="scope"
                :uploads="uploads"
                :texts="texts"
                :loading-hint="listHint"
                @remove-text="$emit('remove-text', $event)"
                @cancel-text="$emit('cancel-text', $event)"
                @unlock-text="$emit('unlock-text', $event)"
                @send-as-file="$emit('send-text-as-file', $event)"
                @clear-all-texts="$emit('clear-all-texts')"
                @copy-text="$emit('copy-text', $event)"
                @copy-image="$emit('copy-image', $event)"
                @download-file="$emit('download-file', $event)"
                @download-parallel="$emit('download-parallel', $event)"
                @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
                @delete-file="$emit('delete-file', $event)"
                @delete-selected="$emit('delete-selected', $event)"
                @clear-storage="$emit('clear-storage')"
                @load-more="$emit('load-more')"
                @cancel-upload="$emit('cancel-upload', $event)"
                @cancel-all="$emit('cancel-all')"
              >
                <!-- 상대가 나간 1:1 방: 업로드 칸 대신 안내 -->
                <template v-if="peerLeft" #send>
                  <div class="rounded-none border border-dashed border-scope-private p-4 mb-2 text-center" data-testid="peer-left-notice">
                    <p class="m-0 text-sm text-text-secondary">{{ t('pair.peerLeftNotice') }}</p>
                    <p v-if="reinviteState?.state === 'pending'" class="m-0 mt-2 text-sm font-semibold text-scope-private" role="status">{{ t('pair.pending') }}</p>
                    <button
                      v-else-if="reinviteDevice"
                      type="button"
                      class="mt-3 min-h-[44px] px-5 rounded-none bg-scope-private text-on-accent text-sm font-semibold"
                      data-testid="pair-reinvite"
                      @click="$emit('pair-invite', reinviteDevice)"
                    >{{ t('pair.reconnect') }}</button>
                  </div>
                </template>
                <template v-if="!peerLeft" #composer>
                  <TextShareBox
                    :scope="scope"
                    :prefill="prefillText"
                    :receiver-count="textReceiverCount"
                    :receiver-hint="receiverHint"
                    :storage-mode="textStorageMode"
                    :has-items="composerHasItems"
                    :compose-disabled="peerLeft || (peerOffline && textStorageMode === 'none') || peerConnecting"
                    :compose-note="peerOffline && textStorageMode === 'none' ? t('pair.offlineTextNote') : ''"
                    @share-text="$emit('share-text', $event)"
                    @upload-files="$emit('upload-files', $event)"
                    @paste-content="$emit('paste-content')"
                  />
                </template>
              </FileGallery>
            </section>

          </div>
        </main>
      </div>
      <div ref="extraTarget" :class="showExtraInMain ? 'mt-8' : ''" data-testid="empty-extra-target"></div>
    </div>
  </div>
</template>

<style scoped>
/* 한 열 레이아웃: 768px 이상 최대 880px, 그 아래는 760px */
.page-shell {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
}
@media (min-width: 768px) {
  .page-shell { max-width: 880px; }
}
.help-extra { display: flex; flex-direction: column; gap: 1.5rem; }
.help-extra :deep(#landing-content),
.help-extra :deep([data-testid="landing-content"]) { margin: 0; gap: 1.5rem; }
.help-extra :deep([data-testid="landing-content"] > div) {
  background: transparent; border: 0; border-radius: 0; padding: 0;
}
.help-extra :deep([data-testid="landing-content"] > nav) { padding: 0; }
.help-extra :deep([data-testid="landing-content"] h2) { font-size: 1.125rem; font-weight: 600; }
.help-extra :deep([data-testid="landing-content"] p),
.help-extra :deep([data-testid="landing-content"] li) { font-size: 0.875rem; }
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}
</style>
