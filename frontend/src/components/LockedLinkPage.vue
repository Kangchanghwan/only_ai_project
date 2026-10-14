<script setup>
/**
 * 잠긴 파일 QR·링크로 들어왔을 때의 받기 화면.
 * 링크에 든 파일 키로 이 기기에서 풀어 저장한다. 비밀번호를 묻지 않고, 룸에 접속하지 않는다.
 * 파일명은 받기 전에 확인할 수 있게 먼저 보여 주고, 저장은 버튼 한 번으로 한다
 * (모바일 브라우저가 사용자 동작 없는 자동 저장을 막는 경우가 있어서).
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../utils/fileUtils'
import { openLockedLink } from '../services/lockedDownloader'
import { trackEvent } from '../utils/analytics'

const { t } = useI18n()
const props = defineProps({
  link: { type: Object, default: null } // { roomId, id, verifier, key } | null(형식 오류)
})

// loading | ready | downloading | done | error
const phase = ref(props.link ? 'loading' : 'error')
const name = ref('')
const size = ref(0)
const percent = ref(0)
const errorText = ref(props.link ? '' : t('lock.link.invalid'))

function describe(err) {
  const code = err?.code
  if (code === 'LOCK_LINK_INVALID') return t('lock.link.invalid')
  if (code === 'LOCK_TOO_LARGE_FOR_DEVICE') return t('lock.tooLargeForDevice', { size: '500MB' })
  if (code === 'LOCKED_OUT') return t('lock.lockedOut')
  if (err?.status === 404 || code === 'LOCKED_NOT_FOUND') return t('lock.link.expired')
  return t('lock.errors.downloadFailed')
}

onMounted(async () => {
  if (!props.link) return
  try {
    const info = await openLockedLink({ ...props.link, download: false })
    name.value = info.name
    size.value = info.size
    phase.value = 'ready'
  } catch (err) {
    errorText.value = describe(err)
    phase.value = 'error'
  }
})

async function receive() {
  if (phase.value === 'downloading' || !props.link) return
  phase.value = 'downloading'
  percent.value = 0
  errorText.value = ''
  try {
    await openLockedLink({ ...props.link, onProgress: (p) => { percent.value = p } })
    phase.value = 'done'
    trackEvent('locked_link_download_complete', { size_mb: Math.round((size.value || 0) / 1024 / 1024) })
  } catch (err) {
    errorText.value = describe(err)
    // 파일 정보는 이미 확인했으니 다시 받기를 시도할 수 있게 둔다 (단, 링크·파일 자체 문제면 오류 화면)
    phase.value = name.value && !['LOCK_LINK_INVALID'].includes(err?.code) && err?.status !== 404 ? 'ready' : 'error'
  }
}
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-text-primary" data-testid="locked-link-page">
    <div class="w-full max-w-sm bg-surface border border-border rounded-2xl p-5 shadow-xl">
      <p class="text-xs text-text-secondary m-0 mb-3">Clipboard Share · {{ t('lock.link.title') }}</p>

      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-primary/10 text-primary" aria-hidden="true">
          <svg v-if="phase === 'done'" class="lock-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
          <svg v-else class="lock-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate m-0" :class="name ? 'text-text-primary' : 'text-text-secondary'" data-testid="locked-link-name">
            {{ name || (phase === 'loading' ? t('lock.link.loading') : t('lock.lockedFile')) }}
          </p>
          <p class="text-xs text-text-secondary mt-0.5 m-0" style="font-variant-numeric: tabular-nums" data-testid="locked-link-meta">
            <template v-if="size">{{ formatFileSize(size) }}</template>
            <template v-if="phase === 'downloading'"> · {{ t('lock.decrypting', { percent }) }}</template>
            <template v-else-if="phase === 'done'"> · {{ t('lock.link.done') }}</template>
          </p>
        </div>
      </div>

      <div v-if="phase === 'downloading'" class="mt-3 h-1 rounded-full bg-black/10 overflow-hidden" aria-hidden="true">
        <div class="h-full bg-primary transition-[width] duration-100 ease-linear" :style="{ width: percent + '%' }"></div>
      </div>

      <p v-if="errorText" class="text-xs text-red-500 mt-3 m-0" role="alert" data-testid="locked-link-error">{{ errorText }}</p>

      <button
        v-if="phase === 'ready' || phase === 'downloading' || phase === 'done'"
        type="button"
        class="mt-4 w-full min-h-[48px] rounded-full bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        :disabled="phase === 'downloading'"
        data-testid="locked-link-receive"
        @click="receive"
      >
        <svg v-if="phase !== 'downloading'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{{ phase === 'downloading' ? percent + '%' : phase === 'done' ? t('lock.link.again') : t('file.receive') }}</span>
      </button>

      <a
        href="/"
        class="mt-2 w-full min-h-[44px] rounded-full border border-border text-sm font-semibold text-text-primary inline-flex items-center justify-center no-underline"
        data-testid="locked-link-home"
      >{{ t('lock.link.openApp') }}</a>
    </div>
  </main>
</template>

<style scoped>
.lock-svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
