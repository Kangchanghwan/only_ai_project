<script setup>
/**
 * 첫 공유 성공 직후 뜨는 "다음에도 쓰려면" 카드.
 * - 설치(홈 화면에 추가) / 친구에게 알리기 / 닫기
 * - 설치 프롬프트가 없는 환경(iOS Safari, 데스크톱 브라우저)에서는 안내 문구를 인라인으로 보여준다.
 * 표시 여부 판단은 useKeepUsingNudge가 맡고, 이 컴포넌트는 보일 때의 동작만 담당한다.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '../composables/usePWAInstall.js'
import { trackEvent } from '../utils/analytics'

const SITE_URL = 'https://www.clipboardapp.org/'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['done', 'dismiss', 'copied'])

const { t } = useI18n()
const { canInstall, promptInstall } = usePWAInstall()

const hint = ref(null) // 'ios' | 'bookmark' | null

function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1)
  const isMac = platform.includes('mac') && !isIOS
  const isMobile = isIOS || /android/.test(ua)
  return { isIOS, isMac, isMobile }
}

const bookmarkShortcut = computed(() => (detectPlatform().isMac ? 'Cmd+D' : 'Ctrl+D'))

async function handleInstall() {
  trackEvent('nudge_install_click', { canInstall: canInstall.value })
  if (canInstall.value) {
    await promptInstall()
    emit('done')
    return
  }
  const { isIOS, isMobile } = detectPlatform()
  if (isIOS) {
    hint.value = 'ios'
  } else if (!isMobile) {
    hint.value = 'bookmark'
  } else {
    // Android인데 설치 프롬프트가 아직 안 온 경우: 브라우저 메뉴 안내로 갈음
    hint.value = 'bookmark'
  }
}

async function handleShare() {
  const payload = { title: 'Clipboard Share', text: t('nudge.shareText'), url: SITE_URL }
  if (typeof navigator.share === 'function') {
    trackEvent('nudge_share_click', { method: 'web_share' })
    try {
      await navigator.share(payload)
      emit('done')
    } catch {
      // 사용자가 공유 시트를 닫은 경우: 카드는 그대로 둔다
    }
    return
  }
  trackEvent('nudge_share_click', { method: 'copy' })
  try {
    await navigator.clipboard.writeText(SITE_URL)
    emit('copied', t('nudge.copied'))
    emit('done')
  } catch {
    hint.value = 'bookmark'
  }
}

function handleDismiss() {
  emit('dismiss')
}
</script>

<template>
  <Transition name="nudge">
    <div
      v-if="isOpen"
      data-testid="keep-using-card"
      data-prerender-strip
      role="dialog"
      :aria-label="t('nudge.title')"
      class="keep-using-card fixed z-40 bg-surface border border-border rounded-xl shadow-lg p-4"
    >
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-text-primary">{{ t('nudge.title') }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="nudge-install"
              class="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
              @click="handleInstall"
            >
              {{ t('nudge.install') }}
            </button>
            <button
              type="button"
              data-testid="nudge-share"
              class="px-3 py-1.5 rounded-full border border-primary text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
              @click="handleShare"
            >
              {{ t('nudge.share') }}
            </button>
          </div>
          <p
            v-if="hint === 'ios'"
            data-testid="nudge-hint"
            class="mt-3 text-xs leading-relaxed text-text-secondary"
          >
            {{ t('nudge.installIosHint') }}
          </p>
          <p
            v-else-if="hint === 'bookmark'"
            data-testid="nudge-hint"
            class="mt-3 text-xs leading-relaxed text-text-secondary"
          >
            {{ t('nudge.bookmarkHint', { shortcut: bookmarkShortcut }) }}
          </p>
        </div>
        <button
          type="button"
          data-testid="nudge-dismiss"
          :aria-label="t('nudge.dismiss')"
          class="shrink-0 -mr-1 -mt-1 h-7 w-7 rounded-full text-text-secondary hover:bg-border/60 transition-colors"
          @click="handleDismiss"
        >
          &times;
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 480px 폰 프레임 하단에 맞춰 스스로 중앙 정렬한다 (App.vue의 fixed 요소 규칙 참고) */
.keep-using-card {
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 5.5rem);
  width: calc(100% - 2rem);
  max-width: calc(30rem - 2rem);
}

.nudge-enter-active,
.nudge-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.nudge-enter-from,
.nudge-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
