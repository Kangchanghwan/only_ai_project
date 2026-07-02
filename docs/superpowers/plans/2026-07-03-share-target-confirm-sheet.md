# 모바일 Share Sheet 공유 확인 시트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 OS Share Sheet(Web Share Target API)로 앱에 진입했을 때, 확인 없이 마지막 저장된 scope로 자동 업로드/텍스트 공유되던 것을 막고, 매번 "같은 네트워크"/"전체 공유"를 명시적으로 선택하게 하는 확인 시트를 추가한다.

**Architecture:** 새 컴포넌트 `ShareConfirmSheet.vue`(기존 `FileCard.vue`의 모바일 액션 시트 패턴 재사용)를 `App.vue`에 붙이고, `handleShareTargetData()`가 업로드 전에 이 시트에서 사용자 선택을 `Promise`로 기다리도록 바꾼다. 선택된 scope는 `uploadFiles`/`handleAddText`에 새로 추가하는 `scopeOverride` 매개변수로만 전달하고, `useShareScope`의 저장된 값(`localStorage`, 상단 탭)은 건드리지 않는다.

**Tech Stack:** Vue 3 Composition API, vue-i18n, Tailwind CSS 4, Vitest + Vue Test Utils (happy-dom)

**Spec:** [docs/superpowers/specs/2026-07-03-share-target-confirm-sheet-design.md](../specs/2026-07-03-share-target-confirm-sheet-design.md)

---

## Task 1: i18n 키 추가 (`shareTargetConfirm`)

**Files:**
- Modify: `frontend/src/i18n/i18n.test.js`
- Modify: `frontend/src/i18n/locales/ar.json`, `cs.json`, `de.json`, `en.json`, `es.json`, `fa.json`, `fr.json`, `hu.json`, `id.json`, `ja.json`, `ko.json`, `nl.json`, `pl.json`, `pt.json`, `ro.json`, `ru.json`, `sv.json`, `tr.json`, `uk.json`, `vi.json`, `zh.json` (21개 전체)

- [ ] **Step 1: 실패하는 검증 테스트를 먼저 작성**

`frontend/src/i18n/i18n.test.js` 끝에 새 `describe` 블록을 추가한다:

