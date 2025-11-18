<script setup>
import AppHeader from './AppHeader.vue'
import RoomInfo from './RoomInfo.vue'
import FileUploadSection from './FileUploadSection.vue'
import FileGallery from './FileGallery.vue'

const props = defineProps({
  roomId: {
    type: String,
    default: null
  },
  files: {
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
  }
})

const emit = defineEmits([
  'copy-room-code',
  'copy-image',
  'join-other-room',
  'upload-files',
  'download-file',
  'download-selected',
  'download-all',
  'copy-selected-to-clipboard'
])
</script>

<template>
  <div class="max-w-[1400px] mx-auto p-6 text-text-primary">
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
      @join-other-room="$emit('join-other-room', $event)"
    />

    <main class="bg-surface rounded-xl p-8 border border-border">
      <RoomInfo
        :room-id="roomId"
        :is-connecting="isConnecting"
        @copy-room-code="$emit('copy-room-code')"
      />

      <FileUploadSection @upload-files="$emit('upload-files', $event)" />

      <FileGallery
        :files="files"
        :is-loading="isLoading"
        @copy-image="$emit('copy-image', $event)"
        @download-file="$emit('download-file', $event)"
        @download-selected="$emit('download-selected', $event)"
        @download-all="$emit('download-all', $event)"
        @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
      />
    </main>
  </div>
</template>
