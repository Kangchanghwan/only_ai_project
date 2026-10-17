<script setup>
/**
 * 비밀번호로 잠긴 파일 카드.
 * 일반 파일 카드(FileCard)와 같은 칸 구성·크기를 쓴다: 체크박스 · 아이콘 · 이름/메타 2줄 · 주 버튼 · 더보기.
 * 카드 안에 줄을 더하지 않아 어떤 상태에서도 높이가 바뀌지 않는다.
 * - 비밀번호는 "풀기"를 누르면 뜨는 시트(더보기 시트와 같은 스타일)에서 받는다.
 * - 목록에서는 원래 이름 대신 알아볼 수 없는 문자를 보여 준다. 내가 보냈거나 이번 접속에서 푼 파일은 원래 이름.
 * - 메타 줄은 일반 카드와 같은 내용(보낸 사람 · 용량 · 시간)으로 고정해 좁은 화면에서도 줄 수가 같다.
 *   받는 중 진행률은 주 버튼 안의 %와 카드 아래 테두리의 얇은 막대로, 풀린 상태는 열린 자물쇠로 보여 준다.
 *   시트 밖에서 난 오류는 알림 토스트로 띄운다.
 * - 이번 접속에서 비밀번호를 확인했거나 내가 잠근 파일은 "…" → QR로 공유할 수 있다.
 *   QR·링크에는 이 파일의 키가 들어 있어 가진 사람은 비밀번호 없이 받는다 (lockedLink.js).
 * 미리보기·썸네일은 없다.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, formatUploadTime } from '../utils/fileUtils'
import SenderLabel from './SenderLabel.vue'
import { useScopeAccent } from '../composables/useScopeAccent'
import { useLockState } from '../composables/useLockState'
import { usePrivateRooms } from '../composables/usePrivateRooms'
import { openLockedFile, createLockedShareLink } from '../services/lockedDownloader'
import FileQRCodeModal from './FileQRCodeModal.vue'
import { r2Service } from '../services/r2Service.js'
import { trackEvent } from '../utils/analytics'
import { useNotification } from '../composables/useNotification'

const { t } = useI18n()
const props = defineProps({
  file: { type: Object, required: true },
  scope: { type: String, default: 'ip' },
  /** 1:1 방에서만 true: 방 키로 지울 수 있어 일괄 삭제 대상으로 고를 수 있다 */
  selectable: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false }
})
const emit = defineEmits(['delete-file', 'toggle-selection'])
const {
  bg: accentBg,
  text: accentText,
  bgSoft10: accentBgSoft10,
  hoverBorder50: accentHoverBorder50,
  borderL: accentBorderL,
  bgSoft5: accentBgSoft5,
  accentColor
} = useScopeAccent(() => props.scope)
const lockState = useLockState()
const notification = useNotification()

const HEX = '0123456789abcdef'
const scramble = (n) => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join('')
const placeholderName = scramble(16) + '…'

// idle | checking(비밀번호 확인) | downloading | done
const phase = ref('idle')
const password = ref('')
const showPassword = ref(false)
const message = ref('') // 시트 안 메시지 (틀림·시도 초과 등)
const shaking = ref(false)
const percent = ref(0)
const lockedOut = ref(false)
const revealing = ref('') // 이름 복원 애니메이션 중 표시 문자열
const isPasswordSheetOpen = ref(false)
const isActionsSheetOpen = ref(false)
const passwordInput = ref(null)
let revealTimer = null

const knownName = computed(() => lockState.nameFor(props.file.roomId, props.file.name))
const displayName = computed(() => revealing.value || knownName.value || placeholderName)
const isPlain = computed(() => !!revealing.value || !!knownName.value)
const meta = computed(() => ({ size: formatFileSize(props.file.size), time: formatUploadTime(props.file.created) }))
const busy = computed(() => phase.value === 'checking' || phase.value === 'downloading')

