<script setup>
/**
 * 여러 파일 QR 받기 화면 (#/d?r=&f=).
 * 예전에는 파일을 0.25초 간격으로 연달아 받아 브라우저가 일부를 막았다. 이제는 작은 파일을 ZIP 하나로,
 * 200MB 넘는 파일(또는 크기를 모르는 파일)은 하나씩 받는다. 첫 건만 자동으로 시작하고 나머지는 눌러 받는다.
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeFileNames } from '../utils/router'
import { r2Service } from '../services/r2Service'
import { useDownload } from '../composables/useDownload'
import { useMultiDownload } from '../composables/useMultiDownload'
import MultiDownloadList from './MultiDownloadList.vue'
import AppFooter from './AppFooter.vue'

const { t } = useI18n()

const props = defineProps({
  roomId: { type: String, required: true },
  fileNamesBase64: { type: String, required: true }
})

const download = useDownload()
// 여기 크기는 응답 길이로 추정한 값이라 ZIP 길이(Content-Length)를 미리 정하지 않는다
const multi = useMultiDownload({ download, t, exactSizes: false })

const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const totalFiles = ref(0)
const items = ref([])

function goHome() {
  window.location.href = window.location.pathname
}

/** 받기 주소 응답의 Content-Length로 크기를 알아낸다 (본문은 받지 않고 끊는다). 모르면 null */
async function probeSize(url) {
  if (!url) return null
  const ctrl = new AbortController()
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const raw = res.headers.get('content-length')
    ctrl.abort()
    // 텍스트 파일은 저장소가 압축해 보내며 길이를 주지 않는다(null). 그런 파일은 하나씩 받는다
    const len = raw === null ? NaN : Number(raw)
    return res.ok && Number.isFinite(len) && len >= 0 ? len : null
  } catch {
    ctrl.abort()
    return null
  }
}

async function withSizes(names) {
  let urls = {}
  try {
    urls = await r2Service.getDownloadUrls(props.roomId, names)
  } catch {
    urls = {}
  }
  const sizes = await Promise.all(names.map((name) => probeSize(urls[name])))
  return names.map((name, i) => ({ name, roomId: props.roomId, size: sizes[i], url: r2Service.getFileUrl(props.roomId, name) }))
}

function run(item) {
  return multi.run(item)
}

onMounted(async () => {
  try {
    const names = decodeFileNames(props.fileNamesBase64)
    if (names.length === 0) {
      hasError.value = true
      errorMessage.value = t('download.invalidLink')
      return
    }
    totalFiles.value = names.length
    const files = await withSizes(names)
    items.value = multi.buildItems(files)
    loading.value = false
    // 첫 건만 자동으로 시작한다 (연달아 시작하면 브라우저가 막는다)
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (items.value[0]) await multi.run(items.value[0])
  } catch (error) {
    console.error('[DownloadPage] 초기화 실패:', error)
    hasError.value = true
    errorMessage.value = t('download.pageLoadError')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white flex flex-col">
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="max-w-2xl w-full">
        <!-- 에러 화면 -->
        <div v-if="hasError" class="bg-surface rounded-2xl p-8 border border-red-500/30 shadow-2xl" data-testid="download-page-error">
          <div class="text-center">
            <div class="text-6xl mb-4">❌</div>
            <h1 class="text-2xl font-bold mb-4 text-red-400">{{ t('download.error') }}</h1>
            <p class="text-text-secondary mb-6">{{ errorMessage }}</p>
            <button
              class="bg-primary text-white px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              @click="goHome"
            >
              {{ t('download.backToMain') }}
            </button>
          </div>
        </div>

        <!-- 받기 목록 -->
        <div v-else class="bg-surface rounded-2xl p-6 sm:p-8 border border-border shadow-2xl text-text-primary" data-testid="download-page">
          <div class="text-center mb-6">
            <div class="text-5xl mb-4">📥</div>
            <h1 class="text-2xl sm:text-3xl font-bold mb-2">{{ totalFiles === 1 ? t('multiDownload.titleOne') : t('multiDownload.title') }}</h1>
            <p class="text-text-secondary m-0">{{ t('multiDownload.pageIntro', { count: totalFiles }) }}</p>
          </div>
          <p v-if="loading" class="text-center text-text-secondary" data-testid="download-page-loading">{{ t('multiDownload.preparing') }}</p>
          <MultiDownloadList v-else :items="items" @run="run" />
          <p v-if="!loading && items.length > 1" class="mt-4 mb-0 text-xs text-text-secondary leading-relaxed">{{ t('multiDownload.note') }}</p>
          <div class="mt-6 text-center">
            <button
              class="bg-primary text-white px-8 py-3 rounded-lg font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              @click="goHome"
            >
              {{ t('download.backToMain') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
/* 스크롤바 스타일링 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(66, 184, 131, 0.5);
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.7);
}
</style>
