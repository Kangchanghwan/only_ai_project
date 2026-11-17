<script setup>
/**
 * 전체 공유 방이 커서 목록이 최근 기기만 보일 때만 나타나는 보조 영역.
 * - 전체 공유 탭: "외 n대 접속 중" 한 줄 + "이름으로 찾기" 묶음
 * - 같은 네트워크 탭: "다른 네트워크 기기 n대 더 · 이름으로 찾기" 텍스트 버튼 (누르면 전체 공유 탭의 찾기 묶음으로)
 * 잘리지 않았으면(truncated=false) 아무것도 그리지 않는다.
 */
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import DeviceRow from './DeviceRow.vue'
import { socketService } from '../services/socketService'
import { ADJ_COUNT, ANIMAL_COUNT } from '../utils/identity'
import { isMeDevice } from '../utils/devices'

const { t } = useI18n()

const props = defineProps({
  scope: { type: String, default: 'ip' },
  /** 지금 탭에 보이는 기기 목록 */
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  /** 같은 네트워크 방의 기기 수 */
  ipCount: { type: Number, default: 0 },
  /** 같은 네트워크 탭의 '다른 네트워크 기기' 묶음에 이미 보이는 기기 수 */
  otherNetworkCount: { type: Number, default: 0 }
})
const emit = defineEmits(['select-scope'])

const truncated = socketService.globalRoomTruncated
const total = socketService.globalRoomTotal

const moreCount = computed(() => {
  const others = props.devices.filter((d) => !isMeDevice(d, props.mySocketId, props.myIdentity)).length
  return total.value - 1 - others
})
const otherNetworkMore = computed(() => Math.max(0, total.value - props.ipCount - props.otherNetworkCount))

const adj = ref(0)
const animal = ref(0)
const suffix = ref(0)
const loading = ref(false)
const found = ref(null)
/** null | 'notFound' | 'rateLimited' | 'error' */
const failure = ref(null)

const adjLabel = (i) => t(`identity.adj[${i}]`).split('/')[0]
const animalLabel = (i) => t(`identity.animal[${i}]`)

async function find() {
  if (loading.value) return
  loading.value = true
  found.value = null
  failure.value = null
  const res = await socketService.findDevice({ adj: adj.value, animal: animal.value, suffix: suffix.value || undefined })
  loading.value = false
  if (res?.ok && res.device) found.value = res.device
  else if (res?.code === 'NOT_FOUND') failure.value = 'notFound'
  else if (res?.code === 'RATE_LIMITED') failure.value = 'rateLimited'
  else failure.value = 'error'
}

const findEl = ref(null)
let pendingScroll = false
function goFind() {
  pendingScroll = true
  emit('select-scope', 'global')
}
watch(
  () => [props.scope, truncated.value],
  async ([scope, trunc]) => {
    if (!pendingScroll || scope !== 'global' || !trunc) return
    pendingScroll = false
    await nextTick()
    findEl.value?.scrollIntoView?.({ block: 'center' })
  }
)

const selectClass = 'min-h-[44px] min-w-0 rounded-none border border-border bg-surface text-ink text-sm px-2'
</script>

<template>
  <div v-if="truncated && scope === 'global'" class="mb-3" data-testid="roster-extras">
    <p v-if="moreCount > 0" class="m-0 mt-2 text-sm text-text-secondary" data-testid="roster-more">{{ t('roster.moreCount', { n: moreCount }) }}</p>
    <div ref="findEl" class="mt-3 pt-3 border-t border-border" data-testid="roster-find">
      <h3 class="m-0 text-sm font-bold text-ink">{{ t('roster.findTitle') }}</h3>
      <p class="m-0 mt-1 text-xs text-text-secondary">{{ t('roster.findHint') }}</p>
      <div class="mt-2 flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1 text-xs text-text-secondary min-w-0">
          {{ t('roster.adjLabel') }}
          <select v-model.number="adj" :class="selectClass" data-testid="roster-adj">
            <option v-for="i in ADJ_COUNT" :key="i" :value="i - 1">{{ adjLabel(i - 1) }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-text-secondary min-w-0">
          {{ t('roster.animalLabel') }}
          <select v-model.number="animal" :class="selectClass" data-testid="roster-animal">
            <option v-for="i in ANIMAL_COUNT" :key="i" :value="i - 1">{{ animalLabel(i - 1) }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-text-secondary min-w-0">
          {{ t('roster.suffixLabel') }}
          <select v-model.number="suffix" :class="selectClass" data-testid="roster-suffix">
            <option :value="0">{{ t('roster.noSuffix') }}</option>
            <option v-for="n in 8" :key="n" :value="n + 1">{{ n + 1 }}</option>
          </select>
        </label>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-none border-2 border-ink text-ink hover:bg-tint text-sm font-bold disabled:opacity-50"
          :disabled="loading"
          data-testid="roster-find-button"
          @click="find"
        >
          {{ t('roster.find') }}
        </button>
      </div>
      <ul v-if="found" class="mt-3 flex flex-col gap-2 list-none p-0" data-testid="roster-found">
        <DeviceRow :device="found" />
      </ul>
      <p v-else-if="failure" class="m-0 mt-3 text-sm text-text-primary" role="status" data-testid="roster-failure">
        {{ failure === 'notFound' ? t('roster.notFound') : failure === 'rateLimited' ? t('roster.rateLimited') : t('roster.findError') }}
      </p>
    </div>
  </div>
  <div v-else-if="truncated && scope === 'ip' && otherNetworkMore > 0" class="mb-3" data-testid="roster-other-more">
    <button type="button" class="min-h-[44px] -my-2 p-0 text-sm text-ink hover:underline bg-transparent border-0 text-left" data-testid="roster-go-find" @click="goFind">
      {{ t('roster.moreOtherNetwork', { n: otherNetworkMore }) }} · {{ t('roster.goFind') }}
    </button>
  </div>
</template>
