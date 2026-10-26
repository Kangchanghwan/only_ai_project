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
import { useMediaQuery } from '../composables/useMediaQuery'
import { formatSizeMB } from '../utils/fileUtils'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'
import LandingContent from './LandingContent.vue'
import PrivateRoomStrip from './PrivateRoomStrip.vue'
import { useScopeAccent } from '../composables/useScopeAccent'
import { isPrivateScope, privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { isMeDevice } from '../utils/devices'
import { sameIdentity } from '../utils/identity'

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
  'leave-private'
])

const maxFileSizeMB = import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120
const mobilePanel = ref('files')
watch(() => props.prefillText, (v) => { if (v) mobilePanel.value = 'text' }, { immediate: true })

// 넓은 화면(CSS의 @media (min-width: 1100px)와 동일 값)에서는 기기 목록을 왼쪽 패널에 항상 보여준다.
// 작업 영역은 이 값으로 다시 마운트되지 않는다 (목록 표시 방식만 바뀐다).
const isWide = useMediaQuery()

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

// 상대가 나갔을 때 "다시 연결": 같은 상대가 ip/전체 공유 목록에 보이면 다시 초대할 수 있다
const peerLeft = computed(() => currentRoom.value?.status === 'left')
// 상대 오프라인: 파일은 올릴 수 있고(상대가 나중에 받음), 텍스트도 10분 보관되므로 보낼 수 있다
// (보관을 지원하지 않는 구버전 서버면 접속 중인 상대에게만 가므로 막는다)
const peerOffline = computed(() => currentRoom.value?.status === 'offline')
const peerConnecting = computed(() => currentRoom.value?.status === 'connecting')

// 다른 네트워크 기기: 전체 공유 방에는 있고 내 IP 방에는 없는 기기 (socketId 기준)
const otherNetworkDevices = computed(() => {
  const inIp = new Set(props.ipRoomDevices.map((d) => d.socketId))
  return props.globalRoomDevices.filter((d) => !inIp.has(d.socketId) && !isMeDevice(d, props.mySocketId, props.myIdentity))
})
const reinviteDevice = computed(() => {
  const peer = currentRoom.value?.peer
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
    open: (roomId) => emit('select-scope', scopeForPrivateRoom(roomId))
  })
}

// 파일 카드/텍스트 항목의 보낸 사람 표시(나/타인/나간 기기)에 쓰이는 문맥
provide(SENDER_CONTEXT_KEY, {
  mySocketId: toRef(props, 'mySocketId'),
  myIdentity: toRef(props, 'myIdentity'),
  devices: activeDevices
})

const { bg: accentBg } = useScopeAccent(() => props.scope)
</script>

