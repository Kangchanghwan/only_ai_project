# 파일 리스트 뷰 전환 + 좌 파일 / 우 텍스트 분할 레이아웃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파일 피드를 카드 그리드에서 리스트 형식으로 바꾸고, 파일↔텍스트를 상하 배치에서 데스크톱 좌(60%)/우(40%) 분할 + 모바일 탭 전환 배치로 바꾼다.

**Architecture:** 순수 프론트엔드 뷰 변경. `FileCard.vue`(카드→리스트 행), `FileGallery.vue`(그리드 컨테이너→리스트 컨테이너, 업로드 드롭존 분리), `RoomScreen.vue`(2컬럼 flex + 모바일 탭 로컬 상태)를 순서대로 변경한다. `<script setup>` 로직(계산된 속성, 이벤트 핸들러)은 대부분 그대로 재사용하고 템플릿/스타일만 바뀐다. 백엔드 변경 없음.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Tailwind CSS 4, Vitest + Vue Test Utils, vue-i18n.

**설계 문서:** [2026-07-02-file-list-and-split-layout-design.md](../specs/2026-07-02-file-list-and-split-layout-design.md)

---

### Task 1: 모바일 탭 라벨 i18n 키 추가 (21개 로케일)

**Files:**
- Modify: `frontend/src/i18n/locales/ar.json`, `cs.json`, `de.json`, `en.json`, `es.json`, `fa.json`, `fr.json`, `hu.json`, `id.json`, `ja.json`, `ko.json`, `nl.json`, `pl.json`, `pt.json`, `ro.json`, `ru.json`, `sv.json`, `tr.json`, `uk.json`, `vi.json`, `zh.json` (`"room"` 객체에 3개 키 추가)
- Create (임시, 실행 후 삭제): `frontend/scripts/tmp-add-mobile-tab-i18n.mjs`

모든 21개 로케일 파일의 `"room"` 객체는 `"copied"` 키로 끝나고 바로 `"shareScope"` 객체가 이어진다(확인됨: `grep -A1 '"copied"' *.json` 결과 전부 동일 구조). 이 경계를 찾아 3개 키(`filesTab`, `textTab`, `mobilePanelLabel`)를 삽입하는 일회성 스크립트를 작성해 실행한다.

- [ ] **Step 1: 임시 마이그레이션 스크립트 작성**

`frontend/scripts/tmp-add-mobile-tab-i18n.mjs` 파일을 다음 내용으로 생성한다:

