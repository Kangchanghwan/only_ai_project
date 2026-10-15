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
import { countOtherDevices } from '../utils/devices'
import { PAIR_CONTEXT_KEY, PAIR_HINT_KEY } from '../utils/pairContext'
import { isPrivateScope } from '../composables/useShareScope'

const { t } = useI18n()

const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  rerollAvailableAt: { type: Number, default: 0 },
  scope: { type: String, default: 'ip' },
  wide: { type: Boolean, default: false }
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
          :reroll-available-at="rerollAvailableAt"
          @reroll="emit('reroll')"
        />
      </div>
    </div>
    <div v-if="wide && devices.length > 0" class="mt-3 pt-3 border-t border-border" data-testid="device-panel">
      <DeviceList
        :devices="devices"
        :my-socket-id="mySocketId"
        :my-identity="myIdentity"
        :scope="scope"
        :wide="true"
        :reroll-available-at="rerollAvailableAt"
        @reroll="emit('reroll')"
      />
    </div>
    <div
      v-if="!wide && pair && otherCount >= 1 && !hintClosed && !isPrivateScope(scope)"
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
