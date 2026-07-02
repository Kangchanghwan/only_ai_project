<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeFileNames } from '../utils/router'
import { r2Service } from '../services/r2Service'
import { useDownload } from '../composables/useDownload'

const { t } = useI18n()

const props = defineProps({
  roomId: {
    type: String,
    required: true
  },
  fileNamesBase64: {
    type: String,
    required: true
  }
})

const download = useDownload()

// 상태 관리
const downloadStates = ref({})
const completedCount = ref(0)
const failedCount = ref(0)
const totalFiles = ref(0)
const isComplete = ref(false)
const hasError = ref(false)
const errorMessage = ref('')
const fileNames = ref([])
const files = ref([])

// 진행률 계산
const progress = computed(() => {
  if (totalFiles.value === 0) return 0
  return Math.round((completedCount.value / totalFiles.value) * 100)
})

// 성공 여부
const hasSuccess = computed(() => completedCount.value > 0)

// 상태별 파일 필터링
function getFilesByStatus(status) {
  return files.value.filter(file => downloadStates.value[file.name] === status)
}

// 메인 페이지로 이동
function goHome() {
  window.location.href = window.location.pathname
}

// 다운로드 시작
async function startDownload() {
  if (files.value.length === 0) {
    hasError.value = true
    errorMessage.value = t('download.noFiles')
    return
  }

  try {
    await download.downloadParallel(files.value, {
      onProgress: (file, status, error) => {
        if (status === 'start') {
          downloadStates.value[file.name] = 'downloading'
        } else if (status === 'complete') {
          downloadStates.value[file.name] = 'complete'
          completedCount.value++
        } else if (status === 'failed') {
          downloadStates.value[file.name] = 'failed'
          failedCount.value++
          console.error(`[DownloadPage] 파일 다운로드 실패: ${file.name}`, error)
        }
      }
    })

    isComplete.value = true

    // 모든 파일이 실패한 경우
    if (failedCount.value === totalFiles.value) {
      hasError.value = true
      errorMessage.value = t('download.roomNotFound')
    }
  } catch (error) {
    console.error('[DownloadPage] 다운로드 중 오류 발생:', error)
    hasError.value = true
    errorMessage.value = t('download.errorMessage')
    isComplete.value = true
  }
}

// 초기화 및 자동 다운로드 시작
onMounted(async () => {
  console.log('[DownloadPage] 마운트됨:', {
    roomId: props.roomId,
    fileNamesBase64: props.fileNamesBase64
  })

  try {
    // 파일명 디코딩
    fileNames.value = decodeFileNames(props.fileNamesBase64)

    if (fileNames.value.length === 0) {
      hasError.value = true
      errorMessage.value = t('download.invalidLink')
      return
    }

    // 파일 객체 생성
    files.value = fileNames.value.map(name => ({
      name,
      url: r2Service.getFileUrl(props.roomId, name)
    }))

    totalFiles.value = files.value.length

    // 초기 상태 설정
    files.value.forEach(file => {
      downloadStates.value[file.name] = 'pending'
    })

    console.log('[DownloadPage] 파일 목록:', files.value)

    // 자동 다운로드 시작 (약간의 딜레이)
    await new Promise(resolve => setTimeout(resolve, 500))
    await startDownload()
  } catch (error) {
    console.error('[DownloadPage] 초기화 실패:', error)
    hasError.value = true
    errorMessage.value = t('download.pageLoadError')
  }
})

// 상태별 아이콘
function getStatusIcon(status) {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'downloading':
      return '⏬'
    case 'complete':
      return '✅'
    case 'failed':
      return '❌'
    default:
      return '📄'
  }
}

