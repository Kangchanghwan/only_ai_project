<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimalAvatar from './AnimalAvatar.vue'
import { identityName, isValidIdentity } from '../utils/identity'

const { t } = useI18n()

const props = defineProps({
  /** 내 정체성 {adj, animal, suffix?}. 구버전 백엔드라 없으면 아무것도 그리지 않는다 */
  identity: { type: Object, default: null },
  /** 다시 뽑기를 다시 쓸 수 있게 되는 시각(epoch ms). 쿨다운 동안 버튼 비활성 */
  rerollAvailableAt: { type: Number, default: 0 }
})

const emit = defineEmits(['reroll'])

const name = computed(() => (isValidIdentity(props.identity) ? identityName(props.identity, t) : ''))

// 이름표를 누르면 관리(다시 뽑기)가 열린다. 항상 떠 있는 큰 버튼은 두지 않는다.
const manageOpen = ref(false)
const root = ref(null)

function onDocPointer(e) {
  if (root.value && !root.value.contains(e.target)) manageOpen.value = false
}
function onKey(e) {
  if (e.key === 'Escape') manageOpen.value = false
}
watch(manageOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onDocPointer)
    document.removeEventListener('keydown', onKey)
  }
})

// 쿨다운 표시: 남은 시간 동안만 버튼을 막는다
const now = ref(Date.now())
let timer = null
const cooling = computed(() => now.value < props.rerollAvailableAt)

watch(
  () => props.rerollAvailableAt,
  (until) => {
    clearInterval(timer)
    now.value = Date.now()
    if (until > now.value) {
      timer = setInterval(() => {
        now.value = Date.now()
        if (now.value >= until) clearInterval(timer)
      }, 250)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="name" ref="root" class="relative min-w-0 max-w-full" data-testid="my-identity">
    <button
      type="button"
      class="inline-flex items-center gap-2 max-w-full min-h-[44px] bg-background border border-border rounded-full pl-1.5 pr-3 py-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
      :aria-expanded="manageOpen"
      :aria-label="`${t('identity.youAre', { name })} - ${t('identity.manage')}`"
      data-testid="my-identity-trigger"
      @click="manageOpen = !manageOpen"
    >
      <AnimalAvatar :identity="identity" />
      <span class="text-sm font-semibold text-text-primary truncate">{{ t('identity.youAre', { name }) }}</span>
    </button>
    <div
      v-if="manageOpen"
      class="absolute left-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-lg p-3"
      role="group"
      :aria-label="t('identity.manage')"
      data-testid="identity-manage"
    >
      <p class="text-xs text-text-secondary mb-2 leading-relaxed">{{ t('identity.notAuth') }}</p>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 w-full min-h-[44px] text-sm text-text-primary px-3 rounded-lg border border-border disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="cooling"
        :title="t('identity.rerollTitle')"
        :aria-label="t('identity.rerollTitle')"
        data-testid="reroll-button"
        @click="emit('reroll'); manageOpen = false"
      >
        <span aria-hidden="true">🎲</span>
        {{ t('identity.reroll') }}
      </button>
    </div>
  </div>
</template>
