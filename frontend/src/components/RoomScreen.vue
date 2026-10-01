<script setup>
import { computed, ref, provide, toRef } from 'vue'
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
import { useScopeAccent } from '../composables/useScopeAccent'

const { t } = useI18n()

const props = defineProps({
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
  /** 진행 중인 업로드/다운로드 (App.vue 상태) */
  uploads: {
    type: Map,
    default: () => new Map()
  }
})

const emit = defineEmits([
  'copy-image',
  'upload-files',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'delete-file',
  'delete-selected',
  'clear-storage',
  'remove-text',
  'clear-all-texts',
  'copy-text',
  'paste-content',
  'load-more',
  'select-scope',
  'reroll-identity',
  'share-text',
  'cancel-upload',
  'cancel-all'
])

const maxFileSizeMB = import.meta.env.VITE_MAX_FILE_SIZE_MB || 5120
const mobilePanel = ref('files')

// 넓은 화면(CSS의 @media (min-width: 1100px)와 동일 값)에서는 기기 목록을 왼쪽 패널에 항상 보여준다.
// 작업 영역은 이 값으로 다시 마운트되지 않는다 (목록 표시 방식만 바뀐다).
const isWide = useMediaQuery()

const activeDevices = computed(() =>
  props.scope === 'global' ? props.globalRoomDevices : props.ipRoomDevices
)

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
      <ShareScopeTabs :scope="scope" @select="$emit('select-scope', $event)" />

      <!-- 전체 공유 경고: 항상 상단에 분명하게 -->
      <div
        v-if="scope === 'global'"
        class="global-warning mb-4 rounded-xl border border-scope-global bg-scope-global/10 p-3 text-sm text-text-primary"
        role="note"
        data-testid="global-warning"
      >
        {{ t('identity.globalWarning') }}
      </div>

      <div class="workspace">
        <!-- 연결 카드 (좁은 화면: 상단 카드 / 넓은 화면: 왼쪽 패널). grid-area로 위치만 바뀐다 -->
        <div class="ws-conn">
          <ConnectionCard
            :devices="activeDevices"
            :my-socket-id="mySocketId"
            :my-identity="myIdentity"
            :reroll-available-at="rerollAvailableAt"
            :scope="scope"
            :wide="isWide"
            @reroll="$emit('reroll-identity')"
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
              />
            </section>

            <section :class="{ hidden: mobilePanel !== 'text' }">
              <TextShareBox
                :texts="texts"
                :scope="scope"
                @remove-text="$emit('remove-text', $event)"
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
