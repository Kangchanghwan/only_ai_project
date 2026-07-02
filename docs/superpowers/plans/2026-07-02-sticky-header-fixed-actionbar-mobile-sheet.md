# 스티키 헤더 + 하단 고정 액션바 + 모바일 파일 액션 시트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룸 화면에서 (1) 헤더를 스크롤 시 상단에 고정하고, (2) 파일 액션바(전체선택/다운로드/QR/삭제/초기화)를 하단에 5열 그리드로 고정하며, (3) 모바일 파일 행의 작은 아이콘 버튼들을 "⋯" 트리거 + 하단 시트로 대체한다.

**Architecture:** 3개 기존 Vue 컴포넌트(`AppHeader.vue`, `DownloadControls.vue`, `FileCard.vue`)의 위치/레이아웃 클래스만 변경하고 기존 props/emits/핸들러 로직은 그대로 재사용한다. `RoomScreen.vue`는 새로 고정된 하단 바가 콘텐츠를 가리지 않도록 조건부 padding만 추가한다. 새 i18n 키 1개(`file.moreActions`)를 21개 로케일 파일에 추가한다.

**Tech Stack:** Vue 3 Composition API (`<script setup>`, plain JS), Tailwind CSS 4 유틸리티 클래스, Vitest + @vue/test-utils.

**설계 문서:** [docs/superpowers/specs/2026-07-02-sticky-header-fixed-actionbar-mobile-sheet-design.md](../specs/2026-07-02-sticky-header-fixed-actionbar-mobile-sheet-design.md)

---

## Task 1: AppHeader 스티키 상단 고정

**Files:**
- Modify: `frontend/src/components/AppHeader.vue:55`
- Test: `frontend/src/components/AppHeader.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/AppHeader.test.js`의 `describe('AppHeader.vue', ...)` 블록 안, 마지막 `it(...)` 다음에 추가:

```js
  it('헤더는 스크롤 시 상단에 고정되도록 sticky 클래스를 갖는다', async () => {
    const wrapper = await mountReady()
    const header = wrapper.find('header')
    expect(header.classes()).toContain('sticky')
    expect(header.classes()).toContain('top-0')
    expect(header.classes()).toContain('z-40')
    expect(header.classes()).toContain('bg-background')
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/AppHeader.test.js`
Expected: FAIL — `header` 엘리먼트에 `sticky`/`top-0`/`z-40`/`bg-background` 클래스가 없어서 `toContain` 단언이 실패.

- [ ] **Step 3: 최소 구현**

`frontend/src/components/AppHeader.vue:55`의 `<header>` 태그를 다음으로 교체:

```html
  <header class="sticky top-0 z-40 bg-background border-b border-border py-3 flex justify-between items-center mb-8 flex-wrap gap-4">
```

