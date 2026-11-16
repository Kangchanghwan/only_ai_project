<script setup>
import { roomDisplayName } from '../utils/roomDisplayName'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { privateRoomIdOfScope, scopeForPrivateRoom } from '../composables/useShareScope'
import { isValidIdentity, identityName } from '../utils/identity'
import { isGroupRoomId } from '../utils/groupRoom'
import { useLockState } from '../composables/useLockState'

const { t } = useI18n()
const lockState = useLockState()

const props = defineProps({
  scope: {
    type: String,
    default: 'ip'
  },
  /** 1:1 비공개 방 목록 [{roomId, peer}]. 비어 있으면 기존 2탭 그대로 */
  privateRooms: {
    type: Array,
    default: () => []
  },
  /** 방금 연결된 방 id: 해당 탭을 한 번 강조한다 */
  highlightRoomId: {
    type: String,
    default: null
  },
  /** 탭 줄 끝에 "＋ 방"(그룹 방 만들기) 버튼을 보인다 */
  groupCreate: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'group-create'])

const activeRoomId = computed(() => privateRoomIdOfScope(props.scope))

const peerName = (room) => (isValidIdentity(room.peer?.identity) ? identityName(room.peer.identity, t) : t('pair.unknownDevice'))
// 그룹 방(prv-g-…)은 같은 목록에 넣되 이름과 아이콘만 다르다
const isGroup = (room) => isGroupRoomId(room?.roomId)
const roomLabel = (room) => roomDisplayName(props.privateRooms, room.roomId, t('group.unnamed'), peerName)

const bar = ref(null)

// roving tabindex: 고른 탭만 Tab 키로 닿는다. 고른 탭이 목록에 없으면(예: 사라진 방) 첫 탭이 대신 받는다
const selectedIndex = computed(() => {
  if (props.scope === 'ip') return 0
  if (props.scope === 'global') return 1
  const i = props.privateRooms.findIndex((r) => r.roomId === activeRoomId.value)
  return i < 0 ? 0 : i + 2
})
const tabIndexOf = (i) => (i === selectedIndex.value ? 0 : -1)

