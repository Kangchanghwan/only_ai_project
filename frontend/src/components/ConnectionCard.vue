<script setup>
/**
 * 연결 카드. "다른 기기 N대" + 접속 기기 카드(나 포함)가 항상 보인다.
 * 넓은 화면(wide): 같은 DeviceList를 왼쪽 패널에 항상 펼쳐 보여준다.
 * 어느 쪽이든 기기 데이터(devices)는 하나이고, 목록은 한 번에 한 곳에만 마운트된다(포커스/다이얼로그 중복 없음).
 */
import { computed, inject, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import DeviceCards from './DeviceCards.vue'
import DeviceList from './DeviceList.vue'
import DeviceRow from './DeviceRow.vue'
import { countOtherDevices, isMeDevice, sortDevices } from '../utils/devices'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { isPrivateScope } from '../composables/useShareScope'
import QRCode from 'qrcode'
import { trackEvent } from '../utils/analytics'
import { isMobileUa } from '../services/p2pProbe'
import { isIOS } from '../composables/usePWAInstall'
import { IOS_SHORTCUT_GUIDE, IOS_SHORTCUT_FILE_LINK } from '../utils/iosShortcut'

import { EMPTY_STATE_QR_URL } from '../utils/emptyState'
// 끝의 '/'는 필수: Safari(및 일부 Chrome)는 한글 최상위 도메인만 치면 검색어로 처리한다. '/'를 붙이면 주소로 연다.
const PING_ADDRESS = '핑.한국/'
const SITE_ADDRESS = 'clipboardapp.org'
// iOS는 PWA 공유 대상(Web Share Target)을 지원하지 않는다. 공유 메뉴로 보내려면 iOS 단축어(quick-send API)를 쓴다.
const VIEW_FLAG = 'cs_empty_state_view'
const JOINED_FLAG = 'cs_peer_joined'

const { t, locale } = useI18n()

const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  rerollAvailableAt: { type: Number, default: 0 },
  scope: { type: String, default: 'ip' },
  wide: { type: Boolean, default: false },
  /** 전체 공유 방에만 있는 기기 (같은 네트워크 목록 아래 "다른 네트워크 기기 n대") */
  otherNetworkDevices: { type: Array, default: () => [] }
})
const emit = defineEmits(['reroll', 'hint-copied', 'group-create', 'code-enter'])

const pair = inject(PAIR_CONTEXT_KEY, null)

const otherCount = computed(() => countOtherDevices(props.devices, props.mySocketId, props.myIdentity))

// ── 다른 기기가 없을 때 연결 안내 (같은 네트워크 방 한정) ──
const isMobile = isMobileUa()
const showEmpty = computed(() => props.scope === 'ip' && props.devices.length > 0 && otherCount.value === 0)
const isKo = computed(() => locale.value === 'ko')
const isIos = isIOS()
// 한국어는 설명이 있는 사용법 절로, 그 외 언어는 단축어 추가 링크로 바로 보낸다 (영어 사용법 페이지가 없음)
const iosShortcutHref = computed(() => (isKo.value ? IOS_SHORTCUT_GUIDE : IOS_SHORTCUT_FILE_LINK))
function onIosShortcutClick() {
  safeTrack('ios_shortcut_click', { locale: locale.value })
}
const qrDataUrl = ref('')
function flagGet(k) { try { return sessionStorage.getItem(k) === '1' } catch { return false } }
function flagSet(k) { try { sessionStorage.setItem(k, '1') } catch { /* 무시 */ } }
function safeTrack(name, params) { try { trackEvent(name, params) } catch { /* 측정 실패는 화면에 영향 없음 */ } }

let emptySince = null
let viewTimer = null
let viewSent = flagGet(VIEW_FLAG)
let sawEmpty = false
function clearViewTimer() { if (viewTimer) { clearTimeout(viewTimer); viewTimer = null } }