// 이번 접속에서 같은 비밀번호 묶음(salt)을 이미 풀었거나 내가 잠갔으면 시트 없이 바로 받는다.
// salt는 공개 정보라 meta로 확인한다 (keyring이 비어 있으면 요청하지 않는다).
const hasKey = ref(false)
let saltCache = null
async function checkKnownKey() {
  if (hasKey.value || lockState.version.value === 0) return
  try {
    if (!saltCache) saltCache = (await r2Service.lockedMeta(props.file.roomId, props.file.name))?.salt || null
    hasKey.value = !!(saltCache && lockState.keyFor(saltCache))
  } catch {
    /* 확인 실패는 무시: 풀기 버튼을 그대로 보여 준다 */
  }
}
onMounted(checkKnownKey)

// 1:1 방의 파일: 방 키가 이미 keyring에 있으므로 이름을 자동으로 풀어 보여 준다(받기는 하지 않음)
const privateRooms = usePrivateRooms()
let autoRevealing = false
async function autoRevealName() {
  if (autoRevealing || knownName.value || !privateRooms.has(props.file.roomId)) return
  autoRevealing = true
  try {
    await openLockedFile({ roomId: props.file.roomId, id: props.file.name, lockState, download: false })
  } catch {
    /* 실패하면 기존처럼 알아볼 수 없는 문자열로 둔다 */
  } finally {
    autoRevealing = false
  }
}
onMounted(autoRevealName)
watch(() => lockState.version.value, checkKnownKey)

// 삭제는 지울 수 있는 증명이 있을 때만: 내가 올린 파일(삭제 키) 또는 이번 접속에서 같은 비밀번호를 확인한 경우
const canDelete = computed(() =>
  !!lockState.deleteKeyFor(props.file.roomId, props.file.name) || hasKey.value || phase.value === 'done'
)
// QR 공유: 이 파일의 키를 풀 수 있을 때만 (내가 잠갔거나 이번 접속에서 같은 비밀번호를 확인)
const canShareQR = computed(() => hasKey.value || phase.value === 'done')
const qrFile = ref(null)
const isQRModalOpen = ref(false)
const qrPreparing = ref(false)
// 주 버튼: 바로 받을 수 있으면 "받기", 아니면 "풀기"
const canReceiveDirectly = computed(() => phase.value === 'done' || !!knownName.value || hasKey.value)

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

async function openPasswordSheet() {
  message.value = lockedOut.value ? t('lock.lockedOut') : ''
  isPasswordSheetOpen.value = true
  await nextTick()
  passwordInput.value?.focus()
}

function closePasswordSheet() {
  if (phase.value === 'checking') return
  isPasswordSheetOpen.value = false
  password.value = ''
  showPassword.value = false
}

function handlePasswordBackdrop(event) {
  if (event.target === event.currentTarget) closePasswordSheet()
}

/** 주 버튼 */
function handlePrimary() {
  if (busy.value) return
  if (canReceiveDirectly.value) {
    open()
  } else {
    openPasswordSheet()
  }
}

/** 받기: 비밀번호가 있으면 그것으로, 없으면 이번 접속에서 확인한 키로 */
async function open(pw) {
  if (busy.value || lockedOut.value) return
  message.value = ''
  phase.value = 'checking'
  percent.value = 0
  try {
    await openLockedFile({
      roomId: props.file.roomId,
      id: props.file.name,
      password: pw || undefined,
      lockState,
      onName: (name) => {
        // 비밀번호가 맞았다 → 시트를 닫고 카드에서 진행률을 보여 준다
        phase.value = 'downloading'
        isPasswordSheetOpen.value = false
        password.value = ''
        showPassword.value = false
        reveal(name)
      },
      onProgress: (p) => { percent.value = p }
    })
    phase.value = 'done'
    percent.value = 0
    trackEvent('locked_download_complete', { size_mb: Math.round((props.file.size || 0) / 1024 / 1024) })
  } catch (err) {
    phase.value = 'idle'
    percent.value = 0
    const code = err?.code
    if (code === 'NEED_PASSWORD') {
      // 이번 접속에서 이 비밀번호 묶음을 푼 적이 없다 → 시트로 묻는다
      hasKey.value = false
      openPasswordSheet()
    } else if (code === 'WRONG_PASSWORD') {
      if (err.remaining === 0) lockedOut.value = true
      message.value = typeof err.remaining === 'number'
        ? t('lock.wrongPassword', { count: err.remaining })
        : t('lock.wrongPasswordNoCount')
      if (!isPasswordSheetOpen.value) openPasswordSheet()
      shake()
    } else if (code === 'LOCKED_OUT') {
      lockedOut.value = true
      message.value = t('lock.lockedOut')
      if (!isPasswordSheetOpen.value) notification.showError(t('lock.lockedOut'))
    } else {
      const text = code === 'LOCK_TOO_LARGE_FOR_DEVICE'
        ? t('lock.tooLargeForDevice', { size: '500MB' })
        : (err?.status === 404 || code === 'LOCKED_NOT_FOUND')
          ? t('lock.errors.notFound')
          : t('lock.errors.downloadFailed')
      if (isPasswordSheetOpen.value) message.value = text
      else notification.showError(text)
    }
  }
}

