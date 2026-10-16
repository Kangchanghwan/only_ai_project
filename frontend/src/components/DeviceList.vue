<script setup>
/**
 * 연결된 기기 목록 (표시 전용). 상단 시트/말풍선(ConnectedDevices)과 넓은 화면 왼쪽 패널(ConnectionCard)이
 * 같은 컴포넌트를 쓴다. 데이터는 부모가 내려주는 devices 하나뿐이다.
 */
import { computed, ref, watch, inject, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import DeviceRow from './DeviceRow.vue'
import { isMeDevice, sortDevices } from '../utils/devices'
import { PAIR_CONTEXT_KEY } from '../utils/pairContext'
import { isPrivateScope } from '../composables/useShareScope'

const { t } = useI18n()

const props = defineProps({
  devices: { type: Array, default: () => [] },
  mySocketId: { type: String, default: null },
  myIdentity: { type: Object, default: null },
  /** 'ip'(같은 네트워크) | 'global'(전체 공유) — 안내 문구 선택용 */
  scope: { type: String, default: 'ip' },
  /** 다시 뽑기를 다시 쓸 수 있게 되는 시각(epoch ms). 쿨다운 동안 버튼 비활성 */
  rerollAvailableAt: { type: Number, default: 0 },
  /** 넓은 화면 왼쪽 패널이면 true: 1:1 버튼을 짧은 "1:1"로, 아니면 "1:1 연결"로 표시 */
  wide: { type: Boolean, default: false },
  /** 전체 공유 방에만 있고 내 IP 방에는 없는 기기 (같은 네트워크 목록 아래 접힌 묶음) */
  otherNetworkDevices: { type: Array, default: () => [] }
})

const emit = defineEmits(['reroll'])

// 쿨다운 표시: 남은 시간 동안만 다시 뽑기 버튼을 막는다
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

// 1:1 연결 (RoomScreen이 제공. 없으면 버튼을 그리지 않는다)
const pair = inject(PAIR_CONTEXT_KEY, null)

// 다른 네트워크 기기 묶음 (같은 네트워크 목록에서만, 1:1 연결이 가능할 때만)
const otherOpen = ref(false)
const otherList = computed(() => (props.scope === 'ip' && pair ? sortDevices(props.otherNetworkDevices, props.mySocketId, props.myIdentity).filter((d) => !isMe(d)) : []))

const sorted = computed(() => sortDevices(props.devices, props.mySocketId, props.myIdentity))
const isMe = (d) => isMeDevice(d, props.mySocketId, props.myIdentity)

</script>

<template>
  <div data-testid="device-list">
    <ul class="flex flex-col gap-2">
      <DeviceRow
        v-for="device in sorted"
        :key="device.socketId"
        :device="device"
        :is-me="isMe(device)"
        :wide="wide"
        :cooling="cooling"
        @reroll="emit('reroll')"
      />
    </ul>
    <!-- 다른 네트워크 기기: 전체 공유 방에만 있는 기기. 탭 전환 없이 바로 1:1 -->
    <div v-if="otherList.length > 0" class="mt-3 pt-3 border-t border-border" data-testid="other-network-group">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 min-h-[44px] -my-2 text-sm font-semibold text-text-secondary"
        :aria-expanded="otherOpen"
        data-testid="other-network-toggle"
        @click="otherOpen = !otherOpen"
      >
        <span>{{ t('pair.otherNetworkGroup', { n: otherList.length }) }}</span>
        <span aria-hidden="true">{{ otherOpen ? '▴' : '▾' }}</span>
      </button>
      <ul v-if="otherOpen" class="mt-3 flex flex-col gap-2" data-testid="other-network-list">
        <DeviceRow v-for="device in otherList" :key="device.socketId" :device="device" :wide="wide" />
      </ul>
    </div>
    <!-- 동물+닉네임 함께 확인하라는 안내는 목록에만 둔다 -->
    <p v-if="!isPrivateScope(scope)" class="mt-3 text-xs text-text-secondary leading-relaxed" data-testid="device-list-note">
      {{ scope === 'global' ? t('identity.globalNotice') : t('identity.verifyHint') }}
      <template v-if="scope !== 'global'"><br />{{ t('identity.ipNotice') }}</template>
    </p>
  </div>
</template>
