<script setup>
/**
 * 그림 코드 보여 주기 (방에 있는 기기). 큰 그림 타일 4개 + 이름 줄 + 남은 시간 + "새 코드" + 승인 요청 카드.
 * 상태는 부모가 createCodeHost()의 ref를 내려 준다. 이 컴포넌트는 화면 연결 전(1단계)이라 어디에도 붙어 있지 않다.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { pictureOf, pictureKey } from '../utils/pictureCode'
import { isValidIdentity, identityName, deviceAndBrowser } from '../utils/identity'

const { t } = useI18n()
const props = defineProps({
  /** 그림 인덱스 4개 또는 null(여는 중) */
  code: { type: Array, default: null },
  /** 코드 만료 시각 (epoch ms) */
  expiresAt: { type: Number, default: 0 },
  /** 맨 앞 승인 요청 { sessionId, from } 또는 null */
  request: { type: Object, default: null },
  /** 승인 대기 중인 요청 수 */
  requestCount: { type: Number, default: 0 }
})
const emit = defineEmits(['renew', 'decide'])

const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const tiles = computed(() =>
  (props.code || []).map((index) => ({ index, ...pictureOf(index), name: t(pictureKey(index)) }))
)
const namesLine = computed(() => tiles.value.map((x) => x.name).join(' · '))
const leftSec = computed(() => Math.max(0, Math.ceil((props.expiresAt - now.value) / 1000)))
const leftText = computed(() => t('code.expiresIn', { min: Math.floor(leftSec.value / 60), sec: leftSec.value % 60 }))

const from = computed(() => props.request?.from || null)
const reqName = computed(() => (from.value && isValidIdentity(from.value.identity) ? identityName(from.value.identity, t) : t('pair.unknownDevice')))
const reqDevice = computed(() => (from.value ? deviceAndBrowser(from.value, t) : ''))
</script>

<template>
  <div data-testid="picture-code-show">
    <p class="m-0 text-sm font-semibold text-text-primary text-center" data-testid="picture-code-title">{{ t('code.showTitle') }}</p>
    <div v-if="tiles.length === 4" class="mt-3 grid grid-cols-4 gap-2" data-testid="picture-code-tiles">
      <div
        v-for="(tile, i) in tiles"
        :key="i"
        role="img"
        :aria-label="tile.name"
        class="aspect-square bg-background border border-border rounded-xl p-2 flex items-center justify-center"
        data-testid="picture-code-tile"
      >
        <img :src="tile.src" alt="" draggable="false" class="w-full h-full object-contain select-none" />
      </div>
    </div>
    <div v-else class="mt-3 grid grid-cols-4 gap-2" aria-hidden="true" data-testid="picture-code-skeleton">
      <div v-for="i in 4" :key="i" class="aspect-square bg-background border border-border rounded-xl animate-pulse"></div>
    </div>
    <p class="m-0 mt-3 text-base font-semibold text-center text-text-primary" data-testid="picture-code-names">{{ namesLine }}</p>
    <div class="mt-2 flex items-center justify-between gap-3">
      <span class="text-xs text-text-secondary" role="timer" data-testid="picture-code-left">{{ code ? leftText : '' }}</span>
      <button
        type="button"
        class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
        data-testid="picture-code-renew"
        @click="emit('renew')"
      >{{ t('code.renew') }}</button>
    </div>

    <div
      v-if="request"
      role="alertdialog"
      aria-live="polite"
      :aria-label="t('code.requestTitle', { name: reqName })"
      class="mt-4 rounded-xl border border-border border-t-4 border-t-scope-private bg-background p-4"
      data-testid="picture-code-request"
    >
      <div class="flex items-center gap-3 min-w-0">
        <PairPeerAvatar :device="from" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate" data-testid="picture-code-request-title">{{ t('code.requestTitle', { name: reqName }) }}</div>
          <div class="text-xs text-text-secondary truncate" data-testid="picture-code-request-device">{{ t('code.requestDevice', { device: reqDevice }) }}</div>
        </div>
      </div>
      <div class="mt-3 flex gap-2 justify-end">
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
          data-testid="picture-code-reject"
          @click="emit('decide', false)"
        >{{ t('code.reject') }}</button>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold"
          data-testid="picture-code-approve"
          @click="emit('decide', true)"
        >{{ t('code.approve') }}</button>
      </div>
    </div>
  </div>
</template>