function submitPassword() {
  if (!password.value || phase.value === 'checking') return
  open(password.value)
}

function openActionsSheet(event) {
  event?.stopPropagation()
  isActionsSheetOpen.value = true
}

function closeActionsSheet() {
  isActionsSheetOpen.value = false
}

function handleActionsBackdrop(event) {
  if (event.target === event.currentTarget) closeActionsSheet()
}

async function handleSheetQR() {
  if (qrPreparing.value) return
  qrPreparing.value = true
  try {
    const link = await createLockedShareLink({ roomId: props.file.roomId, id: props.file.name, lockState })
    qrFile.value = link
    closeActionsSheet()
    isQRModalOpen.value = true
    trackEvent('qr_open', { qr_type: 'locked' })
  } catch (err) {
    closeActionsSheet()
    notification.showError(
      err?.code === 'NEED_PASSWORD' ? t('lock.qrNeedKey')
        : (err?.status === 404 || err?.code === 'LOCKED_NOT_FOUND') ? t('lock.errors.notFound')
          : t('lock.qrFailed')
    )
  } finally {
    qrPreparing.value = false
  }
}

function handleSheetDelete() {
  closeActionsSheet()
  emit('delete-file', props.file)
}

onUnmounted(() => clearInterval(revealTimer))
</script>

