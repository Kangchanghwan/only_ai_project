<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScopeAccent } from '../composables/useScopeAccent'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  fileCount: {
    type: Number,
    default: 0
  },
  hasText: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const { t } = useI18n()

const localScope = ref('ip')

// 시트가 다시 열릴 때마다 선택을 항상 안전한 기본값(ip)으로 되돌린다.
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    localScope.value = 'ip'
  }
})

const {
  border: ipBorder,
  bgSoft10: ipBgSoft10,
  bg: ipBg
} = useScopeAccent(() => 'ip')

const {
  border: globalBorder,
  bgSoft10: globalBgSoft10,
  bg: globalBg
} = useScopeAccent(() => 'global')

const title = computed(() => {
  if (props.fileCount > 0 && props.hasText) {
    return t('shareTargetConfirm.titleFilesAndText', { count: props.fileCount })
  }
  if (props.fileCount > 0) {
    return t('shareTargetConfirm.titleFiles', { count: props.fileCount })
  }
  return t('shareTargetConfirm.titleText')
})

function handleConfirm() {
  emit('confirm', localScope.value)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="isOpen"
        class="share-confirm-sheet fixed inset-0 bg-black/70 z-50 flex items-end"
        @click="handleCancel"
      >
        <div
          class="w-full bg-surface rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          @click.stop
        >
          <div class="mx-auto mb-3 h-1 w-8 rounded-full bg-border"></div>
          <p class="mb-3 text-sm font-semibold text-text-primary">{{ title }}</p>

          <div class="mb-4 space-y-2">
            <button
              type="button"
              class="w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
              :class="localScope === 'ip' ? [ipBorder, ipBgSoft10] : 'border-border'"
              @click="localScope = 'ip'"
            >
              <span class="block text-sm font-medium text-text-primary">{{ t('shareScope.ip') }}</span>
              <span class="block text-xs text-text-secondary">{{ t('shareScope.ipDescription') }}</span>
            </button>
            <button
              type="button"
              class="w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
              :class="localScope === 'global' ? [globalBorder, globalBgSoft10] : 'border-border'"
              @click="localScope = 'global'"
            >
              <span class="block text-sm font-medium text-text-primary">{{ t('shareScope.global') }}</span>
              <span class="block text-xs text-text-secondary">{{ t('shareScope.globalDescription') }}</span>
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg bg-background py-2.5 text-sm font-semibold text-text-secondary"
              @click="handleCancel"
            >
              {{ t('shareTargetConfirm.cancel') }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white"
              :class="localScope === 'global' ? globalBg : ipBg"
              @click="handleConfirm"
            >
              {{ t('shareTargetConfirm.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-active > div,
.sheet-leave-active > div {
  transition: transform 0.2s ease;
}

.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(100%);
}
</style>