```javascript
import { readFileSync, writeFileSync } from 'node:fs'

const translations = {
  ar: { filesTab: 'الملفات', textTab: 'النص', mobilePanelLabel: 'التبديل بين الملفات والنص' },
  cs: { filesTab: 'Soubory', textTab: 'Text', mobilePanelLabel: 'Přepínání souborů a textu' },
  de: { filesTab: 'Dateien', textTab: 'Text', mobilePanelLabel: 'Zwischen Dateien und Text wechseln' },
  en: { filesTab: 'Files', textTab: 'Text', mobilePanelLabel: 'Switch between files and text' },
  es: { filesTab: 'Archivos', textTab: 'Texto', mobilePanelLabel: 'Cambiar entre archivos y texto' },
  fa: { filesTab: 'فایل‌ها', textTab: 'متن', mobilePanelLabel: 'تعویض بین فایل و متن' },
  fr: { filesTab: 'Fichiers', textTab: 'Texte', mobilePanelLabel: 'Basculer entre fichiers et texte' },
  hu: { filesTab: 'Fájlok', textTab: 'Szöveg', mobilePanelLabel: 'Váltás fájlok és szöveg között' },
  id: { filesTab: 'File', textTab: 'Teks', mobilePanelLabel: 'Beralih antara file dan teks' },
  ja: { filesTab: 'ファイル', textTab: 'テキスト', mobilePanelLabel: 'ファイルとテキストの切り替え' },
  ko: { filesTab: '파일', textTab: '텍스트', mobilePanelLabel: '파일·텍스트 전환' },
  nl: { filesTab: 'Bestanden', textTab: 'Tekst', mobilePanelLabel: 'Wisselen tussen bestanden en tekst' },
  pl: { filesTab: 'Pliki', textTab: 'Tekst', mobilePanelLabel: 'Przełączanie między plikami a tekstem' },
  pt: { filesTab: 'Arquivos', textTab: 'Texto', mobilePanelLabel: 'Alternar entre arquivos e texto' },
  ro: { filesTab: 'Fișiere', textTab: 'Text', mobilePanelLabel: 'Comutare între fișiere și text' },
  ru: { filesTab: 'Файлы', textTab: 'Текст', mobilePanelLabel: 'Переключение между файлами и текстом' },
  sv: { filesTab: 'Filer', textTab: 'Text', mobilePanelLabel: 'Växla mellan filer och text' },
  tr: { filesTab: 'Dosyalar', textTab: 'Metin', mobilePanelLabel: 'Dosya ve metin arasında geçiş' },
  uk: { filesTab: 'Файли', textTab: 'Текст', mobilePanelLabel: 'Перемикання між файлами і текстом' },
  vi: { filesTab: 'Tệp', textTab: 'Văn bản', mobilePanelLabel: 'Chuyển đổi giữa tệp và văn bản' },
  zh: { filesTab: '文件', textTab: '文本', mobilePanelLabel: '在文件和文本之间切换' }
}

for (const [locale, keys] of Object.entries(translations)) {
  const path = new URL(`../src/i18n/locales/${locale}.json`, import.meta.url)
  const raw = readFileSync(path, 'utf-8')

  const anchor = '  },\n  "shareScope": {'
  if (!raw.includes(anchor)) {
    throw new Error(`${locale}.json: room→shareScope 경계를 찾지 못했습니다`)
  }

  const insertion =
    `,\n    "filesTab": ${JSON.stringify(keys.filesTab)}` +
    `,\n    "textTab": ${JSON.stringify(keys.textTab)}` +
    `,\n    "mobilePanelLabel": ${JSON.stringify(keys.mobilePanelLabel)}\n  },\n  "shareScope": {`

  // "copied" 값 뒤(닫는 따옴표 바로 다음, 줄바꿈 전)에 삽입해야 하므로
  // anchor 앞의 개행+공백을 제외한 지점을 기준으로 치환한다.
  const updated = raw.replace(/"\n  },\n  "shareScope": \{/, `"${insertion}`)

  if (updated === raw) {
    throw new Error(`${locale}.json: 치환이 적용되지 않았습니다`)
  }

  writeFileSync(path, updated)
  console.log(`${locale}.json updated`)
}
```

- [ ] **Step 2: 스크립트 실행**

Run: `cd frontend && node scripts/tmp-add-mobile-tab-i18n.mjs`
Expected: 21줄의 `<locale>.json updated` 출력, 에러 없음.

- [ ] **Step 3: 결과 검증**

Run: `cd frontend && node -e "const d = require('./src/i18n/locales/en.json'); console.log(JSON.stringify(d.room, null, 2))"`
Expected:
```json
{
  "connecting": "Connecting...",
  "connected": "Connected to room {roomId}.",
  "userCount": "{count} user(s) in the room.",
  "connectedDevices": "Connected devices",
  "copyCode": "Copy Room Code",
  "copied": "Room code copied!",
  "filesTab": "Files",
  "textTab": "Text",
  "mobilePanelLabel": "Switch between files and text"
}
```

모든 21개 파일이 유효한 JSON인지 한 번에 확인:

Run: `cd frontend && for f in src/i18n/locales/*.json; do node -e "require('./$f')" || echo "INVALID: $f"; done`
Expected: 출력 없음(모두 유효한 JSON이면 `INVALID:` 줄이 하나도 없어야 함).

- [ ] **Step 4: 임시 스크립트 삭제**

Run: `cd frontend && rm scripts/tmp-add-mobile-tab-i18n.mjs && rmdir scripts 2>/dev/null; true`

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/i18n/locales/*.json
git commit -m "$(cat <<'EOF'
feat(frontend): add mobile file/text tab i18n keys

Adds room.filesTab / room.textTab / room.mobilePanelLabel to all 21
locales, used by the upcoming mobile tab switcher in RoomScreen.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: DESIGN.md 갱신

**Files:**
- Modify: `DESIGN.md:47-48` (Layout 섹션), `DESIGN.md` Decisions Log 표 (파일 끝부분)

- [ ] **Step 1: Layout 섹션의 그리드 설명을 리스트+분할 설명으로 교체**

`DESIGN.md`에서 다음 줄을 찾는다:

```
- **Approach:** Hybrid — the file/text feed is grid-disciplined (predictable, scannable columns), while the upload entry point is allowed to break the grid with an oversized, playful drop-zone/pill.
- **Grid:** feed cards in a 3-column grid on desktop, collapsing to 1-2 columns on mobile.
```

다음으로 교체한다:

```
- **Approach:** The file feed is a single-column row list (not a card grid); the upload entry point is allowed to break the list with an oversized, playful drop-zone/pill above it.
- **Feed layout:** file list rows: icon/thumbnail + two-line name/meta + always-visible action buttons (no hover-only reveal — must work on touch). On desktop (`md`+), the file list and text feed sit side-by-side (60% file / 40% text). Below `md`, a two-tab switcher ("Files" / "Text") replaces the split, defaulting to the file tab.
```

- [ ] **Step 2: Decisions Log에 항목 추가**

`DESIGN.md`의 `## Decisions Log` 표 마지막 행 뒤에 추가:

```
| 2026-07-02 | 파일 피드를 카드 그리드에서 리스트로, 파일/텍스트를 상하에서 좌우 분할(모바일은 탭)로 변경 | 참고 이미지(리스트형 파일 관리 UI) 기반 사용자 요청 — 리스트가 스캔성이 높고, 좌우 분할이 텍스트 공유를 파일과 동등한 1차 콘텐츠로 격상시킴 |
```

- [ ] **Step 3: 커밋**

```bash
git add DESIGN.md
git commit -m "$(cat <<'EOF'
docs: update DESIGN.md for list feed + split file/text layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: RoomScreen.vue — 좌/우 분할 + 모바일 탭 전환

**Files:**
- Modify: `frontend/src/components/RoomScreen.vue`
- Test: `frontend/src/components/RoomScreen.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/RoomScreen.test.js`의 최상단 import에 i18n을 추가한다 (파일 4번째 줄 `import RoomScreen from './RoomScreen.vue'` 바로 뒤):

```javascript
import i18n from '../i18n/index.js'
```

파일 내 모든 `global: { stubs }` (총 17곳)를 `global: { plugins: [i18n], stubs }`로 일괄 치환한다(문자열이 전부 동일하므로 전체 치환).

파일 맨 끝(`})`  직전, `describe('RoomScreen.vue', ...)` 블록의 마지막 `describe('Props 변경', ...)` 블록 뒤)에 새 describe 블록을 추가한다:

```javascript
  describe('모바일 파일/텍스트 탭 전환', () => {
    it('기본값은 파일 탭이며 파일 섹션만 보이고 텍스트 섹션은 숨겨진다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const sections = wrapper.findAll('section')
      expect(sections).toHaveLength(2)
      expect(sections[0].classes()).not.toContain('hidden')
      expect(sections[1].classes()).toContain('hidden')
    })

    it('role=tablist와 role=tab 버튼 2개를 렌더링한다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
    })

    it('텍스트 탭 클릭 시 텍스트 섹션이 보이고 파일 섹션은 숨겨진다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      await tabs[1].trigger('click')

      const sections = wrapper.findAll('section')
      expect(sections[0].classes()).toContain('hidden')
      expect(sections[1].classes()).not.toContain('hidden')
      expect(tabs[1].attributes('aria-selected')).toBe('true')
      expect(tabs[0].attributes('aria-selected')).toBe('false')
    })

    it('텍스트 탭으로 전환 후 파일 탭을 다시 클릭하면 파일 섹션이 다시 보인다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      await tabs[1].trigger('click')
      await tabs[0].trigger('click')

      const sections = wrapper.findAll('section')
      expect(sections[0].classes()).not.toContain('hidden')
      expect(sections[1].classes()).toContain('hidden')
    })

    it('탭 라벨에 파일/텍스트 개수가 표시된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          files: [{ name: 'a.png', roomId: 'room-shared', url: 'https://example.com/a.png' }],
          texts: [
            { id: '1', content: 'hi', timestamp: Date.now() },
            { id: '2', content: 'yo', timestamp: Date.now() }
          ]
        },
        global: { plugins: [i18n], stubs }
      })

      const tabs = wrapper.findAll('[role="tab"]')
      expect(tabs[0].text()).toContain('1')
      expect(tabs[1].text()).toContain('2')
    })
  })
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd frontend && npx vitest run src/components/RoomScreen.test.js`
Expected: FAIL — `sections`가 0개(현재 RoomScreen.vue에 `<section>` 태그가 없음), `[role="tablist"]`도 존재하지 않음.

- [ ] **Step 3: RoomScreen.vue를 좌/우 분할 + 모바일 탭 구조로 재작성**

`frontend/src/components/RoomScreen.vue` 전체를 다음으로 교체한다:

```vue
<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './AppHeader.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import AppFooter from './AppFooter.vue'

const { t } = useI18n()

const props = defineProps({
  roomId: {
    type: String,
    default: null
  },
  files: {
    type: Array,
    default: () => []
  },
  texts: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  userCount: {
    type: Number,
    default: 1
  },
  devices: {
    type: Array,
    default: () => []
  },
  isConnecting: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  scope: {
    type: String,
    default: 'ip'
  },
  ipRoomDevices: {
    type: Array,
    default: () => []
  },
  globalRoomDevices: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'copy-image',
  'upload-files',
  'download-file',
  'download-parallel',
  'copy-selected-to-clipboard',
  'delete-file',
  'delete-selected',
  'clear-storage',
  'remove-text',
  'clear-all-texts',
  'copy-text',
  'paste-content',
  'load-more',
  'select-scope'
])

const mobilePanel = ref('files')
</script>

<template>
  <div class="max-w-[1600px] mx-auto p-6 text-text-primary">
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
      :devices="devices"
    />

    <ShareScopeTabs
      :scope="scope"
      :ip-devices="ipRoomDevices"
      :global-devices="globalRoomDevices"
      @select="$emit('select-scope', $event)"
    />

    <main class="bg-surface rounded-xl p-8 border border-border">
      <!-- 모바일 전용 파일/텍스트 탭 (md 이상에서는 숨김) -->
      <div
        class="flex md:hidden gap-2 mb-6 p-1 w-fit rounded-full border border-border bg-background"
        role="tablist"
        :aria-label="t('room.mobilePanelLabel')"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mobilePanel === 'files'"
          class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
          :class="mobilePanel === 'files' ? 'bg-primary text-white' : 'text-text-secondary'"
          @click="mobilePanel = 'files'"
        >
          {{ t('room.filesTab') }} ({{ files.length }})
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mobilePanel === 'text'"
          class="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
          :class="mobilePanel === 'text' ? 'bg-primary text-white' : 'text-text-secondary'"
          @click="mobilePanel = 'text'"
        >
          {{ t('room.textTab') }} ({{ texts.length }})
        </button>
      </div>

      <div class="flex flex-col md:flex-row gap-8">
        <!-- 파일 컬럼: 데스크톱 60%, 모바일에서는 파일 탭 활성 시에만 표시 -->
        <section :class="['md:w-[60%] md:block', { hidden: mobilePanel !== 'files' }]">
          <FileGallery
            :files="files"
            :room-id="roomId"
            :is-loading="isLoading"
            :has-more="hasMore"
            :scope="scope"
            @copy-image="$emit('copy-image', $event)"
            @download-file="$emit('download-file', $event)"
            @download-parallel="$emit('download-parallel', $event)"
            @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
            @delete-file="$emit('delete-file', $event)"
            @delete-selected="$emit('delete-selected', $event)"
            @clear-storage="$emit('clear-storage')"
            @upload-files="$emit('upload-files', $event)"
            @select-scope="$emit('select-scope', $event)"
            @paste-content="$emit('paste-content')"
            @load-more="$emit('load-more')"
          />
        </section>

        <!-- 텍스트 컬럼: 데스크톱 40%, 모바일에서는 텍스트 탭 활성 시에만 표시 -->
        <section :class="['md:w-[40%] md:block', { hidden: mobilePanel !== 'text' }]">
          <TextShareBox
            :texts="texts"
            @remove-text="$emit('remove-text', $event)"
            @clear-all="$emit('clear-all-texts')"
            @copy-text="$emit('copy-text', $event)"
          />
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd frontend && npx vitest run src/components/RoomScreen.test.js`
Expected: 모든 테스트 PASS (기존 테스트 + 새 "모바일 파일/텍스트 탭 전환" 4개).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/RoomScreen.vue frontend/src/components/RoomScreen.test.js
git commit -m "$(cat <<'EOF'
feat(frontend): split RoomScreen into file/text columns with mobile tabs

Desktop shows file (60%) and text (40%) columns side-by-side; below
the md breakpoint a two-tab switcher replaces the split, defaulting
to the file tab.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: FileGallery.vue — 그리드 컨테이너를 리스트로 전환, 드롭존 분리

**Files:**
- Modify: `frontend/src/components/FileGallery.vue`
- Test: `frontend/src/components/FileGallery.test.js` (기존 테스트로 회귀 검증만, 신규 케이스 없음 — 스텁 기반이라 그리드/리스트 여부에 의존하지 않음)

- [ ] **Step 1: 변경 전 기존 테스트가 통과함을 확인 (베이스라인)**

Run: `cd frontend && npx vitest run src/components/FileGallery.test.js`
Expected: PASS (변경 전 상태).

- [ ] **Step 2: 템플릿의 그리드 컨테이너를 리스트 컨테이너로 교체**

`frontend/src/components/FileGallery.vue`의 `<template>` 블록에서 다음 부분을 찾는다:

```html
    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
      <!-- 파일 업로드 카드 (항상 표시) -->
      <FileUploadSection
        :scope="scope"
        @upload-files="$emit('upload-files', $event)"
        @select-scope="$emit('select-scope', $event)"
      />

      <!-- 붙여넣기 카드 (항상 표시) -->
      <PasteSection @paste-content="$emit('paste-content')" />

      <!-- 로딩 중일 때 스피너 표시 -->
      <div v-if="isLoading" class="col-span-full flex justify-center py-16">
        <div class="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>

      <!-- 업로드된 파일 카드들 (로딩 중이 아닐 때) -->
      <template v-else>
        <TransitionGroup name="card-land" @before-enter="onCardBeforeEnter">
          <FileCard
            v-for="file in files"
            :key="fileKey(file)"
            :file="file"
            :is-selected="selectedFiles.has(fileKey(file))"
            @copy-image="$emit('copy-image', file.url)"
            @toggle-selection="toggleFileSelection(file)"
            @download-file="$emit('download-file', file)"
            @delete-file="$emit('delete-file', file)"
          />
        </TransitionGroup>
      </template>
    </div>
```

다음으로 교체한다:

```html
    <!-- 업로드/붙여넣기 드롭존 (리스트 밖 상단, 항상 표시) -->
    <div class="flex flex-col sm:flex-row gap-4 mb-6">
      <div class="flex-1">
        <FileUploadSection
          :scope="scope"
          @upload-files="$emit('upload-files', $event)"
          @select-scope="$emit('select-scope', $event)"
        />
      </div>
      <div class="flex-1">
        <PasteSection @paste-content="$emit('paste-content')" />
      </div>
    </div>

    <!-- 로딩 중일 때 스피너 표시 -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <div class="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
    </div>

    <!-- 파일 리스트 (로딩 중이 아닐 때) -->
    <div v-else class="flex flex-col gap-2">
      <TransitionGroup name="card-land" @before-enter="onCardBeforeEnter">
        <FileCard
          v-for="file in files"
          :key="fileKey(file)"
          :file="file"
          :is-selected="selectedFiles.has(fileKey(file))"
          @copy-image="$emit('copy-image', file.url)"
          @toggle-selection="toggleFileSelection(file)"
          @download-file="$emit('download-file', file)"
          @delete-file="$emit('delete-file', file)"
        />
      </TransitionGroup>
    </div>
```

`<script setup>`은 변경하지 않는다 — `fileKey`, `selectedFiles`, `toggleFileSelection` 등 로직 전부 그대로 재사용된다.

- [ ] **Step 3: 테스트 실행하여 회귀 없음 확인**

Run: `cd frontend && npx vitest run src/components/FileGallery.test.js`
Expected: PASS (Step 1과 동일하게 전부 통과 — 스텁 기반 테스트라 DOM 구조 변경에 영향받지 않음).

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/FileGallery.vue
git commit -m "$(cat <<'EOF'
feat(frontend): convert file gallery from card grid to row list

Upload/paste dropzones move above the list as their own row instead
of sharing the grid with file cards. Card grid becomes a vertical
list container; FileCard itself is restyled as a list row in a
follow-up commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: FileCard.vue — 카드에서 리스트 행으로 재작성

**Files:**
- Modify: `frontend/src/components/FileCard.vue`

`<script setup>` 블록(props, emits, `fileMetadata` computed, `handleDownload`/`handleDelete`/`openQRModal`/`closeQRModal`/`handleShare`)은 전혀 변경하지 않는다 — 기존 로직을 그대로 재사용한다. `<template>`과 `<style scoped>`만 교체한다.

- [ ] **Step 1: `<template>` 블록 전체 교체**

`frontend/src/components/FileCard.vue`의 `<template>...</template>` 전체를 다음으로 교체한다:

```html
<template>
  <div
    class="file-row flex items-center gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer transition-colors duration-200 hover:border-primary/50"
    :class="{
      'bg-primary/5 border-l-4 border-l-primary': isSelected
    }"
    @click="$emit('copy-image', file.url)"
  >
    <!-- 체크박스 -->
    <input
      type="checkbox"
      class="w-5 h-5 cursor-pointer accent-primary flex-shrink-0"
      :checked="isSelected"
      @click.stop
      @change="$emit('toggle-selection', file)"
    />

    <!-- 이미지 타입: 썸네일 -->
    <img
      v-if="fileMetadata.isImage"
      :src="file.url"
      :alt="file.name"
      loading="lazy"
      class="w-10 h-10 rounded-md object-cover flex-shrink-0"
    />

    <!-- 비이미지 타입: 컬러 아이콘 -->
    <div
      v-else
      class="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"
    >
      <span class="text-xl" :title="fileMetadata.type">{{ fileMetadata.icon }}</span>
    </div>

    <!-- 파일 정보: 1줄 파일명 + 2번째 줄 용량·시간 -->
    <div class="flex-1 min-w-0">
      <div class="file-name-container overflow-hidden">
        <div class="file-name-wrapper">
          <span class="file-name text-sm font-medium text-text-primary whitespace-nowrap">
            {{ file.name }}
          </span>
        </div>
      </div>
      <p class="text-xs text-text-secondary mt-0.5">
        {{ fileMetadata.size }} · {{ fileMetadata.uploadTime }}
      </p>
    </div>

    <!-- 액션 버튼 (항상 노출, 호버 의존 없음) -->
    <div class="flex gap-2 flex-shrink-0">
      <!-- 공유 버튼 (Web Share API 지원 시에만 표시) -->
      <button
        v-if="canShare"
        class="w-8 h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
        @click="handleShare"
        :title="t('file.share')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>

      <!-- QR 코드 버튼 -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
        @click="openQRModal"
        :title="t('room.qrShareTitle')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>

      <!-- 다운로드 버튼 -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
        @click="handleDownload"
        :title="t('file.download')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      <!-- 삭제 버튼 -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-full border border-border bg-background text-red-400 transition-all duration-200 hover:bg-red-500 hover:text-white hover:scale-110"
        @click="handleDelete"
        :title="t('file.delete')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>

    <!-- QR 코드 모달 (Teleport로 body로 이동) -->
    <Teleport to="body">
      <FileQRCodeModal
        :file="file"
        :is-open="isQRModalOpen"
        @close="closeQRModal"
      />
    </Teleport>
  </div>
</template>
```

- [ ] **Step 2: `<style scoped>` 블록 교체 (마퀴 애니메이션 트리거를 `.relative`에서 `.file-row`로 변경)**

`frontend/src/components/FileCard.vue`의 `<style scoped>...</style>` 전체를 다음으로 교체한다:

```html
<style scoped>
/* 파일명 마퀴 애니메이션 */
.file-name-container {
  position: relative;
  width: 100%;
}

