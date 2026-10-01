<script setup>
/** 전체 공유로 처음 보내기 전 확인. 공개 범위에만 동의하며 개별 기기 수신 선택이 아니다. */
import { watch, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps({ isOpen: { type: Boolean, default: false } })
const emit = defineEmits(['confirm', 'cancel'])
const cancelBtn = ref(null)

watch(() => props.isOpen, async (open) => {
  if (open) {
    await nextTick()
    cancelBtn.value?.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="public-confirm-title"
      aria-describedby="public-confirm-desc"
      data-testid="public-share-confirm"
      @keydown.esc="emit('cancel')"
      @click.self="emit('cancel')"
    >
      <div class="w-full max-w-sm bg-surface text-text-primary rounded-2xl border border-border p-5 shadow-xl">
        <h2 id="public-confirm-title" class="text-base font-semibold m-0">{{ t('publicConfirm.title') }}</h2>
        <p id="public-confirm-desc" class="mt-2 text-sm text-text-secondary leading-relaxed">{{ t('publicConfirm.body') }}</p>
        <div class="mt-4 flex gap-2 justify-end flex-wrap">
          <button ref="cancelBtn" type="button" class="min-h-[44px] px-5 rounded-full border border-border text-sm font-semibold" data-testid="public-confirm-cancel" @click="emit('cancel')">{{ t('notification.cancel') }}</button>
          <button type="button" class="min-h-[44px] px-5 rounded-full bg-scope-global text-white text-sm font-semibold" data-testid="public-confirm-accept" @click="emit('confirm')">{{ t('publicConfirm.confirm') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
