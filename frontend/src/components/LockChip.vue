<script setup>
/**
 * 업로드 영역의 비밀번호 잠금 칩. 범위(ip/global)별로 이번 접속 동안만 유지된다.
 * 꺼져 있을 때는 작은 버튼 하나뿐이라 평소 흐름의 클릭 수는 늘지 않는다.
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLockState, MIN_LOCK_PASSWORD } from '../composables/useLockState'

const { t } = useI18n()
const props = defineProps({ scope: { type: String, default: 'ip' } })
const lockState = useLockState()
// 입력 줄이 열려 있는 동안 도구 줄이 줄바꿈을 허용하도록 부모에게 알린다 (좁은 화면에서 입력 줄이 잘리지 않게)
const emit = defineEmits(['editing'])

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

watch(() => editing.value && !locked.value, (v) => emit('editing', v))
onBeforeUnmount(() => emit('editing', false))

// 잠금 줄의 '다시 잠그기'가 입력창을 열어 달라고 요청하면 연다
watch(() => lockState.editRequest[props.scope], (n, o) => {
  if (n !== o && !locked.value) startEdit()
})
</script>

<template>
  <div v-if="!locked" class="lock-chip-wrap" :class="{ 'is-editing': editing && !locked }" data-testid="lock-chip" @click.stop>
    <form v-if="editing" class="lock-form" @submit.prevent="apply">
      <input
        ref="inputRef"
        v-model="password"
        type="password"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        :placeholder="t('lock.passwordPlaceholder')"
        :aria-label="t('lock.passwordPlaceholder')"
        data-testid="lock-password"
        @keydown.esc.prevent="cancelEdit"
      />
      <button type="submit" class="lock-apply" :disabled="busy || password.length < MIN_LOCK_PASSWORD" data-testid="lock-apply">{{ busy ? t('lock.settingUp') : t('lock.apply') }}</button>
      <button type="button" class="lock-link" @click="cancelEdit">{{ t('notification.cancel') }}</button>
      <p class="lock-hint" :class="{ err: !!error }">{{ error || t('lock.chipHint') }}</p>
    </form>
    <button v-else type="button" class="lock-chip" data-testid="lock-start" :aria-label="t('lock.chipStart')" :title="t('lock.chipStart')" @click="startEdit">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
      <span class="lc-label">{{ t('lock.chipStart') }}</span>
    </button>
  </div>
</template>

<style scoped>
.lock-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.375rem;
  cursor: default;
}
/* 비밀번호 입력 중에는 도구 줄 아래 한 줄을 전부 쓴다 */
.lock-chip-wrap.is-editing {
  flex-basis: 100%;
  order: 99;
}
.lock-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: 0;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
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
  justify-content: flex-start;
  gap: 0.375rem;
  width: 100%;
  max-width: 28rem;
}
.lock-form input {
  flex: 1 1 10rem;
  min-width: 0;
  min-height: 36px;
  padding: 0 0.625rem;
  border-radius: 0;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 0.8125rem;
}
.lock-apply {
  min-height: 36px;
  padding: 0 0.875rem;
  border-radius: 0;
  border: 0;
  background: var(--color-ink);
  color: var(--color-on-ink);
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
  color: var(--color-danger);
}
/* 좁은 화면: 도구 줄을 한 줄로 두려고 글자는 숨기고 아이콘만 (이름은 aria-label·title로) */
@media (max-width: 639px) {
  .lc-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .lock-chip { min-width: 44px; justify-content: center; padding: 0 0.5rem; }
  .lock-chip svg { width: 16px; height: 16px; }
}
</style>