.file-name-wrapper {
  display: inline-block;
  position: relative;
  max-width: 100%;
}

.file-name {
  display: inline-block;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}

/* 호버 시 마퀴 애니메이션 */
.file-row:hover .file-name-wrapper {
  animation: marquee 5s linear infinite;
}

.file-row:hover .file-name {
  text-overflow: unset;
  overflow: visible;
  max-width: none;
}

@keyframes marquee {
  0% {
    transform: translateX(0%);
  }
  10% {
    transform: translateX(0%);
  }
  90% {
    transform: translateX(calc(-100% + 180px));
  }
  100% {
    transform: translateX(calc(-100% + 180px));
  }
}
</style>
```

- [ ] **Step 3: 전체 프론트엔드 테스트 실행하여 회귀 없음 확인**

Run: `cd frontend && npx vitest run`
Expected: 모든 기존 테스트 PASS (FileCard 전용 테스트 파일은 없으므로, `FileGallery.test.js`/`RoomScreen.test.js`를 포함한 전체 스위트가 통과하는지로 검증).

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/FileCard.vue
git commit -m "$(cat <<'EOF'
feat(frontend): restyle FileCard as a list row instead of a grid card

Checkbox, thumbnail/icon, two-line name+meta, and always-visible
action buttons laid out horizontally. Image files show a real
thumbnail instead of a color icon. Selection state now uses a left
accent border instead of a full outline (fits row layout better).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 수동 QA (개발 서버로 실제 화면 확인)

**Files:** 없음 (검증만, 코드 변경 없음)

- [ ] **Step 1: 프론트엔드 개발 서버 실행**

Run: `cd frontend && npm run dev`
Expected: `http://localhost:5173`에서 Vite dev 서버 기동.

