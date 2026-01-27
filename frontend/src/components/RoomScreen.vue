<script setup>
import AppHeader from './AppHeader.vue'
import RoomInfo from './RoomInfo.vue'
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
  isConnecting: {
    type: Boolean,
    default: false
  },
  devices: {
    type: Array,
    default: () => []
  },
  hasMore: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'copy-room-code',
  'copy-image',
  'join-other-room',
  'upload-files',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'remove-text',
  'clear-all-texts',
  'copy-text',
  'paste-content',
  'load-more'
])
</script>

<template>
  <div class="max-w-[1600px] mx-auto p-6 text-text-primary">
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
    />

    <main class="bg-surface rounded-xl p-8 border border-border">
      <RoomInfo
        :room-id="roomId"
        :is-connecting="isConnecting"
        :devices="devices"
        @copy-room-code="$emit('copy-room-code')"
        @join-other-room="$emit('join-other-room', $event)"
      />

      <FileGallery
        :files="files"
        :room-id="roomId"
        :is-loading="isLoading"
        :has-more="hasMore"
        @copy-image="$emit('copy-image', $event)"
        @download-file="$emit('download-file', $event)"
        @download-parallel="$emit('download-parallel', $event)"
        @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
        @upload-files="$emit('upload-files', $event)"
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
