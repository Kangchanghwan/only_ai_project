<script setup>
/**
 * 그림으로 들어가기 (새 기기). 칸 4개 + 그림판 24개 + 지우기 + 들어가기 + 상태 문구.
 * - 칸을 누르면 그 칸부터 다시 고른다. 그림판은 폰(360px)에서 6열, PC에서 8열, 타일 최소 44px.
 * - 틀린 뒤에는 칸을 비운다. 존재하지 않는 코드(notFound)도 틀린 것과 같은 문구라 코드 존재 여부가 드러나지 않는다.
 * 상태는 부모가 createCodeJoiner()의 ref를 내려 준다. 화면 연결 전(1단계)이라 어디에도 붙어 있지 않다.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { allPictures, pictureKey, pictureOf, CODE_LENGTH } from '../utils/pictureCode'
import { trackEvent } from '../utils/analytics'

const { t } = useI18n()
const props = defineProps({
  /** 'idle' | 'joining' | 'waiting' | 'joined' | 'wrong' | 'notFound' | 'declined' | 'timeout' | 'wait' | 'busy' | 'cancel' */
  status: { type: String, default: 'idle' },
  /** 여러 번 틀렸다는 경고 */
  warn: { type: Boolean, default: false },
  /** status === 'wait'일 때 기다려야 하는 초 */
  retryAfterSec: { type: Number, default: 0 }
})
const emit = defineEmits(['submit', 'cancel'])

const slots = ref([])
const pictures = allPictures()
const name = (index) => t(pictureKey(index))

const inProgress = computed(() => props.status === 'joining' || props.status === 'waiting')

// 잠시 기다리라는 응답: 남은 초를 센다
const waitStartedAt = ref(0)
const tick = ref(Date.now())
let timer = null
const waitLeft = computed(() =>
  props.status === 'wait' ? Math.max(0, props.retryAfterSec - Math.floor((tick.value - waitStartedAt.value) / 1000)) : 0
)
watch(
  () => props.status,
  (s) => {
    if (s === 'wrong' || s === 'notFound') slots.value = [] // 틀린 뒤엔 칸을 비운다
    if (s === 'wait') {
      waitStartedAt.value = Date.now()
      tick.value = waitStartedAt.value
      if (!timer) timer = setInterval(() => { tick.value = Date.now() }, 1000)
    } else if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
)
onMounted(() => trackEvent('code_enter_open'))
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const canSubmit = computed(() => slots.value.length === CODE_LENGTH && !inProgress.value && waitLeft.value === 0)

function pick(index) {
  if (inProgress.value || slots.value.length >= CODE_LENGTH) return
  slots.value = [...slots.value, index]
}
/** 칸을 누르면 그 칸부터 다시 */
function resetFrom(i) {
  if (inProgress.value) return
  slots.value = slots.value.slice(0, i)
}
function clearLast() {
  if (inProgress.value) return
  slots.value = slots.value.slice(0, -1)
}
function submit() {
  if (!canSubmit.value) return
  emit('submit', [...slots.value])
}

const message = computed(() => {
  switch (props.status) {
    case 'joining':
    case 'waiting': return t('code.waiting')
    case 'wrong':
    case 'notFound': return t('code.wrong')
    case 'wait': return t('code.wait', { sec: waitLeft.value })
    case 'declined': return t('code.declined')
    case 'timeout': return t('code.timeout')
    case 'busy': return t('code.busy')
    default: return ''
  }
})
const isError = computed(() => ['wrong', 'notFound', 'wait', 'declined', 'timeout', 'busy'].includes(props.status))
const showWarn = computed(() => props.warn && (props.status === 'wrong' || props.status === 'notFound'))
</script>

<template>
  <div data-testid="picture-code-enter">
    <p class="m-0 text-sm font-semibold text-text-primary text-center" data-testid="picture-enter-title">{{ t('code.enterTitle') }}</p>

    <div class="mt-3 grid grid-cols-4 gap-2" data-testid="picture-enter-slots">
      <button
        v-for="i in CODE_LENGTH"
        :key="i"
        type="button"
        class="aspect-square min-h-[44px] bg-background border rounded-xl p-2 flex items-center justify-center"
        :class="slots.length === i - 1 && !inProgress ? 'border-scope-private border-2' : 'border-border'"
        :aria-label="slots[i - 1] !== undefined ? t('code.slotLabel', { n: i, name: name(slots[i - 1]) }) : t('code.slotEmpty', { n: i })"
        :disabled="inProgress"
        data-testid="picture-enter-slot"
        @click="resetFrom(i - 1)"
      >
        <img
          v-if="slots[i - 1] !== undefined"
          :src="pictureOf(slots[i - 1]).src"
          alt=""
          draggable="false"
          class="w-full h-full object-contain select-none"
        />
      </button>
    </div>

    <div
      class="mt-3 grid grid-cols-6 sm:grid-cols-8 gap-2"
      role="group"
      :aria-label="t('code.pickerLabel')"
      data-testid="picture-enter-palette"
    >
      <button
        v-for="pic in pictures"
        :key="pic.index"
        type="button"
        class="aspect-square min-w-[44px] min-h-[44px] bg-background border border-border rounded-lg p-1.5 flex items-center justify-center disabled:opacity-50"
        :aria-label="name(pic.index)"
        :disabled="inProgress || slots.length >= CODE_LENGTH"
        :data-testid="`picture-tile-${pic.index}`"
        @click="pick(pic.index)"
      >
        <img :src="pic.src" alt="" draggable="false" class="w-full h-full object-contain select-none" />
      </button>
    </div>

    <p
      class="m-0 mt-3 min-h-[1.25rem] text-sm text-center"
      :class="isError ? 'text-red-600' : 'text-text-secondary'"
      role="status"
      aria-live="polite"
      data-testid="picture-enter-message"
    >{{ message }}</p>
    <p v-if="showWarn" class="m-0 mt-1 text-xs text-center text-text-secondary" data-testid="picture-enter-warn">{{ t('code.warn') }}</p>

    <div class="mt-3 flex gap-2 justify-end">
      <button
        v-if="inProgress"
        type="button"
        class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold"
        data-testid="picture-enter-cancel"
        @click="emit('cancel')"
      >{{ t('group.cancel') }}</button>
      <template v-else>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold disabled:opacity-50"
          :disabled="slots.length === 0"
          data-testid="picture-enter-clear"
          @click="clearLast"
        >{{ t('code.clear') }}</button>
        <button
          type="button"
          class="min-h-[44px] px-4 rounded-full bg-scope-private text-white text-sm font-semibold disabled:opacity-50"
          :disabled="!canSubmit"
          data-testid="picture-enter-confirm"
          @click="submit"
        >{{ t('code.confirm') }}</button>
      </template>
    </div>
  </div>
</template>
