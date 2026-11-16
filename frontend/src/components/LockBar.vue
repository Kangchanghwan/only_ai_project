<script setup>
/**
 * 보내기 상자 맨 위의 잠금 상태 줄. 상태 3가지:
 * - on: 잠금이 켜져 있다 (푸는 버튼은 바로 풀지 않고 확인 줄로 넘어간다)
 * - confirm: "잠금을 풀까요?" 확인
 * - lapsed: 이 탭에서 잠금을 켰었는데 새로고침으로 꺼졌다 (지금 보내면 잠기지 않는다)
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLockState } from '../composables/useLockState'

const { t } = useI18n()
const props = defineProps({ scope: { type: String, default: 'ip' } })
const lockState = useLockState()

const confirming = ref(false)
const offRef = ref(null)
const cancelRef = ref(null)

const locked = computed(() => lockState.isLocked(props.scope))
const state = computed(() => {
  if (locked.value) return confirming.value ? 'confirm' : 'on'
  if (lockState.lapsed[props.scope]) return 'lapsed'
  return null
})

watch(() => props.scope, () => { confirming.value = false })
watch(locked, (v) => { if (!v) confirming.value = false })

async function askOff() {
  confirming.value = true
  await nextTick()
  cancelRef.value?.focus()
}
async function cancelOff() {
  confirming.value = false
  await nextTick()
  offRef.value?.focus()
}
function confirmOff() {
  confirming.value = false
  lockState.clearLock(props.scope)
}
</script>

<template>
  <div role="status">
    <div
      v-if="state === 'on'"
      class="flex items-center gap-1.5 min-h-[32px] px-2.5 bg-ink text-on-ink text-xs"
      data-testid="lock-bar"
      data-state="on"
    >
      <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      <span class="font-extrabold whitespace-nowrap">{{ t('lock.chipOn') }}</span>
      <span class="opacity-85 min-w-0 truncate"><span class="hidden sm:inline">{{ t('lock.barDesc') }}</span><span class="sm:hidden">{{ t('lock.barDescShort') }}</span></span>
      <button
        ref="offRef"
        type="button"
        class="ml-auto self-stretch min-w-[44px] px-2 font-bold underline underline-offset-2 whitespace-nowrap bg-transparent border-0 text-on-ink cursor-pointer"
        data-testid="lock-off"
        @click="askOff"
      >{{ t('lock.chipOff') }}</button>
    </div>
    <div
      v-else-if="state === 'confirm'"
      class="flex flex-wrap items-center gap-1.5 min-h-[32px] px-2.5 py-1 bg-ink text-on-ink text-xs"
      data-testid="lock-bar"
      data-state="confirm"
      @keydown.esc.prevent="cancelOff"
    >
      <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      <span class="min-w-0">{{ t('lock.offConfirm') }}</span>
      <span class="ml-auto flex items-center gap-1.5">
        <button type="button" class="h-7 px-2.5 rounded-none border border-on-ink bg-on-ink text-ink text-xs font-bold whitespace-nowrap cursor-pointer" data-testid="lock-off-confirm" @click="confirmOff">{{ t('lock.offConfirmYes') }}</button>
        <button ref="cancelRef" type="button" class="h-7 px-2.5 rounded-none border border-on-ink bg-transparent text-on-ink text-xs font-bold whitespace-nowrap cursor-pointer" data-testid="lock-off-cancel" @click="cancelOff">{{ t('notification.cancel') }}</button>
      </span>
    </div>
    <div
      v-else-if="state === 'lapsed'"
      class="flex flex-wrap items-center gap-1.5 min-h-[32px] px-2.5 py-1 bg-tint text-ink text-xs border-b border-border"
      data-testid="lock-bar"
      data-state="lapsed"
    >
      <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>
      <span class="min-w-0">{{ t('lock.reloadOff') }}</span>
      <span class="ml-auto flex items-center gap-1.5">
        <button type="button" class="h-7 px-2.5 rounded-none border border-ink bg-surface text-ink text-xs font-bold whitespace-nowrap cursor-pointer" data-testid="lock-relock" @click="lockState.requestEdit(scope)">{{ t('lock.reloadRelock') }}</button>
        <button type="button" class="w-7 h-7 inline-flex items-center justify-center rounded-none border-0 bg-transparent text-ink cursor-pointer" :aria-label="t('notification.cancel')" data-testid="lock-lapsed-dismiss" @click="lockState.dismissLapsed(scope)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </span>
    </div>
  </div>
</template>