```js
describe('i18n shareTargetConfirm', () => {
  it('모든 로케일 파일에 shareTargetConfirm의 5개 키가 모두 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['titleFiles', 'titleText', 'titleFilesAndText', 'cancel', 'confirm']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.shareTargetConfirm, `${path}에 shareTargetConfirm 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.shareTargetConfirm[key], `${path}의 shareTargetConfirm.${key} 없음`).toBe('string')
        expect(json.shareTargetConfirm[key].length, `${path}의 shareTargetConfirm.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})
```

이 블록은 기존 `describe('i18n file.moreActions', ...)` 블록 바로 다음에 추가한다(파일 맨 끝).

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: FAIL — `shareTargetConfirm 섹션 없음` 메시지와 함께 21개 로케일 모두 실패

- [ ] **Step 3: 21개 로케일 파일에 `shareTargetConfirm` 섹션 추가**

각 파일에서 `"shareScope"` 섹션이 끝나는 지점(`"globalDescription": "..."` 다음 줄의 `},` 그리고 `"file": {` 사이)에 새 섹션을 삽입한다. 모든 파일에서 앵커 패턴은 동일하다:

```
    "globalDescription": "<기존 값 그대로>"
  },
  "file": {
```

이 사이에 아래 블록을 끼워 넣는다(`<기존 값 그대로>`는 건드리지 않음). 로케일별 삽입 내용은 다음과 같다.

**`ar.json`** — `globalDescription` 값: `"تتم المشاركة مع جميع المستخدمين"`

```json
  "shareTargetConfirm": {
    "titleFiles": "مشاركة {count} ملف",
    "titleText": "مشاركة النص",
    "titleFilesAndText": "مشاركة {count} ملف ونص",
    "cancel": "إلغاء",
    "confirm": "مشاركة"
  },
```

**`cs.json`** — `globalDescription` 값: `"Sdíleno se všemi uživateli"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Sdílet {count} soubor(ů)",
    "titleText": "Sdílet text",
    "titleFilesAndText": "Sdílet {count} soubor(ů) a text",
    "cancel": "Zrušit",
    "confirm": "Sdílet"
  },
```

**`de.json`** — `globalDescription` 값: `"Wird mit allen Nutzern geteilt"`

```json
  "shareTargetConfirm": {
    "titleFiles": "{count} Datei(en) teilen",
    "titleText": "Text teilen",
    "titleFilesAndText": "{count} Datei(en) und Text teilen",
    "cancel": "Abbrechen",
    "confirm": "Teilen"
  },
```

**`en.json`** — `globalDescription` 값: `"Shared with all users"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Share {count} file(s)",
    "titleText": "Share text",
    "titleFilesAndText": "Share {count} file(s) and text",
    "cancel": "Cancel",
    "confirm": "Share"
  },
```

**`es.json`** — `globalDescription` 값: `"Se comparte con todos los usuarios"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Compartir {count} archivo(s)",
    "titleText": "Compartir texto",
    "titleFilesAndText": "Compartir {count} archivo(s) y texto",
    "cancel": "Cancelar",
    "confirm": "Compartir"
  },
```

**`fa.json`** — `globalDescription` 값: `"با همه کاربران به اشتراک گذاشته می‌شود"`

```json
  "shareTargetConfirm": {
    "titleFiles": "اشتراک‌گذاری {count} فایل",
    "titleText": "اشتراک‌گذاری متن",
    "titleFilesAndText": "اشتراک‌گذاری {count} فایل و متن",
    "cancel": "لغو",
    "confirm": "اشتراک‌گذاری"
  },
```

**`fr.json`** — `globalDescription` 값: `"Partagé avec tous les utilisateurs"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Partager {count} fichier(s)",
    "titleText": "Partager le texte",
    "titleFilesAndText": "Partager {count} fichier(s) et du texte",
    "cancel": "Annuler",
    "confirm": "Partager"
  },
```

**`hu.json`** — `globalDescription` 값: `"Minden felhasználóval megosztva"`

```json
  "shareTargetConfirm": {
    "titleFiles": "{count} fájl megosztása",
    "titleText": "Szöveg megosztása",
    "titleFilesAndText": "{count} fájl és szöveg megosztása",
    "cancel": "Mégse",
    "confirm": "Megosztás"
  },
```

**`id.json`** — `globalDescription` 값: `"Dibagikan dengan semua pengguna"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Bagikan {count} file",
    "titleText": "Bagikan teks",
    "titleFilesAndText": "Bagikan {count} file dan teks",
    "cancel": "Batal",
    "confirm": "Bagikan"
  },
```

**`ja.json`** — `globalDescription` 값: `"すべてのユーザーに共有されます"`

```json
  "shareTargetConfirm": {
    "titleFiles": "{count} 個のファイルを共有します",
    "titleText": "テキストを共有します",
    "titleFilesAndText": "{count} 個のファイルとテキストを共有します",
    "cancel": "キャンセル",
    "confirm": "共有する"
  },
```

**`ko.json`** — `globalDescription` 값: `"모든 사용자에게 공유돼요"`

```json
  "shareTargetConfirm": {
    "titleFiles": "파일 {count}개를 공유합니다",
    "titleText": "텍스트를 공유합니다",
    "titleFilesAndText": "파일 {count}개와 텍스트를 공유합니다",
    "cancel": "취소",
    "confirm": "공유하기"
  },
```

**`nl.json`** — `globalDescription` 값: `"Wordt gedeeld met alle gebruikers"`

```json
  "shareTargetConfirm": {
    "titleFiles": "{count} bestand(en) delen",
    "titleText": "Tekst delen",
    "titleFilesAndText": "{count} bestand(en) en tekst delen",
    "cancel": "Annuleren",
    "confirm": "Delen"
  },
```

**`pl.json`** — `globalDescription` 값: `"Udostępniane wszystkim użytkownikom"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Udostępnij {count} plik(ów)",
    "titleText": "Udostępnij tekst",
    "titleFilesAndText": "Udostępnij {count} plik(ów) i tekst",
    "cancel": "Anuluj",
    "confirm": "Udostępnij"
  },
```

**`pt.json`** — `globalDescription` 값: `"Compartilhado com todos os usuários"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Compartilhar {count} arquivo(s)",
    "titleText": "Compartilhar texto",
    "titleFilesAndText": "Compartilhar {count} arquivo(s) e texto",
    "cancel": "Cancelar",
    "confirm": "Compartilhar"
  },
```

**`ro.json`** — `globalDescription` 값: `"Se distribuie tuturor utilizatorilor"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Distribuie {count} fișier(e)",
    "titleText": "Distribuie text",
    "titleFilesAndText": "Distribuie {count} fișier(e) și text",
    "cancel": "Anulează",
    "confirm": "Distribuie"
  },
```

**`ru.json`** — `globalDescription` 값: `"Доступно всем пользователям"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Поделиться {count} файлом(ами)",
    "titleText": "Поделиться текстом",
    "titleFilesAndText": "Поделиться {count} файлом(ами) и текстом",
    "cancel": "Отмена",
    "confirm": "Поделиться"
  },
```

**`sv.json`** — `globalDescription` 값: `"Delas med alla användare"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Dela {count} fil(er)",
    "titleText": "Dela text",
    "titleFilesAndText": "Dela {count} fil(er) och text",
    "cancel": "Avbryt",
    "confirm": "Dela"
  },
```

**`tr.json`** — `globalDescription` 값: `"Tüm kullanıcılarla paylaşılır"`

```json
  "shareTargetConfirm": {
    "titleFiles": "{count} dosya paylaş",
    "titleText": "Metni paylaş",
    "titleFilesAndText": "{count} dosya ve metni paylaş",
    "cancel": "İptal",
    "confirm": "Paylaş"
  },
```

**`uk.json`** — `globalDescription` 값: `"Доступно всім користувачам"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Поділитися {count} файлом(ами)",
    "titleText": "Поділитися текстом",
    "titleFilesAndText": "Поділитися {count} файлом(ами) і текстом",
    "cancel": "Скасувати",
    "confirm": "Поділитися"
  },
```

**`vi.json`** — `globalDescription` 값: `"Chia sẻ với tất cả người dùng"`

```json
  "shareTargetConfirm": {
    "titleFiles": "Chia sẻ {count} tệp",
    "titleText": "Chia sẻ văn bản",
    "titleFilesAndText": "Chia sẻ {count} tệp và văn bản",
    "cancel": "Hủy",
    "confirm": "Chia sẻ"
  },
```

**`zh.json`** — `globalDescription` 값: `"与所有用户共享"`

```json
  "shareTargetConfirm": {
    "titleFiles": "分享 {count} 个文件",
    "titleText": "分享文本",
    "titleFilesAndText": "分享 {count} 个文件和文本",
    "cancel": "取消",
    "confirm": "分享"
  },
```

각 파일에서 삽입 후 `"file": {` 줄이 그대로 바로 이어지는지 확인한다(JSON 문법 깨짐 방지).

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: PASS — `i18n shareTargetConfirm` 포함 모든 테스트 통과

- [ ] **Step 5: JSON 유효성 검증**

Run: `cd frontend && node -e "['ar','cs','de','en','es','fa','fr','hu','id','ja','ko','nl','pl','pt','ro','ru','sv','tr','uk','vi','zh'].forEach(l => JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'.json','utf8')))" && echo "OK: all 21 valid JSON"`
Expected: `OK: all 21 valid JSON` (파싱 에러 없음)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/i18n/i18n.test.js frontend/src/i18n/locales/*.json
git commit -m "feat(i18n): add shareTargetConfirm keys to all 21 locales"
```

---

## Task 2: `ShareConfirmSheet.vue` 컴포넌트 작성 (TDD)

**Files:**
- Create: `frontend/src/components/ShareConfirmSheet.vue`
- Create: `frontend/src/components/ShareConfirmSheet.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/ShareConfirmSheet.test.js`:

```js
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import ShareConfirmSheet from './ShareConfirmSheet.vue'

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

function mountSheet(props = {}) {
  wrapper = mount(ShareConfirmSheet, {
    props: { isOpen: true, fileCount: 0, hasText: false, ...props }
  })
  return wrapper
}

// Teleport로 document.body에 렌더링되므로 wrapper.find()로는 찾을 수 없다 (FileCard.test.js와 동일한 패턴).
function findSheet() {
  const el = document.body.querySelector('.share-confirm-sheet')
  return el ? new DOMWrapper(el) : null
}

describe('ShareConfirmSheet', () => {
  it('isOpen이 false면 시트를 렌더링하지 않는다', () => {
    mountSheet({ isOpen: false })
    expect(findSheet()).toBe(null)
  })

  it('isOpen이 true면 시트를 렌더링한다', () => {
    mountSheet({ isOpen: true })
    expect(findSheet()).not.toBe(null)
  })

  it('파일만 있으면 titleFiles 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 2, hasText: false })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleFiles')
  })

  it('텍스트만 있으면 titleText 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 0, hasText: true })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleText')
  })

  it('파일과 텍스트가 모두 있으면 titleFilesAndText 키로 요약을 표시한다', () => {
    mountSheet({ fileCount: 2, hasText: true })
    expect(findSheet().text()).toContain('shareTargetConfirm.titleFilesAndText')
  })

  it('기본 선택은 항상 같은 네트워크(ip)이며 coral 스타일이 적용된다', () => {
    mountSheet({ fileCount: 1 })
    const ipButton = findSheet().findAll('button')[0]
    expect(ipButton.classes()).toContain('border-primary')
  })

  it('전체 공유 옵션을 클릭하면 선택이 global로 바뀐다', async () => {
    mountSheet({ fileCount: 1 })
    const globalButton = findSheet().findAll('button')[1]
    await globalButton.trigger('click')
    expect(globalButton.classes()).toContain('border-scope-global')
  })

  it('공유하기 클릭 시 현재 선택된 scope와 함께 confirm을 emit한다', async () => {
    mountSheet({ fileCount: 1 })
    await findSheet().findAll('button')[1].trigger('click') // 전체 공유로 전환
    const confirmButton = findSheet().findAll('button')
      .find((b) => b.text() === 'shareTargetConfirm.confirm')
    await confirmButton.trigger('click')

    expect(wrapper.emitted('confirm')).toBeTruthy()
    expect(wrapper.emitted('confirm')[0]).toEqual(['global'])
  })

  it('취소 클릭 시 cancel만 emit하고 confirm은 emit하지 않는다', async () => {
    mountSheet({ fileCount: 1 })
    const cancelButton = findSheet().findAll('button')
      .find((b) => b.text() === 'shareTargetConfirm.cancel')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('배경 클릭 시 cancel을 emit한다', async () => {
    mountSheet({ fileCount: 1 })
    await findSheet().trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('다시 열릴 때(isOpen false→true) 선택이 항상 ip로 초기화된다', async () => {
    mountSheet({ fileCount: 1, isOpen: true })
    await findSheet().findAll('button')[1].trigger('click') // global 선택
    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true })

    const reopenedIpButton = findSheet().findAll('button')[0]
    expect(reopenedIpButton.classes()).toContain('border-primary')
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/components/ShareConfirmSheet.test.js`
Expected: FAIL — `Failed to resolve import "./ShareConfirmSheet.vue"` (파일이 아직 없음)

- [ ] **Step 3: 컴포넌트 구현**

`frontend/src/components/ShareConfirmSheet.vue`:

```vue
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/components/ShareConfirmSheet.test.js`
Expected: PASS — 11개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/ShareConfirmSheet.vue frontend/src/components/ShareConfirmSheet.test.js
git commit -m "feat(frontend): add ShareConfirmSheet component"
```

---

## Task 3: `App.vue`에 확인 시트 연결

**Files:**
- Modify: `frontend/src/App.vue`

**주의:** `App.vue`는 소켓/룸 연결 등 무거운 의존성을 직접 초기화하므로 기존에 전용 단위 테스트(`App.test.js`)가 없다(다른 페이지 최상위 컴포넌트도 동일 관례). 이번 작업도 새 테스트 하네스를 만들지 않고 기존 관례를 따른다 — 이 Task의 검증은 Task 4의 수동 QA로 대체한다.

- [ ] **Step 1: `ShareConfirmSheet` import 추가**

`frontend/src/App.vue`의 기존 컴포넌트 import 블록을 찾는다:

```js
import RoomScreen from './components/RoomScreen.vue'
import DownloadPage from './components/DownloadPage.vue'
import NotificationToast from './components/NotificationToast.vue'
```

아래로 교체:

```js
import RoomScreen from './components/RoomScreen.vue'
import DownloadPage from './components/DownloadPage.vue'
import NotificationToast from './components/NotificationToast.vue'
import ShareConfirmSheet from './components/ShareConfirmSheet.vue'
```

- [ ] **Step 2: `uploadFiles`가 scope override를 받도록 변경**

기존:

```js
async function uploadFiles(files) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.getScope()
  const targetRoomId = roomManager.roomIdForScope(targetScope)
```

아래로 교체:

```js
async function uploadFiles(files, scopeOverride) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = scopeOverride || shareScope.getScope()
  const targetRoomId = roomManager.roomIdForScope(targetScope)
```

(이후 로직은 변경 없음. `handlePaste`/`handleUploadFiles`는 `uploadFiles(files)`를 인자 1개로 그대로 호출하므로 `scopeOverride`가 `undefined`가 되어 기존 동작과 100% 동일하게 유지된다.)

- [ ] **Step 3: `handleAddText`가 scope override를 받도록 변경**

기존:

```js
async function handleAddText(content) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.scope.value
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return
```

아래로 교체:

```js
async function handleAddText(content, scopeOverride) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = scopeOverride || shareScope.scope.value
  const targetRoomId = roomManager.roomIdForScope(targetScope)
  if (!targetRoomId) return
```

(`scopeOverride`가 없을 때 `roomManager.roomIdForScope(shareScope.scope.value)`는 기존 `activeRoomId.value`와 동일한 값이므로 기존 호출부(`handlePaste`, `RoomScreen`의 `paste-content` 등)는 동작 변화 없음.)

- [ ] **Step 4: 확인 시트 상태와 헬퍼 함수 추가, `handleShareTargetData` 재작성**

기존 `handleShareTargetData` 전체 함수를 찾는다:

```js
/**
 * Service Worker에서 공유 데이터를 가져와 업로드/텍스트 공유 처리
 */
async function handleShareTargetData() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    console.warn('[App] Service Worker not ready for share target')
    return
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => reject(new Error('SW timeout')), 3000)

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data?.data || null)
      }

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_SHARE_DATA' },
        [channel.port2]
      )
    })

    if (!data) {
      console.log('[App] No share data from SW')
      return
    }

    // 파일이 있으면 업로드
    if (data.files && data.files.length > 0) {
      const fileList = Array.from(data.files)
      await uploadFiles(fileList)
    }

    // 텍스트가 있으면 공유 (text, url, title 조합)
    const textParts = [data.title, data.text, data.url].filter(Boolean)
    const combinedText = textParts.join('\n').trim()
    if (combinedText) {
      await handleAddText(combinedText)
    }
  } catch (error) {
    console.error('[App] Share target 처리 실패:', error)
  }
}
```

아래 전체로 교체:

```js
// 모바일 Share Sheet 확인 시트 상태
const isShareConfirmOpen = ref(false)
const shareConfirmSummary = ref({ fileCount: 0, hasText: false })
let shareConfirmResolve = null