(기존 `flex justify-between items-center mb-8 flex-wrap gap-4`는 그대로 유지하고 앞에 `sticky top-0 z-40 bg-background border-b border-border py-3`만 추가한다. 헤더 내부 마크업은 전혀 변경하지 않는다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/AppHeader.test.js`
Expected: PASS (전체 6개 테스트, 신규 1개 포함)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/AppHeader.vue frontend/src/components/AppHeader.test.js
git commit -m "feat(frontend): pin AppHeader to top of viewport on scroll"
```

---

## Task 2: DownloadControls 하단 고정 5열 액션바

**Files:**
- Modify: `frontend/src/components/DownloadControls.vue`
- Test: `frontend/src/components/DownloadControls.test.js` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/DownloadControls.test.js` 신규 생성:

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DownloadControls from './DownloadControls.vue'
import i18n from '../i18n/index.js'

const mountOptions = { global: { plugins: [i18n] } }

function mountControls(props = {}) {
  return mount(DownloadControls, {
    props: { selectedCount: 0, totalCount: 3, allSelected: false, ...props },
    ...mountOptions
  })
}

describe('DownloadControls.vue - 하단 고정 5열 레이아웃', () => {
  it('루트 엘리먼트는 화면 하단에 고정된 5열 그리드다', () => {
    const wrapper = mountControls()
    const root = wrapper.element
    expect(root.className).toContain('fixed')
    expect(root.className).toContain('bottom-0')
    expect(root.className).toContain('z-40')
    expect(root.className).toContain('grid-cols-5')
  })

  it('버튼 5개(전체선택/다운로드/QR/선택삭제/초기화)를 렌더링한다', () => {
    const wrapper = mountControls()
    expect(wrapper.findAll('button')).toHaveLength(5)
  })

  it('선택된 파일이 없으면 다운로드/QR/선택삭제 버튼이 비활성화된다', () => {
    const wrapper = mountControls({ selectedCount: 0 })
    const buttons = wrapper.findAll('button')
    expect(buttons[1].attributes('disabled')).toBeDefined() // 다운로드
    expect(buttons[2].attributes('disabled')).toBeDefined() // QR
    expect(buttons[3].attributes('disabled')).toBeDefined() // 선택 삭제
  })

  it('전체 선택 버튼 클릭 시 toggle-select-all을 emit한다', async () => {
    const wrapper = mountControls()
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('toggle-select-all')).toBeTruthy()
  })

  it('선택된 파일이 있으면 다운로드/QR/선택삭제 버튼 클릭 시 각각의 이벤트를 emit한다', async () => {
    const wrapper = mountControls({ selectedCount: 2 })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('download-parallel')).toBeTruthy()
    await buttons[2].trigger('click')
    expect(wrapper.emitted('show-multi-qr')).toBeTruthy()
    await buttons[3].trigger('click')
    expect(wrapper.emitted('delete-selected')).toBeTruthy()
  })

  it('저장소 초기화 버튼 클릭 시 clear-storage를 emit한다', async () => {
    const wrapper = mountControls()
    await wrapper.findAll('button')[4].trigger('click')
    expect(wrapper.emitted('clear-storage')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/DownloadControls.test.js`
Expected: FAIL — 현재 루트는 `flex ... flex-wrap` 클래스만 있어 `fixed`/`bottom-0`/`z-40`/`grid-cols-5`가 없음.

- [ ] **Step 3: 최소 구현**

`frontend/src/components/DownloadControls.vue`의 `<template>` 전체를 다음으로 교체:

```html
<template>
  <div class="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-blue-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="totalCount === 0"
      @click="$emit('toggle-select-all')"
      :title="allSelected ? t('download.deselectAllHint') : t('download.selectAllHint')"
    >
      <span class="text-base leading-none">{{ allSelected ? '✓' : '☐' }}</span>
      <span class="text-[11px] leading-tight text-center">
        {{ allSelected ? t('download.deselectAll') : t('download.selectAll') }} ({{ selectedCount }}/{{ totalCount }})
      </span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-green-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('download-parallel')"
      :title="t('download.downloadHint')"
    >
      <span class="text-base leading-none">📥</span>
      <span class="text-[11px] leading-tight text-center">{{ t('download.downloadSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-purple-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('show-multi-qr')"
      :title="t('download.qrCodeHint')"
    >
      <span class="text-base leading-none">📱</span>
      <span class="text-[11px] leading-tight text-center">{{ t('download.qrCode') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-red-600 disabled:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="selectedCount === 0"
      @click="$emit('delete-selected')"
    >
      <span class="text-base leading-none">🗑️</span>
      <span class="text-[11px] leading-tight text-center">{{ t('file.deleteSelected') }} ({{ selectedCount }})</span>
    </button>
    <button
      class="flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-black/5 transition-colors"
      :disabled="totalCount === 0"
      @click="$emit('clear-storage')"
    >
      <span class="text-base leading-none">⚠️</span>
      <span class="text-[11px] leading-tight text-center">{{ t('file.clearStorage') }}</span>
    </button>
  </div>
</template>
```

`<script setup>` 블록(props/emits 정의)은 변경하지 않는다. 기존 `💡 tipSequential` 안내 텍스트는 5열 고정 바에 넣을 자리가 없으므로 제거한다(버튼 emit/props는 전부 동일하게 유지되므로 기능 손실 없음 — 설계 문서에서 승인된 컴팩트 레이아웃의 트레이드오프).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/DownloadControls.test.js`
Expected: PASS (6개 테스트 전부)

- [ ] **Step 5: FileGallery 통합 테스트가 깨지지 않는지 확인**

Run: `cd frontend && npx vitest run src/components/FileGallery.test.js`
Expected: PASS — `FileGallery.test.js`는 `DownloadControls`를 stub 처리하므로 실제 마크업 변경의 영향을 받지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/DownloadControls.vue frontend/src/components/DownloadControls.test.js
git commit -m "feat(frontend): pin file action bar to bottom as 5-column grid"
```

---

## Task 3: RoomScreen 하단 여백으로 고정 바 가림 방지

**Files:**
- Modify: `frontend/src/components/RoomScreen.vue:80`
- Test: `frontend/src/components/RoomScreen.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/RoomScreen.test.js`는 이미 파일 상단에 `import RoomScreen from './RoomScreen.vue'`, `import i18n from '../i18n/index.js'`, 그리고 `AppHeader`/`ShareScopeTabs`/`FileGallery`/`TextShareBox`/`AppFooter`를 stub하는 `stubs` 객체와 `defaultProps`(`files: []` 포함)를 정의하고 있다. 이를 그대로 재사용해, 파일 끝(마지막 `describe('모바일 파일/텍스트 탭 전환', ...)` 블록 바로 다음, 최상위 `describe('RoomScreen.vue', ...)`의 닫는 `})` 바로 안쪽)에 새 `describe`를 추가한다:

```js
  describe('하단 고정 액션바 여백', () => {
    it('파일이 있으면 루트 컨테이너에 pb-24가 적용된다', () => {
      const wrapper = mount(RoomScreen, {
        props: {
          ...defaultProps,
          files: [{ name: 'a.png', roomId: 'room-shared', url: 'https://example.com/a.png', size: 1, created: '2026-01-01T00:00:00.000Z' }]
        },
        global: { plugins: [i18n], stubs }
      })
      expect(wrapper.element.className).toContain('pb-24')
      expect(wrapper.element.className).not.toContain('pb-6')
    })

    it('파일이 없으면 pb-6을 유지하고 pb-24는 적용하지 않는다', () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { plugins: [i18n], stubs }
      })
      expect(wrapper.element.className).toContain('pb-6')
      expect(wrapper.element.className).not.toContain('pb-24')
    })
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/RoomScreen.test.js`
Expected: FAIL — 현재 루트 클래스는 고정 `"max-w-[1600px] mx-auto p-6 text-text-primary"`라 `pb-24`/`pb-6` 어느 쪽도 포함하지 않음.

- [ ] **Step 3: 최소 구현**

`frontend/src/components/RoomScreen.vue:80`의 루트 `<div>`를 다음으로 교체:

```html
  <div :class="['max-w-[1600px] mx-auto pt-6 px-6 text-text-primary', files.length > 0 ? 'pb-24' : 'pb-6']">
```

(기존 `p-6`을 `pt-6 px-6`으로 분리하고, 하단 padding만 파일 존재 여부에 따라 `pb-24`/`pb-6`로 동적으로 전환한다. `p-6`과 `pb-24`를 동시에 클래스에 넣으면 Tailwind 생성 CSS 순서에 따라 어느 쪽이 이길지 불명확해지므로 반드시 이렇게 분리한다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/RoomScreen.test.js`
Expected: PASS (기존 테스트 전부 + 신규 2개)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/RoomScreen.vue frontend/src/components/RoomScreen.test.js
git commit -m "feat(frontend): add bottom padding so fixed action bar doesn't cover content"
```

---

## Task 4: `file.moreActions` i18n 키 21개 로케일에 추가

**Files:**
- Modify: `frontend/src/i18n/locales/{ar,cs,de,en,es,fa,fr,hu,id,ja,ko,nl,pl,pt,ro,ru,sv,tr,uk,vi,zh}.json`
- Test: `frontend/src/i18n/i18n.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/i18n/i18n.test.js` 파일 끝에 추가:

```js
describe('i18n file.moreActions', () => {
  it('모든 로케일 파일에 file.moreActions 문자열이 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.file, `${path}에 file 섹션 없음`).toBeTruthy()
      expect(typeof json.file.moreActions, `${path}에 file.moreActions 없음`).toBe('string')
      expect(json.file.moreActions.length, `${path} file.moreActions 비어있음`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: FAIL — 어떤 로케일 파일에도 `file.moreActions` 키가 없음.

- [ ] **Step 3: 각 로케일 파일의 `file` 섹션에 `moreActions` 키 추가**

각 파일의 최상위 `"file"` 객체 안, 마지막 키(`"clearStorage"`) 다음 줄에 `"moreActions"` 키를 추가한다(쉼표 위치 주의 — `clearStorage` 줄 끝에 쉼표를 붙이고 새 줄을 마지막에 넣는다). 언어별 값:

| 파일 | 추가할 값 |
|---|---|
| `ko.json` | `"moreActions": "더 보기"` |
| `en.json` | `"moreActions": "More"` |
| `ar.json` | `"moreActions": "المزيد"` |
| `cs.json` | `"moreActions": "Více"` |
| `de.json` | `"moreActions": "Mehr"` |
| `es.json` | `"moreActions": "Más"` |
| `fa.json` | `"moreActions": "بیشتر"` |
| `fr.json` | `"moreActions": "Plus"` |
| `hu.json` | `"moreActions": "Több"` |
| `id.json` | `"moreActions": "Lainnya"` |
| `ja.json` | `"moreActions": "その他"` |
| `nl.json` | `"moreActions": "Meer"` |
| `pl.json` | `"moreActions": "Więcej"` |
| `pt.json` | `"moreActions": "Mais"` |
| `ro.json` | `"moreActions": "Mai multe"` |
| `ru.json` | `"moreActions": "Ещё"` |
| `sv.json` | `"moreActions": "Mer"` |
| `tr.json` | `"moreActions": "Diğer"` |
| `uk.json` | `"moreActions": "Ще"` |
| `vi.json` | `"moreActions": "Thêm"` |
| `zh.json` | `"moreActions": "更多"` |

예시 (`ko.json`의 `file` 섹션, 변경 전/후):

```diff
   "delete": "삭제",
   "deleteSelected": "선택 삭제",
-  "clearStorage": "저장소 초기화"
+  "clearStorage": "저장소 초기화",
+  "moreActions": "더 보기"
 },
```

동일한 패턴(`clearStorage` 줄 끝에 쉼표 추가 + `moreActions` 줄 추가)을 21개 파일 모두에 적용한다. `file` 섹션의 키 순서나 다른 키의 값은 건드리지 않는다.

- [ ] **Step 4: JSON 유효성 확인**

Run: `cd frontend && node -e "const glob = require('fs').readdirSync('src/i18n/locales'); for (const f of glob) { JSON.parse(require('fs').readFileSync('src/i18n/locales/'+f)); } console.log('all valid')"`
Expected: `all valid` 출력 (JSON 문법 오류 없음 — 쉼표 실수 시 여기서 바로 잡아낼 수 있다)

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: PASS (기존 2개 + 신규 1개, 총 3개)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/i18n/locales/*.json frontend/src/i18n/i18n.test.js
git commit -m "feat(i18n): add file.moreActions key across all 21 locales"
```

---

## Task 5: FileCard 모바일 "⋯" 액션 시트

**Files:**
- Modify: `frontend/src/components/FileCard.vue`
- Test: `frontend/src/components/FileCard.test.js` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/FileCard.test.js` 신규 생성:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// t()가 키를 그대로 반환하도록 mock — room.qrShareTitle처럼 로케일 파일에
// 실제 값이 없는(사전 존재하는 gap, 이번 작업 범위 밖) 키가 섞여 있어도
// 테스트가 실제 번역 문자열에 의존하지 않도록 한다 (AppHeader.test.js와 동일한 패턴).
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import FileCard from './FileCard.vue'

const file = {
  name: 'photo.png',
  roomId: 'room-shared',
  url: 'https://example.com/photo.png',
  size: 12345,
  created: '2026-01-01T00:00:00.000Z'
}

const stubs = {
  FileQRCodeModal: {
    name: 'FileQRCodeModal',
    props: ['file', 'isOpen'],
    template: '<div class="qr-modal-stub" />'
  }
}

function mountCard(props = {}) {
  return mount(FileCard, {
    props: { file, isSelected: false, ...props },
    global: { stubs }
  })
}

describe('FileCard.vue - 데스크톱 액션 버튼 행 (sm 이상)', () => {
  it('아이콘 버튼 행에는 hidden sm:flex 클래스가 있다', () => {
    const wrapper = mountCard()
    const actionsRow = wrapper.find('.file-row > div.gap-1.flex-shrink-0')
    expect(actionsRow.classes()).toContain('hidden')
    expect(actionsRow.classes()).toContain('sm:flex')
  })
})

describe('FileCard.vue - 모바일 더보기 버튼 (sm 미만)', () => {
  let wrapper

  beforeEach(() => {
    wrapper = mountCard()
  })

  it('더보기 트리거 버튼은 flex sm:hidden 클래스를 갖는다', () => {
    const trigger = wrapper.find('[aria-label="file.moreActions"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.classes()).toContain('flex')
    expect(trigger.classes()).toContain('sm:hidden')
  })

  it('더보기 버튼 클릭 시 액션 시트가 열린다', async () => {
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(true)
  })

  it('시트에서 다운로드 클릭 시 download-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-download').trigger('click')
    expect(wrapper.emitted('download-file')).toBeTruthy()
    expect(wrapper.emitted('download-file')[0]).toEqual([file])
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('시트에서 삭제 클릭 시 delete-file을 emit하고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-delete').trigger('click')
    expect(wrapper.emitted('delete-file')).toBeTruthy()
    expect(wrapper.emitted('delete-file')[0]).toEqual([file])
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('시트에서 QR 코드 클릭 시 QR 모달이 열리고 시트가 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet .sheet-qr').trigger('click')
    const modal = wrapper.findComponent({ name: 'FileQRCodeModal' })
    expect(modal.props('isOpen')).toBe(true)
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
  })

  it('배경 클릭 시 아무 이벤트도 emit하지 않고 시트만 닫힌다', async () => {
    await wrapper.find('[aria-label="file.moreActions"]').trigger('click')
    await wrapper.find('.file-actions-sheet').trigger('click')
    expect(wrapper.find('.file-actions-sheet').exists()).toBe(false)
    expect(wrapper.emitted('download-file')).toBeFalsy()
    expect(wrapper.emitted('delete-file')).toBeFalsy()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/FileCard.test.js`
Expected: FAIL — `[aria-label="file.moreActions"]` 트리거 버튼과 `.file-actions-sheet`가 아직 존재하지 않음.

- [ ] **Step 3: 최소 구현 — `<script setup>`에 시트 상태/핸들러 추가**

`frontend/src/components/FileCard.vue`의 `<script setup>` 블록에서, 기존 `function closeQRModal() { isQRModalOpen.value = false }` 함수 바로 다음에 추가:

```js
// 모바일 더보기 액션 시트 상태 관리
const isActionsSheetOpen = ref(false)

function openActionsSheet(event) {
  event.stopPropagation()
  isActionsSheetOpen.value = true
}

function closeActionsSheet() {
  isActionsSheetOpen.value = false
}

function handleActionsSheetBackdropClick(event) {
  if (event.target === event.currentTarget) {
    closeActionsSheet()
  }
}

function handleSheetShare(event) {
  handleShare(event)
  closeActionsSheet()
}

function handleSheetQR(event) {
  openQRModal(event)
  closeActionsSheet()
}

function handleSheetDownload(event) {
  handleDownload(event)
  closeActionsSheet()
}

function handleSheetDelete(event) {
  handleDelete(event)
  closeActionsSheet()
}
```

- [ ] **Step 4: 최소 구현 — 템플릿 변경**

`frontend/src/components/FileCard.vue`의 `<!-- 액션 버튼 (항상 노출, 호버 의존 없음) -->` 주석이 붙은 `<div class="flex gap-1 sm:gap-2 flex-shrink-0">`(기존 122번째 줄 부근)를 다음으로 교체:

```html
    <!-- 액션 버튼: sm 이상에서는 아이콘 행 그대로, sm 미만에서는 더보기 트리거로 대체 -->
    <div class="hidden sm:flex gap-1 sm:gap-2 flex-shrink-0">
      <!-- 공유 버튼 (Web Share API 지원 시에만 표시) -->
      <button
        v-if="canShare"
        class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
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
        class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
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
        class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-border bg-background text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:scale-110"
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
        class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-border bg-background text-red-400 transition-all duration-200 hover:bg-red-500 hover:text-white hover:scale-110"
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

    <!-- 모바일 더보기 버튼 (sm 미만에서만 노출) -->
    <button
      class="flex sm:hidden w-9 h-9 items-center justify-center rounded-full border border-border bg-background text-text-primary flex-shrink-0"
      @click="openActionsSheet"
      :title="t('file.moreActions')"
      :aria-label="t('file.moreActions')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>
```

그 다음, 기존 `<!-- QR 코드 모달 (Teleport로 body로 이동) -->` 블록(기존 184~190번째 줄) 바로 다음에 새 Teleport 블록 추가:

```html
    <!-- 모바일 더보기 액션 시트 (Teleport로 body로 이동) -->
    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="isActionsSheetOpen"
          class="file-actions-sheet fixed inset-0 bg-black/70 z-50 flex items-end"
          @click="handleActionsSheetBackdropClick"
        >
          <div class="w-full bg-surface rounded-t-2xl p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]" @click.stop>
            <button
              v-if="canShare"
              class="sheet-share w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetShare"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span class="text-sm font-medium">{{ t('file.share') }}</span>
            </button>
            <button
              class="sheet-qr w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetQR"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span class="text-sm font-medium">{{ t('room.qrShareTitle') }}</span>
            </button>
            <button
              class="sheet-download w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-black/5 text-text-primary"
              @click="handleSheetDownload"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span class="text-sm font-medium">{{ t('file.download') }}</span>
            </button>
            <button
              class="sheet-delete w-full flex items-center gap-3 px-4 min-h-[48px] rounded-lg hover:bg-red-500/10 text-red-500"
              @click="handleSheetDelete"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              <span class="text-sm font-medium">{{ t('file.delete') }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
```

마지막으로 `<style scoped>` 블록의 `@keyframes marquee { ... }` 규칙(파일 끝, `</style>` 바로 앞) 다음에 시트 슬라이드업 트랜지션 CSS 추가:

```css

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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/FileCard.test.js`
Expected: PASS (8개 테스트 전부)

- [ ] **Step 6: FileGallery 통합 테스트가 깨지지 않는지 확인**

Run: `cd frontend && npx vitest run src/components/FileGallery.test.js`
Expected: PASS — `FileGallery.test.js`는 `FileCard`를 stub 처리하므로 영향 없음.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/FileCard.vue frontend/src/components/FileCard.test.js
git commit -m "feat(frontend): replace mobile file-row icon buttons with a more-actions sheet"
```

---

## Task 6: DESIGN.md 갱신

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Layout 섹션에 문장 추가**

`DESIGN.md`의 `## Layout` 섹션, `**Scope tabs:** ...` 줄 다음에 새 줄 추가:

```markdown
- **Sticky/fixed chrome:** the header (`AppHeader`) sticks to the top of the viewport on scroll (`sticky top-0`); the file-list action bar (select-all/download/QR/delete/reset) sticks to the bottom of the viewport as an evenly-spaced 5-column bar, always visible whenever the file list is showing. On mobile (`<sm`), per-file row actions collapse behind a single "⋯" trigger that opens a bottom action sheet, instead of the row's inline icon buttons (which remain inline at `sm` and above).
```

- [ ] **Step 2: Decisions Log에 행 추가**

`DESIGN.md`의 `## Decisions Log` 표 마지막 행(`| 2026-07-02 | 파일 피드를 카드 그리드에서... |`) 다음에 추가:

```markdown
| 2026-07-02 | 모바일 파일 행 액션을 아이콘 버튼 4개 상시 노출 대신 "⋯" 트리거 + 하단 시트로 전환 | 28px 아이콘 버튼이 좁은 화면에서 터치하기 부담스럽다는 사용자 피드백 — `sm` 이상에서는 기존 상시 노출 버튼을 그대로 유지하고, 모바일에서만 예외적으로 축소 |
```

- [ ] **Step 3: 커밋**

```bash
git add DESIGN.md
git commit -m "docs(design): document sticky header/footer and mobile file action sheet"
```

---

## 최종 통합 검증 (오케스트레이터가 직접 수행, 서브에이전트 작업 아님)

모든 태스크 완료 후, 오케스트레이터가 dev 서버를 띄워 브라우저에서 직접 확인한다(서브에이전트에게 위임하지 않음):

1. `cd frontend && npm run dev`로 서버 기동, Preview 도구로 접속.
2. 데스크톱 폭: 페이지 스크롤 시 헤더가 상단에 고정되는지, 하단 액션바(5열)가 하단에 고정되고 각 버튼(전체선택/다운로드/QR/삭제/초기화)이 정상 동작하는지, `AppFooter`가 하단바에 가려지지 않는지 확인.
3. 모바일 폭(Preview를 375px 정도로 리사이즈): 파일 행의 "⋯" 버튼 클릭 → 시트가 열리는지, 공유(지원 브라우저에서만)/QR/다운로드/삭제 각 항목 동작, 배경 클릭 시 닫히는지. 하단 액션바 5열이 가로 스크롤 없이 한 화면에 들어오는지. "파일"/"텍스트" 탭 전환 시 하단 액션바가 텍스트 탭에서 사라지는지.
4. 다크모드(Preview `colorScheme: dark`)에서 고정 헤더/하단바/시트의 배경·테두리 대비 확인.
5. 콘솔 에러 없는지 `preview_console_logs`로 확인.

모두 통과하면 `superpowers:requesting-code-review` 스킬로 넘어가 최종 리뷰를 받는다.
