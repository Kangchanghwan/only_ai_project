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
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div
    v-if="name"
    class="inline-flex items-center gap-2 bg-surface border border-border rounded-full shadow-sm pl-1.5 pr-2 py-1"
    data-testid="my-identity"
  >
    <AnimalAvatar :identity="identity" />
    <span class="text-sm font-semibold text-text-primary whitespace-nowrap">
      {{ t('identity.youAre', { name }) }}
    </span>
    <button
      type="button"
      class="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-full border border-border disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="cooling"
      :title="t('identity.rerollTitle')"
      :aria-label="t('identity.rerollTitle')"
      data-testid="reroll-button"
      @click="emit('reroll')"
    >
      <span aria-hidden="true">🎲</span>
      {{ t('identity.reroll') }}
    </button>
  </div>
</template>