/**
 * 확인 시트를 열고 사용자가 scope를 고르거나 취소할 때까지 대기한다.
 * 취소 시 null을 resolve한다.
 */
function requestShareConfirmation(fileCount, hasText) {
  shareConfirmSummary.value = { fileCount, hasText }
  isShareConfirmOpen.value = true
  return new Promise((resolve) => {
    shareConfirmResolve = resolve
  })
}

function handleShareConfirm(scope) {
  isShareConfirmOpen.value = false
  shareConfirmResolve?.(scope)
  shareConfirmResolve = null
}

function handleShareCancel() {
  isShareConfirmOpen.value = false
  shareConfirmResolve?.(null)
  shareConfirmResolve = null
}

/**
 * Service Worker에서 공유 데이터를 가져와 확인 시트를 거쳐 업로드/텍스트 공유 처리
 */
async function handleShareTargetData() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    console.warn('[App] Service Worker not ready for share target')
    return
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => reject(new Error('SW timeout')), 3000)

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data?.data || null)
      }

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_SHARE_DATA' },
        [channel.port2]
      )
    })

    if (!data) {
      console.log('[App] No share data from SW')
      return
    }

    const fileList = data.files && data.files.length > 0 ? Array.from(data.files) : []
    const textParts = [data.title, data.text, data.url].filter(Boolean)
    const combinedText = textParts.join('\n').trim()

    if (fileList.length === 0 && !combinedText) {
      console.log('[App] Share target 데이터에 파일/텍스트가 없어 확인 시트를 생략')
      return
    }

    const scope = await requestShareConfirmation(fileList.length, Boolean(combinedText))
    if (!scope) {
      console.log('[App] 사용자가 공유를 취소함')
      return
    }

    if (fileList.length > 0) {
      await uploadFiles(fileList, scope)
    }

    if (combinedText) {
      await handleAddText(combinedText, scope)
    }
  } catch (error) {
    console.error('[App] Share target 처리 실패:', error)
  }
}
```

- [ ] **Step 5: 템플릿에 `ShareConfirmSheet` 추가**

기존:

```html
      <!-- 알림 토스트 -->
      <NotificationToast
        :message="notification.notification.value"
        :uploads="notification.uploads.value"
      />
    </div>
  </div>
