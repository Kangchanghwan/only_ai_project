<script setup>
/**
 * 연결 카드. 좁은 화면: "다른 기기 N대" + 아바타 펼침(ConnectedDevices 시트/말풍선). 내 정보(나 배지·다시 뽑기)는 펼친 목록에서만 보인다.
 * 넓은 화면(wide): 같은 DeviceList를 왼쪽 패널에 항상 펼쳐 보여준다.
 * 어느 쪽이든 기기 데이터(devices)는 하나이고, 목록은 한 번에 한 곳에만 마운트된다(포커스/다이얼로그 중복 없음).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConnectedDevices from './ConnectedDevices.vue'
import DeviceList from './DeviceList.vue'
import { countOtherDevices } from '../utils/devices'

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
        :reroll-available-at="rerollAvailableAt"
        @reroll="emit('reroll')"
      />
    </div>
  </div>
</template>
