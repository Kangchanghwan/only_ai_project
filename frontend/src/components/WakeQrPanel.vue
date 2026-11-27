<script setup>
/**
 * 휴대폰으로 여는 QR 패널: QR 그림(140px) + 두 줄 안내. 방 초대 창(내 휴대폰 탭·1:1 시트)과 PhoneConnectSheet가 함께 쓴다.
 */
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { EMPTY_STATE_QR_URL } from '../utils/emptyState'

const props = defineProps({
  /** QR에 담을 주소. 없으면 고정 주소 */
  qrUrl: { type: String, default: '' },
  line1: { type: String, default: '' },
  line2: { type: String, default: '' }
})

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
watch(() => props.qrUrl, () => { makeQr() }, { immediate: true })
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 text-center" data-testid="wake-qr-panel">
    <img v-if="qrDataUrl" :src="qrDataUrl" :data-qr-value="qrValue" width="140" height="140" alt="QR" class="block mb-1 rounded-none bg-white border border-border" data-testid="wake-qr-img" />
    <div v-else class="mb-1 w-[140px] h-[140px] rounded-none bg-tint border border-border" aria-hidden="true"></div>
    <p class="m-0 text-sm font-bold text-ink">{{ line1 }}</p>
    <p class="m-0 text-xs text-text-secondary">{{ line2 }}</p>
  </div>
</template>