</template>
```

아래로 교체:

```html
      <!-- 알림 토스트 -->
      <NotificationToast
        :message="notification.notification.value"
        :uploads="notification.uploads.value"
      />

      <!-- 모바일 Share Sheet 공유 확인 시트 -->
      <ShareConfirmSheet
        :is-open="isShareConfirmOpen"
        :file-count="shareConfirmSummary.fileCount"
        :has-text="shareConfirmSummary.hasText"
        @confirm="handleShareConfirm"
        @cancel="handleShareCancel"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 6: 프론트엔드 전체 테스트 스위트 실행 (회귀 확인)**

Run: `cd frontend && npx vitest run`
Expected: PASS — 기존 테스트(`FileUploadSection.test.js`, `RoomScreen.test.js` 등)와 Task 1/2에서 추가한 테스트 모두 통과, 실패 0건

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/App.vue
git commit -m "feat(frontend): gate share-target auto-publish behind confirm sheet"
```

---

## Task 4: `DESIGN.md` 갱신 + 수동 QA

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: "Open Design Question" 섹션 제거**

기존:

```markdown
## Open Design Question (deferred)
The mobile OS "share to app" flow (Web Share Target API, see `frontend/public/manifest.json` share_target + `frontend/public/sw.js` + `frontend/src/composables/useShareScope.js`) currently auto-publishes to whatever scope (`ip`/`global`) was last selected in-app, with zero confirmation. Because `global` is sticky in localStorage, a stale preference could silently broadcast content shared from another app to everyone using ClipboardApp. A confirmation-sheet design (using the scope colors above, sage-emphasized when resolved scope is `global`) was proposed but deferred — to be designed in a follow-up session before implementation.

