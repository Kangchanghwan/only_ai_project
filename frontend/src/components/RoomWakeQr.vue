<script setup>
/**
 * 방 탭의 "휴대폰에서 이 방 바로 열기" 접힌 줄.
 * - network 모드(같은 네트워크 탭): 다른 기기가 있어 빈 화면 QR이 숨은 동안 "QR로 휴대폰 연결하기" 접힌 줄을 보인다.
 *   QR은 빈 화면 QR과 같은 주소(꼬리표 없음)이고, 들어옴 알림은 하지 않는다 (기기 목록에 바로 보인다).
 * - 1:1 방: 상대가 오프라인이거나 3초 넘게 연결 중일 때 / 그룹 방: 나 말고 접속한 기기가 없을 때만 보인다.
 * - 누르면 방 꼬리표가 든 QR을 펼친다. 펼침은 이번 접속 동안 방마다 기억한다(새로고침하면 접힌다).
 * - 펼쳐 둔 사이 상대가 들어오면 줄을 닫고 "들어왔어요"를 한 번 알린다.
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { useNotification } from '../composables/useNotification'
import { trackEvent } from '../utils/analytics'
import { isGroupRoomId } from '../utils/groupRoom'
import { isValidIdentity, identityName } from '../utils/identity'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState'

const CONNECTING_GRACE_MS = 3000
const OPEN_FLAG = 'cs_room_qr_open_sent'
/** 이번 접속 동안 펼쳐 둔 방 */
const openedRooms = new Set()

const props = defineProps({
  /** 지금 방 (privateRooms의 레코드) */
  room: { type: Object, default: null },
  /** 같은 네트워크 탭용 (room 없이 항상 보인다. 보일지는 부모가 정한다) */
  network: { type: Boolean, default: false },
  /** 나 말고 이 방에 접속한 기기 (그룹 방). 목록이 아직 없으면 null */
  others: { type: Array, default: null },
  /** QR에 담을 주소 (방 꼬리표 포함). 없으면 고정 주소 */
  qrUrl: { type: String, default: '' },
})

const { t } = useI18n()
const notification = useNotification()

const isGroup = computed(() => isGroupRoomId(props.room?.roomId))
// 펼침을 기억하는 열쇠: 같은 네트워크 탭은 'ip', 방 탭은 방 ID
const key = computed(() => (props.network ? 'ip' : props.room?.roomId))
const status = computed(() => props.room?.status)

// 연결 중은 잠깐 지나가는 경우가 많아 3초 넘게 이어질 때만 보인다
const connectingLong = ref(false)
let connectingTimer = null
function clearConnecting() { if (connectingTimer) { clearTimeout(connectingTimer); connectingTimer = null } }
watch([() => props.room?.roomId, status], ([, st]) => {
  clearConnecting()
  connectingLong.value = false
  if (st === 'connecting') connectingTimer = setTimeout(() => { connectingTimer = null; connectingLong.value = true }, CONNECTING_GRACE_MS)
}, { immediate: true })
onBeforeUnmount(clearConnecting)

const show = computed(() => {
  if (props.network) return true
  if (!props.room?.roomId) return false
  if (isGroup.value) return Array.isArray(props.others) && props.others.length === 0
  return status.value === 'offline' || (status.value === 'connecting' && connectingLong.value)
})

const expanded = ref(openedRooms.has(key.value))
watch(key, (id) => { expanded.value = openedRooms.has(id) })

function flagGet() { try { return sessionStorage.getItem(OPEN_FLAG) === '1' } catch { return false } }
function flagSet() { try { sessionStorage.setItem(OPEN_FLAG, '1') } catch { /* 무시 */ } }
let openSent = false

function toggle() {
  const id = key.value
  expanded.value = !expanded.value
  if (expanded.value) {
    openedRooms.add(id)
    if (!openSent && !flagGet()) {
      openSent = true
      flagSet()
      try { trackEvent('room_qr_open', { room_kind: props.network ? 'ip' : isGroup.value ? 'group' : 'private' }) } catch { /* 측정 실패 무시 */ }
    }
  } else {
    openedRooms.delete(id)
  }
}

// QR 그림
const qrDataUrl = ref('')
const qrValue = ref('')
async function makeQr() {
  const value = props.qrUrl || EMPTY_STATE_QR_URL
  if (qrDataUrl.value && qrValue.value === value) return
  try {
    const url = await QRCode.toDataURL(value, { width: 140, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
    if ((props.qrUrl || EMPTY_STATE_QR_URL) !== value) return // 그사이 회차·방이 바뀌었다
    qrDataUrl.value = url
    qrValue.value = value
  } catch { /* QR 실패 시 안내 문구만 보인다 */ }
}
watch([() => show.value && expanded.value, () => props.qrUrl], ([on]) => { if (on) makeQr() }, { immediate: true })

// 펼쳐 둔 사이 상대가 들어왔다: 한 번 알린다 (방을 옮겨서 사라진 경우는 빼고)
function arrivedName() {
  if (isGroup.value) {
    const d = (props.others || []).find((x) => isValidIdentity(x?.identity))
    return d ? identityName(d.identity, t) : t('pair.unknownDevice')
  }
  return isValidIdentity(props.room?.peer?.identity) ? identityName(props.room.peer.identity, t) : t('pair.unknownDevice')
}
watch([() => props.room?.roomId, show], ([id, now], [prevId, before]) => {
  if (props.network || id !== prevId || !before || now || !expanded.value) return
  const arrived = isGroup.value ? (props.others || []).length > 0 : status.value === 'online'
  if (!arrived) return
  try { notification.showSuccess(t('roomQr.arrived', { name: arrivedName() })) } catch { /* 알림 실패 무시 */ }
})
</script>

<template>
  <div v-if="show" class="mb-4 border-t border-border" data-testid="room-wake-qr">
    <button
      type="button"
      class="w-full min-h-[44px] flex items-center gap-2 bg-transparent border-0 px-0 py-2 text-[11px] sm:text-xs font-semibold text-text-secondary cursor-pointer text-left"
      :aria-expanded="expanded"
      data-testid="room-wake-qr-toggle"
      @click="toggle"
    >
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
      </svg>
      <span class="flex-1">{{ network ? t('roomQr.toggleIp') : t('roomQr.toggle') }}</span>
      <svg class="w-3.5 h-3.5 shrink-0 transition-transform" :class="expanded ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div v-if="expanded" class="pb-3 flex flex-col items-center gap-1.5 text-center" data-testid="room-wake-qr-panel">
      <img v-if="qrDataUrl" :src="qrDataUrl" :data-qr-value="qrValue" width="140" height="140" alt="QR" class="block mb-1 rounded-none bg-white border border-border" data-testid="room-wake-qr-img" />
      <div v-else class="mb-1 w-[140px] h-[140px] rounded-none bg-tint border border-border" aria-hidden="true"></div>
      <p class="m-0 text-sm font-bold text-ink">{{ network ? t('room.emptyState.qrLine') : t('roomQr.line1') }}</p>
      <p class="m-0 text-xs text-text-secondary">{{ network ? t('roomQr.line2Ip') : t('roomQr.line2') }}</p>
    </div>
  </div>
</template>
