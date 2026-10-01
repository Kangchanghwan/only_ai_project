<script setup>
import { computed, ref, provide, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import ConnectedDevices from './ConnectedDevices.vue'
import MyIdentity from './MyIdentity.vue'
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
  'reroll-identity'
])

const mobilePanel = ref('files')

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
    <!-- 헤더는 프레임 폭에 꽉 차게(엣지-투-엣지) 배치하고, 내부 여백은 헤더 자체가 갖는다 -->
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
    />

    <div class="pt-6 px-6">
      <!-- 내 이름표 (구버전 백엔드는 identity가 없어 표시하지 않는다) -->
      <div v-if="myIdentity" class="mb-4 -mt-2">
        <MyIdentity
          :identity="myIdentity"
          :reroll-available-at="rerollAvailableAt"
          @reroll="$emit('reroll-identity')"
        />
      </div>

      <ShareScopeTabs
        :scope="scope"
        @select="$emit('select-scope', $event)"
      />

      <!-- 안내 한 줄: 같은 네트워크는 확인 방법, 전체 공유는 공개 범위 (새 백엔드일 때만) -->
      <p v-if="myIdentity" class="text-xs text-text-secondary mt-3" data-testid="scope-note">
        {{ scope === 'global' ? t('identity.globalNotice') : t('identity.verifyHint') }}
      </p>

      <div class="relative">
        <div
          v-if="activeDevices.length > 0"
          class="absolute -top-4 right-6 z-10 flex items-center gap-2 bg-surface border border-border rounded-full shadow-sm px-3 py-1.5"
        >
          <span class="text-xs font-semibold text-text-secondary whitespace-nowrap">
            {{ t('room.connectedDevices') }}
          </span>
          <ConnectedDevices
            :devices="activeDevices"
            :my-socket-id="mySocketId"
            :my-identity="myIdentity"
            :scope="scope"
          />
        </div>

        <main class="bg-surface rounded-xl p-8 border border-border">
          <!-- 파일/텍스트 탭 (항상 모바일과 동일한 스택 레이아웃을 사용) -->
          <div
            class="flex gap-2 mb-6 p-1 w-fit rounded-full border border-border bg-background"
            role="tablist"
            :aria-label="t('room.mobilePanelLabel')"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="mobilePanel === 'files'"
              class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              :class="mobilePanel === 'files' ? [accentBg, 'text-white'] : 'text-text-secondary'"
              @click="mobilePanel = 'files'"
            >
              {{ t('room.filesTab') }} ({{ files.length }})
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mobilePanel === 'text'"
              class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              :class="mobilePanel === 'text' ? [accentBg, 'text-white'] : 'text-text-secondary'"
              @click="mobilePanel = 'text'"
            >
              {{ t('room.textTab') }} ({{ texts.length }})
            </button>
          </div>

          <div class="flex flex-col gap-8">
            <!-- 파일 컬럼: 파일 탭 활성 시에만 표시 -->
            <section :class="{ hidden: mobilePanel !== 'files' }">
              <FileGallery
                :files="files"
                :room-id="roomId"
                :is-loading="isLoading"
                :has-more="hasMore"
                :scope="scope"
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
              />
            </section>

            <!-- 텍스트 컬럼: 텍스트 탭 활성 시에만 표시 -->
            <section :class="{ hidden: mobilePanel !== 'text' }">
              <TextShareBox
                :texts="texts"
                :scope="scope"
                @remove-text="$emit('remove-text', $event)"
                @clear-all="$emit('clear-all-texts')"
                @copy-text="$emit('copy-text', $event)"
              />
            </section>
          </div>
        </main>
      </div>

      <LandingContent />

      <AppFooter />
    </div>
  </div>
</template>
