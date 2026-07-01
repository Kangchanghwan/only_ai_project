<script setup>
import AppHeader from './AppHeader.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import AppFooter from './AppFooter.vue'

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
  devices: {
    type: Array,
    default: () => []
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
</script>

<template>
  <div class="max-w-[1600px] mx-auto p-6 text-text-primary">
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
      :devices="devices"
    />

    <ShareScopeTabs
      :scope="scope"
      :ip-devices="ipRoomDevices"
      :global-devices="globalRoomDevices"
      @select="$emit('select-scope', $event)"
    />

    <main class="bg-surface rounded-xl p-8 border border-border">
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
        @select-scope="$emit('select-scope', $event)"
        @paste-content="$emit('paste-content')"
        @load-more="$emit('load-more')"
      />

      <!-- Text Sharing Section -->
      <div class="mt-8">
        <TextShareBox
          :texts="texts"
          @remove-text="$emit('remove-text', $event)"
          @clear-all="$emit('clear-all-texts')"
          @copy-text="$emit('copy-text', $event)"
        />
      </div>
    </main>

    <AppFooter />
  </div>
</template>