<template>
  <div
    class="file-row relative overflow-hidden flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 sm:gap-3 sm:p-3 rounded-lg border border-border bg-surface transition-colors duration-200"
    :class="[accentHoverBorder50, isSelected ? ['border-l-4', accentBgSoft5, accentBorderL] : '']"
    data-testid="locked-file"
  >
    <!-- 1:1 방: 방 키로 지울 수 있으니 일괄 삭제용으로 고를 수 있다 -->
    <label v-if="selectable" class="inline-flex items-center justify-center w-11 h-11 -mx-1 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        class="select-checkbox w-5 h-5 cursor-pointer"
        :class="accentColor"
        :checked="isSelected"
        :aria-label="t('file.selectFile', { name: isPlain ? displayName : t('lock.lockedFile') })"
        data-testid="locked-select"
        @change="$emit('toggle-selection', file)"
      />
    </label>
    <!-- 체크박스 자리: 잠긴 파일은 하나씩 받으므로 선택할 수 없다 (정렬을 맞추려고 자리는 둔다) -->
    <label v-else class="inline-flex items-center justify-center w-11 h-11 -mx-1 shrink-0 opacity-40" :title="t('lock.noBulk')">
      <input
        type="checkbox"
        class="select-checkbox w-5 h-5"
        :class="accentColor"
        disabled
        :aria-label="t('lock.noBulk')"
      />
    </label>

    <!-- 아이콘 칸: 자물쇠 (풀리면 열린 자물쇠) -->
    <div
      class="w-8 h-8 sm:w-10 sm:h-10 rounded-md flex items-center justify-center flex-shrink-0"
      :class="[accentBgSoft10, accentText]"
      :title="phase === 'done' ? t('lock.unlockedHere') : t('lock.lockedFile')"
      data-testid="locked-icon"
      :data-state="phase === 'done' ? 'open' : 'locked'"
    >
      <svg v-if="phase === 'done'" class="lock-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
      <svg v-else class="lock-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
    </div>

    <!-- 이름 + 2행 "보낸 사람 · 용량 · 시간(상태)" — 일반 카드와 같은 순서 -->
    <div class="file-info flex-1 min-w-[8rem] sm:min-w-0">
      <p
        class="file-name text-sm font-medium truncate m-0"
        :class="isPlain ? 'text-text-primary' : 'text-text-secondary'"
        :title="isPlain ? displayName : t('lock.hiddenName')"
        data-testid="locked-name"
      >{{ displayName }}</p>
      <p class="file-meta flex flex-wrap items-center gap-x-1 text-xs text-text-secondary mt-0.5 m-0 min-w-0 overflow-hidden" data-testid="locked-meta">
        <SenderLabel v-if="file.uploader" :sender="file.uploader" class="shrink min-w-0" />
        <span v-if="file.uploader" aria-hidden="true">·</span>
        <span class="whitespace-nowrap">{{ meta.size }}</span>
        <span aria-hidden="true">·</span>
        <span class="whitespace-nowrap">{{ meta.time }}</span>
      </p>
    </div>

    <!-- 액션 영역: 일반 카드와 같은 버튼 2개 -->
    <div class="file-actions flex items-center gap-2 shrink-0 ml-auto">
      <button
        type="button"
        class="download-btn shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-full text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
        :class="[accentBg, { 'opacity-50': lockedOut && !canReceiveDirectly }]"
        :disabled="busy || (lockedOut && !canReceiveDirectly)"
        :aria-label="busy ? (phase === 'checking' ? t('lock.checking') : t('lock.decrypting', { percent })) : `${canReceiveDirectly ? t('file.receive') : t('lock.unlock')}: ${isPlain ? displayName : t('lock.lockedFile')}`"
        data-testid="locked-open"
        @click="handlePrimary"
      >
        <span v-if="busy" class="tabular-nums" role="status" data-testid="locked-progress-label">{{ phase === 'checking' ? '…' : percent + '%' }}</span>
        <svg v-else-if="canReceiveDirectly" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 7.5-2" />
        </svg>
        <span v-if="!busy" class="hidden sm:inline">{{ canReceiveDirectly ? t('file.receive') : t('lock.unlock') }}</span>
      </button>

      <button
        type="button"
        class="more-btn shrink-0 w-11 h-11 flex items-center justify-center rounded-full border border-border bg-background text-text-primary"
        :title="t('file.moreActions')"
        :aria-label="t('file.moreActions')"
        aria-haspopup="dialog"
        data-testid="locked-more"
        @click="openActionsSheet"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
    </div>

    <!-- 받는 중: 카드 높이를 바꾸지 않도록 아래 테두리에 겹쳐 그리는 얇은 막대 -->
    <div
      v-if="phase === 'downloading'"
      class="absolute left-0 bottom-0 h-0.5 transition-[width] duration-100 ease-linear"
      :class="accentBg"
      :style="{ width: percent + '%' }"
      aria-hidden="true"
      data-testid="locked-progress"
    ></div>

    <!-- 비밀번호 시트 (더보기 시트와 같은 스타일) -->
    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="isPasswordSheetOpen"
          class="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          :aria-label="t('lock.sheetTitle')"
          data-testid="locked-password-sheet"
          @click="handlePasswordBackdrop"
          @keydown.esc="closePasswordSheet"
        >
          <form
            class="w-full sm:w-80 bg-surface rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            :class="{ shake: shaking }"
            @submit.prevent="submitPassword"
            @animationend="shaking = false"
            @click.stop
          >
            <p class="text-sm font-semibold text-text-primary m-0">{{ t('lock.sheetTitle') }}</p>
            <p class="flex items-center gap-x-1 text-xs text-text-secondary mt-1 mb-3 m-0 min-w-0 overflow-hidden">
              <span class="whitespace-nowrap">{{ t('lock.lockedFile') }}</span>
              <span aria-hidden="true">·</span>
              <span class="whitespace-nowrap">{{ meta.size }}</span>
              <template v-if="file.uploader">
                <span aria-hidden="true">·</span>
                <SenderLabel :sender="file.uploader" class="shrink min-w-0" />
              </template>
            </p>
            <div class="flex items-center min-h-[44px] rounded-lg border border-border bg-background pl-3 pr-1">
              <input
                ref="passwordInput"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="off"
                :placeholder="t('lock.passwordPlaceholder')"
                :aria-label="t('lock.passwordPlaceholder')"
                :disabled="lockedOut || phase === 'checking'"
                class="flex-1 min-w-0 bg-transparent text-sm text-text-primary outline-none"
                data-testid="locked-password"
              />
              <button
                type="button"
                class="shrink-0 px-2 min-h-[36px] text-xs text-text-secondary"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >{{ showPassword ? t('lock.hidePassword') : t('lock.showPassword') }}</button>
            </div>
            <p class="text-xs text-red-500 min-h-[18px] mt-1.5 m-0" role="status" data-testid="locked-message">{{ message }}</p>
            <div class="flex gap-2 justify-end mt-2">
              <button
                type="button"
                class="min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold text-text-primary"
                :disabled="phase === 'checking'"
                @click="closePasswordSheet"
              >{{ t('notification.cancel') }}</button>
              <button
                type="submit"
                class="min-h-[44px] px-5 rounded-full text-white text-sm font-semibold disabled:opacity-50"
                :class="accentBg"
                :disabled="!password || lockedOut || phase === 'checking'"
                data-testid="locked-submit"
              >{{ phase === 'checking' ? t('lock.checking') : t('lock.unlock') }}</button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <FileQRCodeModal
      v-if="qrFile"
      :file="qrFile"
      :is-open="isQRModalOpen"
      :scan-text="t('lock.qrScan')"
      :hint="t('lock.qrHint')"
      error-correction-level="M"
      link-type="locked"
      @close="isQRModalOpen = false"
    />

    <!-- 더보기 시트: QR(키가 있을 때), 지울 수 있으면 "삭제", 아니면 안내 한 줄 -->
    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="isActionsSheetOpen"
          class="file-actions-sheet fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          :aria-label="isPlain ? displayName : t('lock.lockedFile')"
          data-testid="locked-actions-sheet"
          @click="handleActionsBackdrop"
          @keydown.esc="closeActionsSheet"
        >
          <div class="w-full sm:w-80 bg-surface rounded-t-2xl sm:rounded-2xl p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]" @click.stop>
            <p class="px-4 py-2 text-xs text-text-secondary truncate m-0">{{ isPlain ? displayName : t('lock.lockedFile') }}</p>
            <button
              v-if="canShareQR"
              class="sheet-qr w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary disabled:opacity-60"
              :disabled="qrPreparing"
              data-testid="locked-qr"
              @click="handleSheetQR"
            >
              <span aria-hidden="true">▦</span>
              <span class="text-sm font-medium">{{ qrPreparing ? t('lock.qrPreparing') : t('room.qrShareTitle') }}</span>
            </button>
            <button
              v-if="canDelete"
              class="sheet-delete w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-red-500/10 text-red-500"
              data-testid="locked-delete"
              @click="handleSheetDelete"
            >
              <span aria-hidden="true">🗑</span>
              <span class="text-sm font-medium">{{ t('file.delete') }}</span>
            </button>
            <p v-else class="px-4 py-3 text-sm text-text-secondary m-0" data-testid="locked-delete-note">{{ t('lock.errors.deleteForbidden') }}</p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.lock-svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active > *,
.sheet-leave-active > * {
  transition: transform 0.2s ease;
}
.sheet-enter-from > *,
.sheet-leave-to > * {
  transform: translateY(100%);
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
