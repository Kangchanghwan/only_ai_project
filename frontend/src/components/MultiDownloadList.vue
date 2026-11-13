<script setup>
/**
 * 여러 파일 받기 목록: ZIP 묶음과 큰 파일을 한 줄씩 보여 주고, 사용자가 눌러 받는다.
 * 상태: idle(받기) / running(진행률) / started(브라우저가 받는 중) / done(받음 ✓) / failed(다시 받기)
 */
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../utils/fileUtils'

const { t } = useI18n()
defineProps({
  items: { type: Array, required: true }
})
const emit = defineEmits(['run'])

function label(item) {
  if (item.type === 'zip') {
    return item.zipCount > 1
      ? t('multiDownload.zipMany', { index: item.index + 1, total: item.zipCount, count: item.files.length })
      : t('multiDownload.zipOne', { count: item.files.length })
  }
  return item.file?.name || ''
}

/** "5.1 MB · ✓ 받음" (크기를 모르면 상태만) */
function detail(item) {
  const parts = []
  if (Number.isFinite(item.size)) parts.push(formatFileSize(item.size))
  if (item.state === 'running') parts.push(item.type === 'zip' ? t('multiDownload.progress', { percent: item.percent }) : t('multiDownload.preparing'))
  else if (item.state === 'done') parts.push(`✓ ${t('multiDownload.done')}`)
  else if (item.state === 'started') parts.push(`✓ ${t('multiDownload.started')}`)
  else if (item.state === 'failed') parts.push(t('multiDownload.failed'))
  return parts.join(' · ')
}

function buttonText(item) {
  if (item.state === 'failed') return t('multiDownload.again')
  if (item.state === 'done' || item.state === 'started') return t('multiDownload.again')
  return t('multiDownload.get')
}
</script>

<template>
  <ul class="m-0 p-0 list-none flex flex-col gap-2" data-testid="multi-download-list">
    <li
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
      :data-testid="`multi-download-item-${item.key}`"
      :data-state="item.state"
    >
      <span aria-hidden="true" class="text-lg shrink-0">{{ item.type === 'zip' ? '🗜️' : '📄' }}</span>
      <div class="min-w-0 flex-1">
        <p class="m-0 text-sm font-semibold truncate" :title="label(item)">{{ label(item) }}</p>
        <p v-if="detail(item)" class="m-0 text-xs text-text-secondary">{{ detail(item) }}</p>
      </div>
      <button
        type="button"
        class="min-h-[44px] px-4 rounded-full text-sm font-semibold shrink-0 disabled:opacity-50"
        :class="item.state === 'idle' || item.state === 'failed' ? 'bg-primary text-white' : 'border border-border'"
        :disabled="item.state === 'running'"
        :aria-label="`${buttonText(item)}: ${label(item)}`"
        :data-testid="`multi-download-run-${item.key}`"
        @click="emit('run', item)"
      >{{ buttonText(item) }}</button>
    </li>
  </ul>
</template>