- [ ] **Step 2: 백엔드 개발 서버 실행 (파일/텍스트 표시를 위해 필요)**

Run: `cd backend && npm run dev`
Expected: `http://localhost:3001`에서 서버 기동, `.env`에 R2 자격증명이 없으면 업로드는 실패할 수 있으나 화면 레이아웃 확인은 가능.

- [ ] **Step 3: 데스크톱 폭에서 확인**

브라우저(또는 Claude Preview 도구)로 `http://localhost:5173` 접속, 뷰포트 1280px 이상:
- 파일 리스트가 카드 그리드가 아닌 세로 리스트인지 확인.
- 파일 컬럼(좌, 약 60%)과 텍스트 컬럼(우, 약 40%)이 나란히 보이는지 확인.
- 모바일 탭 바(`파일`/`텍스트`)가 보이지 않는지 확인.
- 파일을 몇 개 업로드(또는 목업 데이터)해 체크박스 다중 선택 + Ctrl+C 복사, 공유/QR/다운로드/삭제 버튼, 이미지 파일 썸네일 vs 비이미지 컬러 아이콘, 긴 파일명 호버 시 마퀴 애니메이션, 리스트 진입 시 stagger 애니메이션을 확인.

- [ ] **Step 4: 모바일 폭에서 확인**

뷰포트를 375px(모바일 프리셋)로 변경:
- `파일 (N)` / `텍스트 (N)` 탭 바가 보이는지 확인.
- 기본값이 `파일` 탭인지 확인.
- `텍스트` 탭 클릭 시 파일 목록이 사라지고 텍스트 목록만 보이는지, 다시 `파일` 탭 클릭 시 원복되는지 확인.
- 업로드/붙여넣기 드롭존이 세로로 쌓이는지(반응형) 확인.

- [ ] **Step 5: 다크 모드 확인**

다크 모드로 전환 후 리스트 행 배경/테두리/선택 상태(좌측 accent border) 대비가 DESIGN.md 다크 팔레트(`background #1C1917`, `surface #262220`, `border #3A3430`)와 충돌 없이 잘 보이는지 확인.

- [ ] **Step 6: 콘솔 에러 확인**

브라우저 콘솔에 Vue 경고/에러가 없는지 확인(특히 `RoomScreen.vue`에서 `useI18n()` 관련 에러가 없는지 — `App.vue`가 i18n 플러그인을 전역 설치하고 있어야 함, 기존에 이미 다른 컴포넌트들이 `useI18n()`을 문제없이 쓰고 있으므로 정상 동작 예상).
