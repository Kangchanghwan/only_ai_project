<script setup>
import { computed } from 'vue'
import { getFileType } from '../../utils/fileUtils'

const props = defineProps({
  /** 파일 이름: 확장자로 종류를 판별한다 */
  name: { type: String, default: '' },
  /** 확장자로 알 수 없을 때 보조로 쓰는 MIME */
  mime: { type: String, default: '' }
})

// image | video | audio | document | archive | code | file
const kind = computed(() => {
  const byName = getFileType(props.name || '')
  if (byName !== 'file') return byName
  const m = (props.mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf' || m.startsWith('text/')) return 'document'
  if (/zip|rar|7z|tar|gzip/.test(m)) return 'archive'
  if (/json|javascript|xml/.test(m)) return 'code'
  return 'file'
})
</script>

<template>
  <svg
    class="text-text-secondary"
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :data-kind="kind"
    data-testid="file-type-icon"
  >
    <template v-if="kind === 'image'">
      <rect x="3" y="3" width="18" height="18" rx="0" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </template>
    <template v-else-if="kind === 'video'">
      <rect x="2" y="5" width="14" height="14" rx="0" />
      <path d="m16 10 6-3v10l-6-3" />
    </template>
    <template v-else-if="kind === 'audio'">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </template>
    <template v-else-if="kind === 'document'">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </template>
    <template v-else-if="kind === 'archive'">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </template>
    <template v-else-if="kind === 'code'">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </template>
    <template v-else>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </template>
  </svg>
</template>
