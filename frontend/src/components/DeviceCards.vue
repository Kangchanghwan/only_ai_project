<script setup>
/**
 * 접속 기기 카드 모음. PC(sm+)는 격자로 모두 보여 주고, 모바일은 가로 스크롤 띠(+N 표시, 양끝 페이드).
 * 나는 항상 첫 장. 데이터는 devices 하나뿐이다.
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import DeviceCard from './DeviceCard.vue'
import { isMeDevice, sortDevices } from '../utils/devices'
import { isPrivateScope } from '../composables/useShareScope'
import { inject } from 'vue'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'

const { t } = useI18n()
const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  scope: { type: String, default: 'ip' },
  rerollAvailableAt: { type: Number, default: 0 }
})
const emit = defineEmits(['reroll'])
const pair = inject(PAIR_CONTEXT_KEY, null)

const sorted = computed(() => sortDevices(props.devices, props.mySocketId, props.myIdentity))
const isMe = (d) => isMeDevice(d, props.mySocketId, props.myIdentity)
// 1:1/그룹 방이거나 연결 기능이 꺼져 있으면 다른 기기 카드에 연결 버튼이 없다
const pairable = computed(() => !!pair && !isPrivateScope(props.scope))

// 시각 딱지/쿨다운 갱신용 시계
const now = ref(Date.now())
let clock = null
const cooling = computed(() => now.value < props.rerollAvailableAt)
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { clearInterval(clock); resizeObserver?.disconnect(); resizeObserver = null })

// ── 모바일 가로 넘침: 오른쪽에 온전히 안 보이는 카드 수(+N), 양쪽 페이드 ──
const strip = ref(null)
const overflowRight = ref(false)
const scrolledAway = ref(false)
const hiddenRight = ref(0)
function cardEls() { return strip.value ? Array.from(strip.value.querySelectorAll('[data-testid="device-card"]')) : [] }
function updateOverflow() {
  const el = strip.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  scrolledAway.value = el.scrollLeft > 1
  overflowRight.value = max > 1 && el.scrollLeft < max - 1
  if (!overflowRight.value) { hiddenRight.value = 0; return }
  const edge = el.getBoundingClientRect().right
  hiddenRight.value = cardEls().filter((c) => c.getBoundingClientRect().right > edge + 1).length
}
function showNextHidden() {
  const el = strip.value
  if (!el) return
  const edge = el.getBoundingClientRect().right
  const next = cardEls().find((c) => c.getBoundingClientRect().right > edge + 1)
  if (next && typeof next.scrollIntoView === 'function') next.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' })
  else if (typeof el.scrollBy === 'function') el.scrollBy({ left: el.clientWidth * 0.8, behavior: 'smooth' })
}
let resizeObserver = null
onMounted(() => {
  updateOverflow()
  if (typeof ResizeObserver !== 'undefined' && strip.value) {
    resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(strip.value)
  }
})
watch(() => props.devices.length, async () => { await nextTick(); updateOverflow() })
</script>

<template>
  <div class="relative min-w-0" role="group" :aria-label="t('identity.listTitle', { count: devices.length })" data-testid="device-cards">
    <ul
      ref="strip"
      class="list-none m-0 p-0 flex flex-nowrap gap-[6px] overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible sm:snap-none items-stretch"
      data-testid="device-cards-strip"
      @scroll.passive="updateOverflow"
    >
      <DeviceCard
        v-for="d in sorted"
        :key="d.socketId"
        :device="d"
        :is-me="isMe(d)"
        :cooling="cooling"
        :pairable="pairable"
        :now="now"
        class="flex-[0_0_146px] snap-start sm:flex-auto"
        @reroll="emit('reroll')"
      />
    </ul>
    <span v-if="scrolledAway" class="sm:hidden pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent" aria-hidden="true" data-testid="cards-fade-left"></span>
    <span v-if="overflowRight" class="sm:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface to-transparent" aria-hidden="true" data-testid="cards-fade-right"></span>
    <button
      v-if="overflowRight && hiddenRight > 0"
      type="button"
      class="sm:hidden absolute right-0 top-1/2 -translate-y-1/2 h-8 min-w-[32px] px-1 inline-flex items-center justify-center rounded-none bg-surface border border-border text-ink font-extrabold text-[11px] cursor-pointer whitespace-nowrap"
      :title="String(hiddenRight)"
      :aria-label="String(hiddenRight)"
      data-testid="cards-more-right"
      @click="showNextHidden"
    ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span aria-hidden="true">+{{ hiddenRight }}</span></button>
  </div>
</template>
