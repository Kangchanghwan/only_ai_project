<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './AppHeader.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import AppFooter from './AppFooter.vue'
import ConnectedDevices from './ConnectedDevices.vue'

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
  'select-scope'
])

const mobilePanel = ref('files')

const activeDevices = computed(() =>
  props.scope === 'global' ? props.globalRoomDevices : props.ipRoomDevices
)
</script>

<template>
  <div :class="['max-w-[1600px] mx-auto pt-6 px-6 text-text-primary', files.length > 0 && !isLoading ? 'pb-24' : 'pb-6']">
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
    />

    <ShareScopeTabs
      :scope="scope"
      @select="$emit('select-scope', $event)"
    />

    <div class="relative">
      <div
        v-if="activeDevices.length > 0"
        class="absolute -top-4 right-6 z-10 flex items-center gap-2 bg-surface border border-border rounded-full shadow-sm px-3 py-1.5"
      >
        <span class="text-xs font-semibold text-text-secondary whitespace-nowrap">
          {{ t('room.connectedDevices') }}
        </span>
        <ConnectedDevices :devices="activeDevices" />
      </div>

      <main class="bg-surface rounded-xl p-8 border border-border">
        <!-- 모바일 전용 파일/텍스트 탭 (md 이상에서는 숨김) -->
        <div
          class="flex md:hidden gap-2 mb-6 p-1 w-fit rounded-full border border-border bg-background"
          role="tablist"
          :aria-label="t('room.mobilePanelLabel')"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="mobilePanel === 'files'"
            class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
            :class="mobilePanel === 'files' ? 'bg-primary text-white' : 'text-text-secondary'"
            @click="mobilePanel = 'files'"
          >
            {{ t('room.filesTab') }} ({{ files.length }})
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mobilePanel === 'text'"
            class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
            :class="mobilePanel === 'text' ? 'bg-primary text-white' : 'text-text-secondary'"
            @click="mobilePanel = 'text'"
          >
            {{ t('room.textTab') }} ({{ texts.length }})
          </button>
        </div>

        <div class="flex flex-col md:flex-row gap-8">
          <!-- 파일 컬럼: 데스크톱 60%, 모바일에서는 파일 탭 활성 시에만 표시 -->
          <section :class="['md:w-[60%] md:block', { hidden: mobilePanel !== 'files' }]">
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

          <!-- 텍스트 컬럼: 데스크톱 40%, 모바일에서는 텍스트 탭 활성 시에만 표시 -->
          <section :class="['md:w-[40%] md:block', { hidden: mobilePanel !== 'text' }]">
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

    <AppFooter />
  </div>
</template>
