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
  rerollAvailableAt: { type: Number, default: 0 },
  /** 참이면 "나" 카드 바로 뒤에 "휴대폰 초대" 점선 타일을 둔다 */
  inviteCard: { type: Boolean, default: false }
})
const emit = defineEmits(['reroll', 'invite-phone'])
const pair = inject(PAIR_CONTEXT_KEY, null)

// 1:1 요청을 주고받는 중인 기기는 내 카드 바로 다음에 둔다
const pairingIds = computed(() => {
  const ids = new Set()
  for (const [id, st] of Object.entries(pair?.states?.value || {})) if (st?.state === 'pending' || st?.state === 'connecting') ids.add(id)
  const inId = pair?.incoming?.value?.peer?.socketId
  if (inId) ids.add(inId)
  return ids
})
const sorted = computed(() => sortDevices(props.devices, props.mySocketId, props.myIdentity, pairingIds.value))
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
// ── PC(640px+): 최대 2줄. 한 줄 칸 수는 실제 폭에서 구한다 ──
const CARD_MIN = 150
const CARD_GAP = 6
const desktop = ref(false)
const cols = ref(0)
const expanded = ref(false)
function updateCols() {
  const el = strip.value
  desktop.value = typeof window !== 'undefined' && window.innerWidth >= 640
  const w = el?.clientWidth || 0
  cols.value = w > 0 ? Math.max(1, Math.floor((w + CARD_GAP) / (CARD_MIN + CARD_GAP))) : 0
}
const capacity = computed(() => cols.value * 2)
const overCapacity = computed(() => desktop.value && cols.value > 0 && sorted.value.length > capacity.value)
const hiddenCount = computed(() => (overCapacity.value ? sorted.value.length - (capacity.value - 1) : 0))
// 가려질 순서에 1:1 요청 중인 기기가 있으면 자동으로 펼친다
const forcedOpen = computed(() => overCapacity.value && sorted.value.slice(capacity.value - 1).some((d) => pairingIds.value.has(d.socketId)))
const isOpen = computed(() => expanded.value || forcedOpen.value)
const shown = computed(() => (overCapacity.value && !isOpen.value ? sorted.value.slice(0, capacity.value - 1) : sorted.value))
const TILE = 'hidden sm:flex h-[85px] items-center justify-center text-center px-2 border border-border bg-tint text-ink font-bold text-xs cursor-pointer rounded-none'
const INVITE_TILE = 'w-full h-[85px] flex flex-col items-center justify-center gap-0.5 text-center px-2 border border-dashed border-ink bg-transparent text-ink cursor-pointer rounded-none hover:bg-tint'

function updateOverflow() {
  updateCols()
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
watch([() => props.devices.length, () => props.inviteCard], async () => { await nextTick(); updateOverflow() })
</script>

<template>
  <div class="relative min-w-0" role="group" :aria-label="t('identity.listTitle', { count: devices.length })" data-testid="device-cards">
    <ul
      ref="strip"
      class="list-none m-0 p-0 flex flex-nowrap gap-[6px] overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible sm:snap-none items-stretch"
      data-testid="device-cards-strip"
      @scroll.passive="updateOverflow"
    >
      <template v-for="(d, i) in shown" :key="d.socketId">
      <DeviceCard
        :device="d"
        :is-me="isMe(d)"
        :cooling="cooling"
        :pairable="pairable"
        :now="now"
        class="flex-[0_0_146px] snap-start sm:flex-auto"
        @reroll="emit('reroll')"
      />
      <!-- 좁은 화면(sm 미만)에서만 2번째 카드로 보인다. 넓은 화면은 제목 줄의 버튼(ConnectionCard)이 대신해 격자 칸을 쓰지 않는다 -->
      <li v-if="inviteCard && i === 0" class="list-none m-0 flex flex-[0_0_146px] snap-start sm:hidden">
        <button type="button" :class="INVITE_TILE" data-testid="invite-phone-card" @click="emit('invite-phone')">
          <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" /><path d="M11 18h2" /></svg>
          <span class="font-bold text-xs">{{ t('roomQr.inviteCard') }}</span>
          <span class="text-[11px] opacity-80">{{ t('roomQr.inviteCardSub') }}</span>
        </button>
      </li>
      </template>
      <li v-if="overCapacity && !isOpen" class="list-none m-0 flex">
        <button type="button" :class="[TILE, 'w-full']" aria-expanded="false" data-testid="cards-more-tile" @click="expanded = true">{{ t('identity.moreDevices', { count: hiddenCount }) }}</button>
      </li>
      <li v-else-if="overCapacity && expanded && !forcedOpen" class="list-none m-0 flex">
        <button type="button" :class="[TILE, 'w-full']" aria-expanded="true" data-testid="cards-more-tile" @click="expanded = false">{{ t('text.collapse') }}</button>
      </li>
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
