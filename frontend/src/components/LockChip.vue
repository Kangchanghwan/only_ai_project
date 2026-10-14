<script setup>
/**
 * 업로드 영역의 비밀번호 잠금 칩. 범위(ip/global)별로 이번 접속 동안만 유지된다.
 * 꺼져 있을 때는 작은 버튼 하나뿐이라 평소 흐름의 클릭 수는 늘지 않는다.
 */
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLockState, MIN_LOCK_PASSWORD } from '../composables/useLockState'

const { t } = useI18n()
const props = defineProps({ scope: { type: String, default: 'ip' } })
const lockState = useLockState()

const editing = ref(false)
const password = ref('')
const error = ref('')
const inputRef = ref(null)

const locked = computed(() => lockState.isLocked(props.scope))
const busy = computed(() => lockState.busy[props.scope])

async function startEdit() {
  editing.value = true
  error.value = ''
  password.value = ''
  await nextTick()
  inputRef.value?.focus()
}

function cancelEdit() {
  editing.value = false
  password.value = ''
  error.value = ''
}

async function apply() {
  if (busy.value) return
  if (password.value.length < MIN_LOCK_PASSWORD) {
    error.value = t('lock.passwordTooShort', { min: MIN_LOCK_PASSWORD })
    return
  }
  try {
    await lockState.setLock(props.scope, password.value)
    cancelEdit()
  } catch {
    error.value = t('lock.errors.setFailed')
  }
}

function unlock() {
  lockState.clearLock(props.scope)
}
</script>

<template>
  <div class="lock-chip-wrap" data-testid="lock-chip" @click.stop>
    <template v-if="locked">
      <span class="lock-chip on">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        {{ t('lock.chipOn') }}
      </span>
      <button type="button" class="lock-link" data-testid="lock-off" @click="unlock">{{ t('lock.chipOff') }}</button>
    </template>
    <form v-else-if="editing" class="lock-form" @submit.prevent="apply">
      <input
        ref="inputRef"
        v-model="password"
        type="password"
        autocomplete="new-password"
        :placeholder="t('lock.passwordPlaceholder')"
        :aria-label="t('lock.passwordPlaceholder')"
        data-testid="lock-password"
        @keydown.esc.prevent="cancelEdit"
      />
      <button type="submit" class="lock-apply" :disabled="busy" data-testid="lock-apply">{{ busy ? t('lock.settingUp') : t('lock.apply') }}</button>
      <button type="button" class="lock-link" @click="cancelEdit">{{ t('notification.cancel') }}</button>
      <p class="lock-hint" :class="{ err: !!error }">{{ error || t('lock.chipHint') }}</p>
    </form>
    <button v-else type="button" class="lock-chip" data-testid="lock-start" @click="startEdit">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
      {{ t('lock.chipStart') }}
    </button>
  </div>
</template>

<style scoped>
.lock-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  cursor: default;
}
.lock-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 32px;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
}
.lock-chip.on {
  border-color: transparent;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
  font-weight: 600;
  cursor: default;
}
.lock-chip svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.lock-link {
  min-height: 32px;
  padding: 0 0.5rem;
  background: transparent;
  border: 0;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
}
.lock-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
  max-width: 22rem;
}
.lock-form input {
  flex: 1 1 10rem;
  min-width: 0;
  min-height: 36px;
  padding: 0 0.625rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 0.8125rem;
}
.lock-apply {
  min-height: 36px;
  padding: 0 0.875rem;
  border-radius: 0.5rem;
  border: 0;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.lock-apply:disabled {
  opacity: 0.6;
}
.lock-hint {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}
.lock-hint.err {
  color: #ef4444;
}
</style>
