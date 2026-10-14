<script setup>
/**
 * 비밀번호로 잠긴 파일 카드.
 * - 목록에서는 원래 이름 대신 알아볼 수 없는 문자를 보여 준다 (서버에도 이름은 암호문으로만 있다).
 *   내가 보낸 파일이거나 이번 접속에서 푼 파일은 이 기기만 아는 원래 이름을 보여 준다.
 * - 비밀번호가 맞으면 받으면서 이 기기에서 풀고, 끝나면 이름이 원래대로 돌아온다.
 * - 틀리면 입력란이 흔들리고 서버가 센 남은 시도 횟수를 보여 준다.
 * 공유 링크·QR·미리보기·썸네일은 없다.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, formatUploadTime } from '../utils/fileUtils'
import SenderLabel from './SenderLabel.vue'
import { useScopeAccent } from '../composables/useScopeAccent'
import { useLockState } from '../composables/useLockState'
import { openLockedFile } from '../services/lockedDownloader'
import { r2Service } from '../services/r2Service.js'
import { trackEvent } from '../utils/analytics'

const { t } = useI18n()
const props = defineProps({
  file: { type: Object, required: true },
  scope: { type: String, default: 'ip' }
})
const emit = defineEmits(['delete-file'])
const { bg: accentBg } = useScopeAccent(() => props.scope)
const lockState = useLockState()

const HEX = '0123456789abcdef'
const scramble = (n) => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join('')
const placeholderName = scramble(16) + '…'

// idle | checking(비밀번호 확인) | downloading | done | error
const phase = ref('idle')
const password = ref('')
const remaining = ref(null)
const message = ref('')
const shaking = ref(false)
const percent = ref(0)
const lockedOut = ref(false)
const showExplain = ref(false)
const revealing = ref('') // 이름 복원 애니메이션 중 표시 문자열
let revealTimer = null

const knownName = computed(() => lockState.nameFor(props.file.roomId, props.file.name))
const displayName = computed(() => revealing.value || knownName.value || placeholderName)
const isPlain = computed(() => !!revealing.value || !!knownName.value)
const meta = computed(() => ({ size: formatFileSize(props.file.size), time: formatUploadTime(props.file.created) }))
const busy = computed(() => phase.value === 'checking' || phase.value === 'downloading')

// 이번 접속에서 같은 비밀번호 묶음(salt)을 이미 풀었거나 내가 잠갔으면 입력란 대신 바로 받기 버튼을 보여 준다.
// salt는 공개 정보라 meta로 확인한다 (keyring이 비어 있으면 요청하지 않는다).
const hasKey = ref(false)
let saltCache = null
async function checkKnownKey() {
  if (knownName.value || hasKey.value || lockState.version.value === 0) return
  try {
    if (!saltCache) saltCache = (await r2Service.lockedMeta(props.file.roomId, props.file.name))?.salt || null
    hasKey.value = !!(saltCache && lockState.keyFor(saltCache))
  } catch {
    /* 확인 실패는 무시: 입력란을 그대로 보여 준다 */
  }
}
onMounted(checkKnownKey)
watch(() => lockState.version.value, checkKnownKey)
const quickOpen = computed(() => (phase.value === 'done' || !!knownName.value || hasKey.value) && !message.value)

/** 원래 이름이 한 글자씩 돌아오는 연출 (실제로 풀린 직후에만) */
function reveal(name) {
  clearInterval(revealTimer)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) { revealing.value = ''; return }
  const chars = [...name]
  const started = Date.now()
  const duration = 600
  revealTimer = setInterval(() => {
    const p = Math.min(1, (Date.now() - started) / duration)
    const k = Math.floor(chars.length * p)
    revealing.value = chars.slice(0, k).join('') + scramble(chars.length - k)
    if (p >= 1) {
      clearInterval(revealTimer)
      revealing.value = ''
    }
  }, 40)
}

function shake() {
  shaking.value = false
  requestAnimationFrame(() => { shaking.value = true })
}

async function open() {
  if (busy.value || lockedOut.value) return
  message.value = ''
  phase.value = 'checking'
  percent.value = 0
  try {
    await openLockedFile({
      roomId: props.file.roomId,
      id: props.file.name,
      password: password.value || undefined,
      lockState,
      onName: (name) => {
        phase.value = 'downloading'
        reveal(name)
      },
      onProgress: (p) => { percent.value = p }
    })
    password.value = ''
    phase.value = 'done'
    percent.value = 100
    trackEvent('locked_download_complete', { size_mb: Math.round((props.file.size || 0) / 1024 / 1024) })
  } catch (err) {
    phase.value = 'idle'
    const code = err?.code
    if (code === 'NEED_PASSWORD') {
      // 이번 접속에서 이 비밀번호 묶음을 푼 적이 없다 → 입력란을 보여 준다
      if (typeof err.remaining === 'number') remaining.value = err.remaining
      message.value = t('lock.needPassword')
    } else if (code === 'WRONG_PASSWORD') {
      remaining.value = err.remaining ?? null
      message.value = typeof err.remaining === 'number'
        ? t('lock.wrongPassword', { count: err.remaining })
        : t('lock.wrongPasswordNoCount')
      if (err.remaining === 0) lockedOut.value = true
      shake()
    } else if (code === 'LOCKED_OUT') {
      lockedOut.value = true
      remaining.value = 0
      message.value = t('lock.lockedOut')
    } else if (code === 'LOCK_TOO_LARGE_FOR_DEVICE') {
      message.value = t('lock.tooLargeForDevice', { size: '500MB' })
    } else if (err?.status === 404 || code === 'LOCKED_NOT_FOUND') {
      message.value = t('lock.errors.notFound')
    } else {
      phase.value = 'error'
      message.value = t('lock.errors.downloadFailed')
    }
  }
}

