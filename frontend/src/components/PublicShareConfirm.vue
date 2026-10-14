<script setup>
/** 전체 공유로 처음 보내기 전 확인. 공개 범위에만 동의하며 개별 기기 수신 선택이 아니다. */
import { watch, ref, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLockState, MIN_LOCK_PASSWORD } from '../composables/useLockState'

const { t } = useI18n()
const props = defineProps({ isOpen: { type: Boolean, default: false } })
const emit = defineEmits(['confirm', 'cancel'])
const cancelBtn = ref(null)
const lockState = useLockState()

// 선택 입력: 비워 두면 지금과 똑같이 공개로 보낸다. 입력하면 전체 공유 잠금을 켠 뒤 보낸다 (추가 클릭 없음)
const password = ref('')
const lockError = ref('')
const alreadyLocked = computed(() => lockState.isLocked('global'))
const busy = computed(() => lockState.busy.global)

watch(() => props.isOpen, async (open) => {
  if (open) {
    password.value = ''
    lockError.value = ''
    await nextTick()
    cancelBtn.value?.focus()
  }
})

async function confirm() {
  if (busy.value) return
  const pw = password.value
  if (pw) {
    if (pw.length < MIN_LOCK_PASSWORD) {
      lockError.value = t('lock.passwordTooShort', { min: MIN_LOCK_PASSWORD })
      return
    }
    try {
      await lockState.setLock('global', pw)
    } catch {
      lockError.value = t('lock.errors.setFailed')
      return
    }
    password.value = ''
  }
  emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="public-confirm-title"
      aria-describedby="public-confirm-desc"
      data-testid="public-share-confirm"
      @keydown.esc="emit('cancel')"
      @click.self="emit('cancel')"
    >
      <div class="w-full max-w-sm bg-surface text-text-primary rounded-2xl border border-border p-5 shadow-xl">
        <h2 id="public-confirm-title" class="text-base font-semibold m-0">{{ t('publicConfirm.title') }}</h2>
        <p id="public-confirm-desc" class="mt-2 text-sm text-text-secondary leading-relaxed">{{ t('publicConfirm.body') }}</p>
        <div v-if="!alreadyLocked" class="mt-3">
          <label for="public-lock-password" class="block text-xs text-text-secondary mb-1">{{ t('lock.confirmLabel') }}</label>
          <input
            id="public-lock-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('lock.confirmPlaceholder')"
            class="w-full min-h-[40px] px-3 rounded-lg border border-border bg-background text-sm text-text-primary"
            data-testid="public-confirm-password"
            @keydown.enter.prevent="confirm"
          />
          <p class="mt-1 text-xs m-0" :class="lockError ? 'text-red-500' : 'text-text-secondary'">{{ lockError || t('lock.confirmHint') }}</p>
        </div>
        <p v-else class="mt-3 text-xs text-text-secondary m-0" data-testid="public-confirm-locked">🔒 {{ t('lock.confirmAlreadyLocked') }}</p>
        <div class="mt-4 flex gap-2 justify-end flex-wrap">
          <button ref="cancelBtn" type="button" class="min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold" data-testid="public-confirm-cancel" @click="emit('cancel')">{{ t('notification.cancel') }}</button>
          <button type="button" class="min-h-[44px] px-5 rounded-full bg-scope-global text-white text-sm font-semibold" data-testid="public-confirm-accept" :disabled="busy" @click="confirm">{{ busy ? t('lock.settingUp') : (password ? t('lock.confirmLockedSend') : t('publicConfirm.confirm')) }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
