<script setup>
/**
 * 연결 카드. 좁은 화면: "다른 기기 N대" + 아바타 펼침(ConnectedDevices 시트/말풍선). 내 정보(나 배지·다시 뽑기)는 펼친 목록에서만 보인다.
 * 넓은 화면(wide): 같은 DeviceList를 왼쪽 패널에 항상 펼쳐 보여준다.
 * 어느 쪽이든 기기 데이터(devices)는 하나이고, 목록은 한 번에 한 곳에만 마운트된다(포커스/다이얼로그 중복 없음).
 */
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConnectedDevices from './ConnectedDevices.vue'
import DeviceList from './DeviceList.vue'
import DeviceRow from './DeviceRow.vue'
import { countOtherDevices, isMeDevice } from '../utils/devices'
import { isValidIdentity, identityName } from '../utils/identity'
import { PAIR_CONTEXT_KEY, PAIR_HINT_KEY } from '../utils/pairContext'
import { isPrivateScope } from '../composables/useShareScope'

const { t } = useI18n()

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
const emit = defineEmits(['reroll'])

// 폰 첫 안내: 다른 기기가 1대 이상일 때 한 줄, 닫으면 다시 보이지 않는다
const pair = inject(PAIR_CONTEXT_KEY, null)
function hintDismissed() {
  try { return localStorage.getItem(PAIR_HINT_KEY) === '1' } catch { return false }
}
const hintClosed = ref(hintDismissed())
function closeHint() {
  hintClosed.value = true
  try { localStorage.setItem(PAIR_HINT_KEY, '1') } catch { /* 저장 실패는 무시 */ }
}

const otherCount = computed(() => countOtherDevices(props.devices, props.mySocketId, props.myIdentity))

// 폰 바로가기: 다른 기기가 정확히 1대이고 아직 연결 시도/연결이 없으면 시트를 열지 않고 바로 "○○와 1:1".
// 진행 중(수락 대기)인 기기는 시트가 닫혀 있어도 같은 자리에서 그림 확인을 할 수 있게 행으로 보여 준다.
const others = computed(() => props.devices.filter((d) => !isMeDevice(d, props.mySocketId, props.myIdentity)))
const stateOf = (d) => pair?.states?.value?.[d.socketId] || null
const narrowPair = computed(() => !props.wide && !!pair && !isPrivateScope(props.scope))
const shortcutDevice = computed(() => (narrowPair.value && others.value.length === 1 && !stateOf(others.value[0]) ? others.value[0] : null))
const pendingDevices = computed(() => (narrowPair.value ? others.value.filter((d) => stateOf(d)?.state === 'pending') : []))
const shortcutName = computed(() => {
  const d = shortcutDevice.value
  if (!d) return ''
  return isValidIdentity(d.identity) ? identityName(d.identity, t) : `${d.browser} · ${d.os}`
})
</script>

<template>
  <div role="group" class="connection-card bg-surface border border-border rounded-xl p-3 min-w-0" :aria-label="t('room.connectedDevices')" data-testid="connection-card">
    <div class="flex items-center justify-between gap-2 flex-wrap min-w-0">
      <div class="flex items-center gap-2 min-w-0" :class="wide ? 'w-full' : ''">
        <p class="text-sm text-text-secondary m-0 min-w-0" data-testid="other-count" aria-live="polite">
          <span class="font-semibold text-text-primary">{{ t('room.otherDevices', { count: otherCount }) }}</span>
          <span v-if="otherCount === 0"> · {{ t('room.waiting') }}</span>
        </p>
        <ConnectedDevices
          v-if="!wide && devices.length > 0"
          :devices="devices"
          :my-socket-id="mySocketId"
          :my-identity="myIdentity"
          :scope="scope"
          :other-network-devices="otherNetworkDevices"
          :reroll-available-at="rerollAvailableAt"
          @reroll="emit('reroll')"
        />
      </div>
    </div>
    <ul v-if="pendingDevices.length > 0" class="mt-3 pt-3 border-t border-border flex flex-col gap-2 list-none p-0 m-0" data-testid="pair-pending-rows">
      <DeviceRow v-for="d in pendingDevices" :key="d.socketId" :device="d" />
    </ul>
    <div v-if="shortcutDevice" class="mt-3" data-testid="pair-shortcut-wrap">
      <button
        type="button"
        class="w-full min-h-[44px] px-4 rounded-full border border-scope-private text-scope-private text-sm font-semibold truncate"
        data-testid="pair-shortcut"
        @click="pair.invite(shortcutDevice)"
      >{{ t('pair.shortcut', { name: shortcutName }) }}</button>
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
    <div
      v-if="!wide && pair && otherCount >= 1 && !hintClosed && !isPrivateScope(scope) && !shortcutDevice"
      class="mt-2 pt-2 border-t border-border flex items-center gap-2 text-xs text-text-secondary"
      data-testid="pair-hint"
    >
      <p class="m-0 flex-1 min-w-0 leading-relaxed">{{ t('pair.hint') }}</p>
      <button
        type="button"
        class="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-text-secondary"
        :aria-label="t('pair.hintClose')"
        data-testid="pair-hint-close"
        @click="closeHint"
      ><span aria-hidden="true">✕</span></button>
    </div>
  </div>
</template>
