<script setup>
/**
 * 1:1 연결 그림 확인 시트 (양쪽). 두 화면의 그림 4장이 같은지(순서까지) 확인한다.
 * 그림 아래에는 글자를 두지 않는다. 대체 텍스트는 이모지 문자 자체.
 */
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PairPeerAvatar from './PairPeerAvatar.vue'
import { sasImages } from '../utils/sasImages'
import { trapTab } from '../utils/focusTrap'

const { t } = useI18n()
const props = defineProps({
  /** pairing 세션 스냅샷 (state: accepted | keyed | waiting-peer-confirm) 또는 null */
  session: { type: Object, default: null },
  /** 내 기기 정보 { identity } (아바타용) */
  me: { type: Object, default: null }
})
const emit = defineEmits(['confirm', 'cancel'])

const root = ref(null)
const diffBtn = ref(null)
const images = computed(() => sasImages(props.session?.sas))
const waiting = computed(() => props.session?.state === 'waiting-peer-confirm')
const preparing = computed(() => props.session?.state === 'accepted' || !props.session?.sas)

watch(
  () => [props.session?.sessionId, props.session?.state],
  async () => {
    if (!props.session) return
    await nextTick()
    if (!root.value?.contains(document.activeElement)) (diffBtn.value || root.value?.querySelector('button'))?.focus()
  },
  { immediate: true, flush: 'post' }
)

function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('cancel'); return }
  trapTab(event, root.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="session"
      class="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      data-testid="pair-confirm-sheet"
    >
      <div
        ref="root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-confirm-title"
        class="w-full sm:max-w-md bg-surface text-text-primary rounded-t-2xl sm:rounded-2xl border border-border border-t-4 border-t-scope-private p-5 shadow-xl"
        @keydown="onKeydown"
      >
        <div class="flex items-center justify-center gap-3" aria-hidden="true">
          <PairPeerAvatar :device="me" />
          <span class="text-xl text-scope-private">⇄</span>
          <PairPeerAvatar :device="session.peer" />
        </div>
        <h2 id="pair-confirm-title" class="mt-3 text-base font-semibold text-center m-0">{{ t('pair.confirm.title') }}</h2>

        <div v-if="!preparing" class="mt-4 grid grid-cols-4 gap-2" data-testid="pair-sas">
          <div
            v-for="(img, i) in images"
            :key="i"
            class="aspect-square rounded-xl bg-background border border-border flex items-center justify-center p-2"
          >
            <img :src="img.src" :alt="img.emoji" draggable="false" class="w-full h-full object-contain select-none" data-testid="pair-sas-image" />
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-text-secondary text-center m-0" role="status">{{ t('pair.confirm.preparing') }}</p>

        <p v-if="waiting" class="mt-4 text-sm text-center text-scope-private font-semibold m-0" role="status" data-testid="pair-waiting">{{ t('pair.confirm.waiting') }}</p>

        <div class="mt-4 flex gap-2 justify-center">
          <template v-if="!preparing && !waiting">
            <button
              ref="diffBtn"
              type="button"
              class="flex-1 min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold"
              data-testid="pair-different"
              @click="emit('confirm', false)"
            >{{ t('pair.confirm.different') }}</button>
            <button
              type="button"
              class="flex-1 min-h-[44px] px-5 rounded-full bg-scope-private text-white text-sm font-semibold"
              data-testid="pair-same"
              @click="emit('confirm', true)"
            >{{ t('pair.confirm.same') }}</button>
          </template>
          <button
            v-else
            type="button"
            class="min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold"
            data-testid="pair-confirm-cancel"
            @click="emit('cancel')"
          >{{ t('notification.cancel') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