// 상태별 텍스트
function getStatusText(status) {
  switch (status) {
    case 'pending':
      return t('download.pending')
    case 'downloading':
      return t('download.downloading')
    case 'complete':
      return t('download.completed')
    case 'failed':
      return t('download.failed')
    default:
      return ''
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white flex flex-col">
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="max-w-2xl w-full">
      <!-- 에러 화면 -->
      <div v-if="hasError && !isComplete" class="bg-surface rounded-2xl p-8 border border-red-500/30 shadow-2xl">
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

      <!-- 다운로드 진행 중 -->
      <div v-else-if="!isComplete" class="bg-surface rounded-2xl p-8 border border-border shadow-2xl">
        <!-- 헤더 -->
        <div class="text-center mb-8">
          <div class="text-5xl mb-4">📥</div>
          <h1 class="text-3xl font-bold text-text-primary mb-2">
            {{ t('download.title') }}
          </h1>
          <p class="text-text-secondary">
            {{ t('download.filesCount', { count: totalFiles }) }} {{ t('download.parallel') }}
          </p>
        </div>

        <!-- 진행률 바 -->
        <div class="mb-8">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-text-secondary">{{ t('download.progress') }}</span>
            <span class="text-sm font-bold text-primary">{{ progress }}%</span>
          </div>
          <div class="w-full bg-black/30 rounded-full h-4 overflow-hidden">
            <div
              class="bg-gradient-to-r from-primary to-green-400 h-full transition-all duration-300 ease-out"
              :style="{ width: `${progress}%` }"
            />
          </div>
          <div class="text-center mt-2 text-sm text-text-secondary">
            {{ completedCount }} / {{ totalFiles }} {{ t('download.completed') }}
          </div>
        </div>

        <!-- 파일 목록 -->
        <div class="space-y-2 max-h-96 overflow-y-auto">
          <div
            v-for="file in files"
            :key="file.name"
            class="bg-black/20 rounded-lg p-4 flex items-center gap-4 transition-all"
            :class="{
              'border border-primary/30': downloadStates[file.name] === 'downloading',
              'opacity-50': downloadStates[file.name] === 'pending'
            }"
          >
            <div class="text-3xl flex-shrink-0">
              {{ getStatusIcon(downloadStates[file.name]) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate text-text-primary">{{ file.name }}</p>
              <p class="text-sm text-text-secondary">
                {{ getStatusText(downloadStates[file.name]) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 완료 화면 -->
      <div v-else class="bg-surface rounded-2xl p-8 border border-border shadow-2xl">
        <div class="text-center">
          <div class="text-6xl mb-4">
            {{ hasSuccess ? '✅' : '❌' }}
          </div>
          <h1 class="text-3xl font-bold text-text-primary mb-4">
            {{ hasSuccess ? t('download.complete') : t('download.failed') }}
          </h1>

          <!-- 결과 요약 -->
          <div class="bg-black/20 rounded-lg p-6 mb-6">
            <div class="grid grid-cols-2 gap-4 text-center">
              <div>
                <p class="text-3xl font-bold text-green-400">{{ completedCount }}</p>
                <p class="text-sm text-text-secondary">{{ t('download.success') }}</p>
              </div>
              <div>
                <p class="text-3xl font-bold text-red-400">{{ failedCount }}</p>
                <p class="text-sm text-text-secondary">{{ t('download.failed') }}</p>
              </div>
            </div>
          </div>

          <!-- 실패한 파일 목록 -->
          <div v-if="failedCount > 0" class="mb-6 text-left">
            <p class="text-sm text-text-secondary mb-2">{{ t('download.failedFiles') }}</p>
            <div class="bg-black/20 rounded-lg p-4 max-h-40 overflow-y-auto">
              <ul class="space-y-1">
                <li
                  v-for="file in getFilesByStatus('failed')"
                  :key="file.name"
                  class="text-sm text-red-400"
                >
                  ❌ {{ file.name }}
                </li>
              </ul>
            </div>
          </div>

          <!-- 에러 메시지 -->
          <p v-if="hasError" class="text-red-400 mb-6">
            {{ errorMessage }}
          </p>

          <!-- 액션 버튼 -->
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