function onTabKeydown(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const els = Array.from(bar.value?.querySelectorAll('[role="tab"]') ?? [])
  if (!els.length) return
  const cur = els.indexOf(e.target.closest?.('[role="tab"]'))
  if (cur < 0) return
  const rtl = typeof document !== 'undefined' && (document.documentElement.dir === 'rtl' || getComputedStyle(bar.value).direction === 'rtl')
  let next
  if (e.key === 'ArrowRight') next = cur + (rtl ? -1 : 1)
  else if (e.key === 'ArrowLeft') next = cur + (rtl ? 1 : -1)
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = els.length - 1
  else return
  e.preventDefault()
  next = (next + els.length) % els.length
  const el = els[next]
  el.focus()
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  el.click()
}
/** 지금 고른 탭이 가로 스크롤 밖에 있으면 보이는 자리로 */
async function revealActive() {
  await nextTick()
  const el = bar.value?.querySelector('[aria-selected="true"]')
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
onMounted(revealActive)

// 가로 넘침 표시: 오른쪽에 못 보이는 탭 수(+N)와 양쪽 가장자리 페이드
const overflowRight = ref(false)
const scrolledAway = ref(false)
const hiddenRight = ref(0)
function updateOverflow() {
  const el = bar.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  scrolledAway.value = el.scrollLeft > 1
  overflowRight.value = max > 1 && el.scrollLeft < max - 1
  if (!overflowRight.value) { hiddenRight.value = 0; return }
  const edge = el.getBoundingClientRect().right
  let n = 0
  for (const tab of el.querySelectorAll('[role="tab"]')) {
    if (tab.getBoundingClientRect().right > edge + 1) n++
  }
  hiddenRight.value = n
}
function showNextHidden() {
  const el = bar.value
  if (!el) return
  const edge = el.getBoundingClientRect().right
  const next = Array.from(el.querySelectorAll('[role="tab"]')).find((tab) => tab.getBoundingClientRect().right > edge + 1)
  if (next && typeof next.scrollIntoView === 'function') next.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' })
  else if (typeof el.scrollBy === 'function') el.scrollBy({ left: el.clientWidth * 0.8, behavior: 'smooth' })
}
function showPrev() {
  const el = bar.value
  if (el && typeof el.scrollBy === 'function') el.scrollBy({ left: -el.clientWidth * 0.8, behavior: 'smooth' })
}
let resizeObserver = null
onMounted(() => {
  updateOverflow()
  if (typeof ResizeObserver !== 'undefined' && bar.value) {
    resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(bar.value)
  }
})
onBeforeUnmount(() => { resizeObserver?.disconnect(); resizeObserver = null })
watch(() => [props.scope, props.privateRooms.length], async () => { await revealActive(); updateOverflow() })

const TAB = 'shrink-0 min-h-[44px] max-w-[15rem] inline-flex items-center gap-2 px-3 rounded-none bg-transparent border-0 border-b-2 whitespace-nowrap text-sm hover:bg-tint cursor-pointer'
const tabClass = (active) => [TAB, active ? 'text-ink font-extrabold border-ink' : 'text-text-secondary font-semibold border-transparent']
</script>

<template>
  <div class="flex items-stretch min-w-0 w-full" data-testid="scope-tabs">
    <div class="relative flex min-w-0 flex-1 sm:flex-none">
    <div
      ref="bar"
      role="tablist"
      :aria-label="t('shareScope.label')"
      class="flex flex-nowrap min-w-0 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="room-tablist"
      @scroll.passive="updateOverflow"
      @keydown="onTabKeydown"
    >
      <button
        type="button"
        role="tab"
        :class="tabClass(scope === 'ip')"
        :aria-selected="scope === 'ip'"
        :tabindex="tabIndexOf(0)"
        :title="t('shareScope.ipDescription')"
        data-testid="scope-option-ip"
        @click="emit('select', 'ip')"
      ><svg v-if="lockState.isLocked('ip')" class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="scope-lock-ip"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><span v-if="lockState.isLocked('ip')" class="sr-only">{{ t('lock.chipOn') }}</span><span class="truncate">{{ t('shareScope.ip') }}</span></button>
      <button
        type="button"
        role="tab"
        :class="tabClass(scope === 'global')"
        :aria-selected="scope === 'global'"
        :tabindex="tabIndexOf(1)"
        :title="t('shareScope.globalDescription')"
        data-testid="scope-option-global"
        @click="emit('select', 'global')"
      >
        <span class="shrink-0 w-2 h-2 bg-scope-global" aria-hidden="true" data-testid="scope-mark-global"></span>
        <svg v-if="lockState.isLocked('global')" class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="scope-lock-global"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><span v-if="lockState.isLocked('global')" class="sr-only">{{ t('lock.chipOn') }}</span>
        <span class="truncate">{{ t('shareScope.global') }}</span>
      </button>
      <button
        v-for="(room, ri) in privateRooms"
        :key="room.roomId"
        type="button"
        role="tab"
        :class="tabClass(activeRoomId === room.roomId)"
        :aria-selected="activeRoomId === room.roomId"
        :tabindex="tabIndexOf(ri + 2)"
        :title="roomLabel(room)"
        data-testid="private-tab-option"
        @click="emit('select', scopeForPrivateRoom(room.roomId))"
      >
        <span v-if="!isGroup(room)" class="shrink-0 w-2 h-2 bg-scope-private" aria-hidden="true" data-testid="scope-mark-private"></span>
        <svg v-if="isGroup(room)" class="shrink-0 text-scope-private" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-testid="group-tab-icon">
          <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8" />
        </svg>
        <PairPeerAvatar v-else :device="room.peer" size="sm" />
        <span class="truncate" :data-testid="isGroup(room) ? 'group-tab-name' : undefined">{{ roomLabel(room) }}</span>
        <span v-if="highlightRoomId === room.roomId" class="shrink-0 w-2 h-2 rounded-full bg-scope-private" data-testid="tab-highlight" aria-hidden="true"></span>
      </button>
    </div>
      <span
        v-if="scrolledAway"
        class="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface to-transparent"
        aria-hidden="true"
        data-testid="tabs-fade-left"
      ></span>
      <span
        v-if="overflowRight"
        class="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent"
        aria-hidden="true"
        data-testid="tabs-fade-right"
      ></span>
    </div>
    <button
      v-if="scrolledAway"
      type="button"
      class="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-none bg-surface border border-border text-ink cursor-pointer hover:bg-tint"
      :aria-label="t('shareScope.label')"
      data-testid="tabs-more-left"
      @click="showPrev"
    ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <button
      v-if="overflowRight && hiddenRight > 0"
      type="button"
      class="shrink-0 min-h-[44px] min-w-[44px] px-1 inline-flex items-center justify-center rounded-none bg-surface border border-border text-ink font-extrabold text-sm cursor-pointer hover:bg-tint whitespace-nowrap"
      :aria-label="t('room.moreRooms', { n: hiddenRight })"
      :title="t('room.moreRooms', { n: hiddenRight })"
      data-testid="tabs-more-right"
      @click="showNextHidden"
    ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span aria-hidden="true">+{{ hiddenRight }}</span></button>
    <button
      v-if="groupCreate"
      type="button"
      class="shrink-0 min-h-[44px] inline-flex items-center gap-1 px-3 rounded-none bg-transparent border-0 text-sm font-semibold text-text-primary hover:bg-tint cursor-pointer whitespace-nowrap"
      :aria-label="t('group.create')"
      :title="t('group.create')"
      data-testid="group-create"
      @click="emit('group-create')"
    >
      <span aria-hidden="true">＋</span>
      <span aria-hidden="true">{{ t('group.createShort') }}</span>
    </button>
  </div>
</template>