<template>
  <div :class="['text-text-primary', files.length > 0 && !isLoading ? 'pb-24' : 'pb-6']">
    <AppHeader :user-count="userCount" :is-connecting="isConnecting" />

    <div class="page-shell px-4 sm:px-6">
      <ShareScopeTabs
        :scope="scope"
        :private-rooms="privateRooms"
        :highlight-room-id="highlightRoomId"
        @select="$emit('select-scope', $event)"
      />

      <!-- 전체 공유 경고: 항상 상단에 분명하게 -->
      <div
        v-if="scope === 'global'"
        class="global-warning mb-4 rounded-xl border border-scope-global bg-scope-global/10 p-3 text-sm text-text-primary"
        role="note"
        data-testid="global-warning"
      >
        {{ t('identity.globalWarning') }}
      </div>

      <!-- 1:1 안내 띠: 전체 공유 경고와 같은 자리 -->
      <PrivateRoomStrip
        v-if="currentRoom"
        :room="currentRoom"
        @leave="$emit('leave-private', $event)"
      />

      <div class="workspace">
        <!-- 연결 카드 (좁은 화면: 상단 카드 / 넓은 화면: 왼쪽 패널). grid-area로 위치만 바뀐다 -->
        <div class="ws-conn">
          <ConnectionCard
            :devices="activeDevices"
            :my-socket-id="mySocketId"
            :my-identity="myIdentity"
            :reroll-available-at="rerollAvailableAt"
            :scope="scope"
            :other-network-devices="otherNetworkDevices"
            :wide="isWide"
            @reroll="$emit('reroll-identity')"
            @hint-copied="$emit('hint-copied', $event)"
          />
        </div>

        <main class="ws-main bg-surface rounded-xl p-4 sm:p-6 border border-border min-w-0">
          <div
            class="flex gap-2 mb-4 p-1 w-fit max-w-full rounded-full border border-border bg-background"
            role="tablist"
            :aria-label="t('room.mobilePanelLabel')"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="mobilePanel === 'files'"
              class="min-h-[44px] px-4 rounded-full text-sm font-semibold transition-colors"
              :class="mobilePanel === 'files' ? [accentBg, 'text-white'] : 'text-text-secondary'"
              @click="mobilePanel = 'files'"
            >
              {{ t('room.filesTab') }} ({{ files.length }})
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mobilePanel === 'text'"
              class="min-h-[44px] px-4 rounded-full text-sm font-semibold transition-colors"
              :class="mobilePanel === 'text' ? [accentBg, 'text-white'] : 'text-text-secondary'"
              @click="mobilePanel = 'text'"
            >
              {{ t('room.textTab') }} ({{ texts.length }})
            </button>
          </div>

          <div class="flex flex-col gap-8">
            <section :class="{ hidden: mobilePanel !== 'files' }">
              <p v-if="peerOffline" class="m-0 mb-2 text-xs text-text-secondary" role="status" data-testid="peer-offline-upload-note">{{ t('pair.offlineUploadNote') }}</p>
              <FileGallery
                :files="files"
                :room-id="roomId"
                :is-loading="isLoading"
                :has-more="hasMore"
                :scope="scope"
                :uploads="uploads"
                @copy-image="$emit('copy-image', $event)"
                @download-file="$emit('download-file', $event)"
                @download-parallel="$emit('download-parallel', $event)"
                @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
                @delete-file="$emit('delete-file', $event)"
                @delete-selected="$emit('delete-selected', $event)"
                @clear-storage="$emit('clear-storage')"
                @upload-files="$emit('upload-files', $event)"
                @paste-content="$emit('paste-content')"
                @load-more="$emit('load-more')"
                @cancel-upload="$emit('cancel-upload', $event)"
                @cancel-all="$emit('cancel-all')"
              >
                <!-- 상대가 나간 1:1 방: 업로드 칸 대신 안내 -->
                <template v-if="peerLeft" #send>
                  <div class="rounded-xl border border-dashed border-scope-private p-4 mb-2 text-center" data-testid="peer-left-notice">
                    <p class="m-0 text-sm text-text-secondary">{{ t('pair.peerLeftNotice') }}</p>
                    <p v-if="reinviteState?.state === 'pending'" class="m-0 mt-2 text-sm font-semibold text-scope-private" role="status">{{ t('pair.pending') }}</p>
                    <button
                      v-else-if="reinviteDevice"
                      type="button"
                      class="mt-3 min-h-[44px] px-5 rounded-full bg-scope-private text-white text-sm font-semibold"
                      data-testid="pair-reinvite"
                      @click="$emit('pair-invite', reinviteDevice)"
                    >{{ t('pair.reconnect') }}</button>
                  </div>
                </template>
              </FileGallery>
            </section>

            <section :class="{ hidden: mobilePanel !== 'text' }">
              <TextShareBox
                :texts="texts"
                :scope="scope"
                :prefill="prefillText"
                :receiver-count="textReceiverCount"
                :storage-mode="textStorageMode"
                :compose-disabled="peerLeft || (peerOffline && textStorageMode === 'none') || peerConnecting"
                :compose-note="peerOffline && textStorageMode === 'none' ? t('pair.offlineTextNote') : ''"
                @remove-text="$emit('remove-text', $event)"
                @cancel-text="$emit('cancel-text', $event)"
                @unlock-text="$emit('unlock-text', $event)"
                @send-as-file="$emit('send-text-as-file', $event)"
                @clear-all="$emit('clear-all-texts')"
                @copy-text="$emit('copy-text', $event)"
                @share-text="$emit('share-text', $event)"
                @paste-content="$emit('paste-content')"
              />
              <!-- 텍스트 탭에서 붙여넣은 파일 업로드 등도 같은 위치 규칙으로 보이게 -->
              <TransferProgress
                v-if="mobilePanel === 'text'"
                :uploads="uploads"
                @cancel-upload="$emit('cancel-upload', $event)"
                @cancel-all="$emit('cancel-all')"
              />
            </section>
          </div>
        </main>
      </div>

      <!-- 보관/사용 안내 (details 본문은 DOM에 그대로 있어 크롤링 가능) -->
      <details class="mt-6 bg-surface border border-border rounded-xl p-4 text-sm" data-testid="usage-notes" open>
        <summary class="cursor-pointer min-h-[44px] flex items-center font-semibold">{{ t('guide.title') }}</summary>
        <ul class="mt-2 flex flex-col gap-2 list-disc pl-5 text-text-secondary leading-relaxed">
          <li>{{ t('guide.retention') }}</li>
          <li>{{ t('file.limitResume', { size: formatSizeMB(maxFileSizeMB) }) }}</li>
          <li>{{ t('identity.ipNotice') }}</li>
          <li>{{ t('identity.notAuth') }}</li>
        </ul>
      </details>

      <!-- 작업 영역과 분리된 서비스 소개(SEO) 영역 -->
      <div class="landing-separator mt-12 pt-8 border-t border-border" data-testid="landing-separator">
        <LandingContent />
      </div>

      <AppFooter />
    </div>
  </div>
</template>

<style scoped>
/* 레이아웃 임계값:
   - 기본~1099px: 한 열, 전체 최대 760px (연결 카드는 작업 영역 위)
   - 1100px 이상: 전체 최대 1040px = 왼쪽 기기 패널 240px + 간격 24px + 작업 영역 최대 776px(760px 본문)
   JS의 WIDE_QUERY(useMediaQuery.js)도 반드시 같은 1100px이어야 한다. */
.page-shell {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'conn' 'main';
  gap: 1rem;
}
.ws-conn { grid-area: conn; min-width: 0; }
.ws-main { grid-area: main; }
@media (min-width: 1100px) {
  .page-shell { max-width: 1040px; }
  .workspace {
    grid-template-columns: 240px minmax(0, 1fr);
    grid-template-areas: 'conn main';
    gap: 1.5rem;
    align-items: start;
  }
  .ws-conn { position: sticky; top: 5.5rem; }
}
</style>