async function makeQr() {
  if (isMobile || qrDataUrl.value) return
  try {
    qrDataUrl.value = await QRCode.toDataURL(EMPTY_STATE_QR_URL, { width: 140, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
  } catch { /* QR 실패 시 텍스트 안내만 보인다 */ }
}

watch(showEmpty, (now, before) => {
  if (now) {
    sawEmpty = true
    if (emptySince === null) emptySince = Date.now()
    makeQr()
    if (!viewSent && !viewTimer) {
      viewTimer = setTimeout(() => {
        viewTimer = null
        if (viewSent || flagGet(VIEW_FLAG)) return
        viewSent = true
        flagSet(VIEW_FLAG)
        safeTrack('empty_state_view', { is_mobile: isMobile, locale: locale.value })
      }, 3000)
    }
  } else {
    clearViewTimer()
  }
}, { immediate: true })

// 같은 네트워크 방에서 다른 기기가 0 → 1 이상이 된 첫 순간 (처음부터 있었으면 보내지 않는다)
watch(otherCount, (n, prev) => {
  if (props.scope !== 'ip') return
  if (prev === 0 && n >= 1 && sawEmpty && emptySince !== null && !flagGet(JOINED_FLAG)) {
    flagSet(JOINED_FLAG)
    safeTrack('peer_joined', {
      wait_sec: Math.max(0, Math.round((Date.now() - emptySince) / 1000)),
      had_empty_state: viewSent,
      is_mobile: isMobile
    })
  }
})
onBeforeUnmount(clearViewTimer)

async function copyHint(target) {
  const text = target === 'ping' ? PING_ADDRESS : SITE_ADDRESS
  safeTrack('empty_hint_copy', { target: target === 'ping' ? 'ping' : 'clipboardapp', is_mobile: isMobile })
  try {
    await navigator.clipboard.writeText(text)
    emit('hint-copied', text)
  } catch { /* 복사 실패는 무시 */ }
}

// 수락 대기 중인 기기는 카드 아래에서 그림 확인 패널(DeviceRow)을 펼친다
const others = computed(() => props.devices.filter((d) => !isMeDevice(d, props.mySocketId, props.myIdentity)))
const stateOf = (d) => pair?.states?.value?.[d.socketId] || null
const narrowPair = computed(() => !props.wide && !!pair && !isPrivateScope(props.scope))
const pendingDevices = computed(() => (narrowPair.value ? others.value.filter((d) => stateOf(d)?.state === 'pending') : []))

// 다른 네트워크 기기: 카드 아래 접힌 묶음 (같은 네트워크 방에서만, 1:1 연결이 가능할 때만)
const otherOpenManual = ref(false)
const otherList = computed(() => (!props.wide && props.scope === 'ip' && pair
  ? sortDevices(props.otherNetworkDevices, props.mySocketId, props.myIdentity).filter((d) => !isMeDevice(d, props.mySocketId, props.myIdentity))
  : []))
// 내가 보낸 1:1 요청이 진행 중인 기기가 묶음 안에 있으면 접어 둘 수 없다 (그림 확인 패널이 가려지지 않게)
const otherBusy = computed(() => otherList.value.some((d) => { const st = stateOf(d)?.state; return st === 'pending' || st === 'connecting' }))
const otherOpen = computed(() => otherOpenManual.value || otherBusy.value)
</script>

<template>
  <div role="group" class="connection-card bg-transparent border-0 rounded-none p-0 min-w-0" :aria-label="t('room.connectedDevices')" data-testid="connection-card">
    <div class="flex items-baseline gap-x-3 gap-y-1 flex-wrap min-w-0 mb-2" data-testid="cards-header">
      <p class="text-sm text-text-secondary m-0 min-w-0" data-testid="other-count" aria-live="polite">
        <span class="whitespace-nowrap text-[15px] sm:text-[17px] font-extrabold tracking-[-0.02em] text-ink">{{ t('room.otherDevices', { count: otherCount }) }}</span>
        <span v-if="otherCount === 0"> · {{ t('room.waiting') }}</span>
      </p>
      <p v-if="scope === 'ip'" class="m-0 min-w-0 text-[11px] sm:text-xs text-text-secondary" data-testid="ip-notice">{{ t('identity.ipNotice') }}</p>
    </div>
    <DeviceCards
      v-if="!wide && devices.length > 0"
      :devices="devices"
      :my-socket-id="mySocketId"
      :my-identity="myIdentity"
      :scope="scope"
      :reroll-available-at="rerollAvailableAt"
      @reroll="emit('reroll')"
    />
    <!-- 서버 연결 전 자리표시: 실제 카드 줄과 같은 높이(85px)로 자리를 잡아 아래 입력 상자가 밀리지 않게 한다 -->
    <div v-else-if="!wide" class="relative min-w-0" aria-hidden="true" data-testid="device-cards-placeholder">
      <ul class="list-none m-0 p-0 flex flex-nowrap gap-[6px] overflow-hidden sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] items-stretch">
        <li class="flex-[0_0_146px] sm:flex-auto h-[85px] border border-border bg-tint list-none m-0"></li>
      </ul>
    </div>
    <div v-if="showEmpty" class="mt-3 pt-3 border-t border-border flex flex-col items-center gap-2 text-center" data-testid="empty-state">
      <template v-if="!isMobile">
        <img v-if="qrDataUrl" :src="qrDataUrl" :data-qr-value="EMPTY_STATE_QR_URL" width="140" height="140" alt="QR" class="rounded-none bg-white" data-testid="empty-state-qr" />
        <p class="m-0 text-sm text-text-primary" data-testid="empty-state-line1">{{ t('room.emptyState.qrLine') }}</p>
        <i18n-t v-if="isKo" keypath="room.emptyState.pingLine" tag="p" class="m-0 text-xs text-text-secondary" data-testid="empty-state-ping">
          <template #ping>
            <button type="button" class="font-bold text-text-primary bg-transparent border-0 p-0 cursor-pointer" data-testid="empty-state-copy-ping" @click="copyHint('ping')">{{ PING_ADDRESS }}</button>
          </template>
        </i18n-t>
      </template>
      <i18n-t v-else keypath="room.emptyState.mobile" tag="p" class="m-0 text-sm text-text-secondary" data-testid="empty-state-mobile">
        <template #site>
          <button type="button" class="font-bold text-text-primary bg-transparent border-0 p-0 cursor-pointer" data-testid="empty-state-copy-site" @click="copyHint('clipboardapp')">{{ SITE_ADDRESS }}</button>
        </template>
        <template #ping>
          <button type="button" class="font-bold text-text-primary bg-transparent border-0 p-0 cursor-pointer" data-testid="empty-state-copy-ping" @click="copyHint('ping')">{{ PING_ADDRESS }}</button>
        </template>
      </i18n-t>
      <a
        v-if="isIos"
        :href="iosShortcutHref"
        class="text-xs text-text-secondary underline underline-offset-2"
        data-testid="empty-state-ios-shortcut"
        @click="onIosShortcutClick"
      >{{ t('room.emptyState.iosShortcut') }}</a>
      <!-- 다른 네트워크 기기와 연결하려면 그룹 방 (그룹 방 기능이 켜져 있을 때만) -->
      <button
        v-if="pair"
        type="button"
        class="w-full min-h-[44px] px-3 rounded-none border border-scope-private text-scope-private text-xs font-semibold leading-snug"
        data-testid="empty-state-group-create"
        @click="emit('group-create')"
      >{{ t('group.emptyCta') }}</button>
      <!-- 방에 있는 기기의 그림 4개를 눌러 들어오기 -->
      <button
        v-if="pair"
        type="button"
        class="w-full min-h-[44px] px-3 rounded-none border-2 border-ink text-ink hover:bg-tint text-xs font-bold leading-snug"
        data-testid="empty-state-code-enter"
        @click="emit('code-enter')"
      >{{ t('code.enter') }}</button>
    </div>
    <ul v-if="pendingDevices.length > 0" class="mt-3 pt-3 border-t border-border flex flex-col gap-2 list-none p-0 m-0" data-testid="pair-pending-rows">
      <DeviceRow v-for="d in pendingDevices" :key="d.socketId" :device="d" />
    </ul>
    <div v-if="otherList.length > 0" class="mt-3 pt-3 border-t border-border" data-testid="other-network-group">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 min-h-[44px] -my-2 text-sm font-semibold text-text-secondary"
        :aria-expanded="otherOpen"
        data-testid="other-network-toggle"
        @click="otherOpenManual = !otherOpenManual"
      >
        <span>{{ t('pair.otherNetworkGroup', { n: otherList.length }) }}</span>
        <span aria-hidden="true">{{ otherOpen ? '▴' : '▾' }}</span>
      </button>
      <ul v-if="otherOpen" class="mt-3 flex flex-col gap-2 list-none p-0" data-testid="other-network-list">
        <DeviceRow v-for="device in otherList" :key="device.socketId" :device="device" />
      </ul>
    </div>
    <div v-if="wide && devices.length > 0" class="mt-3 pt-3 border-t border-border" data-testid="device-panel">
      <DeviceList
        :devices="devices"
        :my-socket-id="mySocketId"
        :my-identity="myIdentity"
        :scope="scope"
        :wide="true"
        :other-network-devices="otherNetworkDevices"
        :reroll-available-at="rerollAvailableAt"
        @reroll="emit('reroll')"
      />
    </div>
  </div>
</template>