## Decisions Log
```

아래로 교체:

```markdown
## Decisions Log
```

- [ ] **Step 2: Decisions Log 마지막 행 뒤에 새 행 추가**

`DESIGN.md`에서 Decisions Log 테이블의 마지막 행(2026-07-02, `AppFooter` 제거 관련 행)을 찾는다:

```markdown
| 2026-07-02 | 룸 화면/다운로드 화면 하단의 `AppFooter`(개인정보 처리방침·GitHub 링크·제작자 크레딧)를 제거하고, 그 내용을 헤더의 도움말 모달(`HelpModal.vue`) 하단 "정보" 섹션으로 이전 | 사용자가 푸터 없이 화면이 더 깔끔하다고 판단, 항상 노출되는 하단 바 대신 필요할 때 여는 도움말 안에 링크를 보존하도록 요청 |
```

바로 다음 줄에 추가:

```markdown
| 2026-07-03 | 모바일 Share Sheet(Web Share Target) 진입 시 매번 "같은 네트워크"/"전체 공유" 확인 시트를 강제 노출, 취소 시 공유 데이터 전체 폐기 | 마지막 선택 scope가 `localStorage`에 sticky하게 남아 있어 다른 앱에서 공유한 콘텐츠가 인지 없이 `global`로 broadcast될 위험 — 매번 명시적 선택을 요구해 제거. 선택은 이번 공유 1회에만 적용하고 앱의 저장된 기본값은 건드리지 않음 |
```

- [ ] **Step 3: 커밋**

```bash
git add DESIGN.md
git commit -m "docs(design): resolve deferred share-target confirmation question"
```

- [ ] **Step 4: 수동 QA — 개발 서버로 확인**

Run: `cd frontend && npm run dev`

브라우저 개발자 도구 콘솔에서 아래 스크립트를 실행해 실제 Share Target 진입 없이도 확인 시트 트리거 조건을 검증한다(Service Worker 등록 후):

1. `http://localhost:5173/?share-target=1`로 직접 접속 시 SW에 `pendingShareData`가 없으므로 시트가 뜨지 않고 조용히 종료되는지 확인(콘솔에 `[App] No share data from SW` 로그).
2. Android Chrome 실기기 또는 에뮬레이터에서 다른 앱(사진 앱 등)의 공유 메뉴로 ClipboardApp을 선택 — 파일 1개/여러 개/텍스트/파일+텍스트 조합 각각에 대해:
   - 시트가 매번 뜨는지
   - 기본 선택이 "같은 네트워크"인지 (coral 배경)
   - "전체 공유" 클릭 시 즉시 sage 배경으로 바뀌는지
   - "공유하기" 클릭 후 선택한 scope의 룸에 실제로 콘텐츠가 올라가는지
   - 상단 `ShareScopeTabs`가 시트 조작과 무관하게 이전 저장값을 그대로 보여주는지 (예: 탭이 "같은 네트워크"로 저장돼 있던 상태에서 시트에서 "전체 공유"를 골라도, 공유 후 탭은 여전히 "같은 네트워크")
   - "취소" 클릭 시 아무것도 업로드/공유되지 않는지
3. 라이트/다크 테마 각각에서 시트 배경·텍스트·버튼 대비 확인.

Expected: 위 항목 모두 스펙([docs/superpowers/specs/2026-07-03-share-target-confirm-sheet-design.md](../specs/2026-07-03-share-target-confirm-sheet-design.md))대로 동작.

---

## 전체 완료 조건

- [ ] `cd frontend && npx vitest run` 전체 통과
- [ ] 21개 로케일 모두 `shareTargetConfirm` 키 보유 (Task 1 테스트로 검증됨)
- [ ] `DESIGN.md`에 "Open Design Question" 섹션이 더 이상 존재하지 않음
- [ ] Task 4 수동 QA 시나리오 확인 완료