function handleDelete(event) {
  event?.stopPropagation()
  emit('delete-file', props.file)
}

onUnmounted(() => clearInterval(revealTimer))
</script>

<template>
  <div class="locked-row rounded-lg border border-border bg-surface p-2 sm:p-3" data-testid="locked-file">
    <div class="flex items-center gap-2 sm:gap-3">
      <div class="lock-ico" :class="{ open: phase === 'done' }" aria-hidden="true">
        <svg v-if="phase === 'done'" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
        <svg v-else viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p
          class="text-sm font-medium text-text-primary truncate m-0"
          :class="{ 'font-mono': !isPlain }"
          :title="isPlain ? displayName : t('lock.hiddenName')"
          data-testid="locked-name"
        >{{ displayName }}</p>
        <p class="flex flex-wrap items-center gap-x-1 text-xs text-text-secondary mt-0.5 m-0 min-w-0">
          <span class="whitespace-nowrap">{{ phase === 'done' ? t('lock.unlockedHere') : t('lock.lockedFile') }}</span>
          <span aria-hidden="true">·</span>
          <span class="whitespace-nowrap">{{ meta.size }}</span>
          <span aria-hidden="true">·</span>
          <span class="whitespace-nowrap">{{ meta.time }}</span>
          <template v-if="file.uploader">
            <span aria-hidden="true">·</span>
            <SenderLabel :sender="file.uploader" class="shrink min-w-0" />
          </template>
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 w-11 h-11 flex items-center justify-center rounded-full border border-border bg-background text-red-500"
        :title="t('file.delete')"
        :aria-label="`${t('file.delete')}: ${isPlain ? displayName : t('lock.lockedFile')}`"
        data-testid="locked-delete"
        @click="handleDelete"
      >🗑</button>
    </div>

    <!-- 받는 중: 받으면서 푼다 -->
    <div v-if="phase === 'downloading' || phase === 'checking'" class="mt-3">
      <div class="lock-bar"><div class="lock-bar-fill" :class="accentBg" :style="{ width: percent + '%' }"></div></div>
      <p class="text-xs text-text-secondary mt-1 m-0" style="font-variant-numeric: tabular-nums">
        {{ phase === 'checking' ? t('lock.checking') : t('lock.decrypting', { percent }) }}
      </p>
    </div>

    <!-- 비밀번호 입력 / 받기 -->
    <form
      v-else
      class="mt-3 flex gap-2"
      :class="{ shake: shaking }"
      @submit.prevent="open"
      @animationend="shaking = false"
    >
      <input
        v-if="!quickOpen"
        v-model="password"
        type="password"
        autocomplete="off"
        :placeholder="t('lock.passwordPlaceholder')"
        :aria-label="t('lock.passwordPlaceholder')"
        :disabled="lockedOut"
        class="flex-1 min-w-0 min-h-[40px] px-3 rounded-lg border border-border bg-background text-sm text-text-primary"
        data-testid="locked-password"
      />
      <button
        type="submit"
        class="min-h-[40px] px-4 rounded-lg text-white text-sm font-semibold"
        :class="[accentBg, { 'ml-auto': quickOpen }]"
        :disabled="lockedOut"
        data-testid="locked-open"
      >{{ phase === 'done' ? t('lock.downloadAgain') : quickOpen ? t('file.receive') : t('lock.unlock') }}</button>
    </form>
    <p v-if="message" class="text-xs mt-1 m-0" :class="phase === 'error' || remaining !== null || lockedOut ? 'text-red-500' : 'text-text-secondary'" role="status" data-testid="locked-message">{{ message }}</p>

    <button type="button" class="lock-badge mt-2" :aria-expanded="showExplain" data-testid="locked-badge" @click="showExplain = !showExplain">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /></svg>
      {{ t('lock.badge') }}
    </button>
    <p v-if="showExplain" class="text-xs text-text-secondary leading-relaxed mt-2 m-0" data-testid="locked-explain">{{ t('lock.explain') }}</p>
  </div>
</template>

<style scoped>
.lock-ico {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  display: grid;
  place-items: center;
  flex: none;
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  color: var(--color-primary);
}
.lock-ico svg,
.lock-badge svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 0;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 0.6875rem;
  cursor: pointer;
}
.lock-badge svg {
  width: 11px;
  height: 11px;
  stroke-width: 2;
}
.lock-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
}
.lock-bar-fill {
  height: 100%;
  transition: width 0.12s linear;
}
.shake {
  animation: lock-shake 0.35s;
}
@keyframes lock-shake {
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}
@media (prefers-reduced-motion: reduce) {
  .shake { animation: none; }
}
</style>
