# Cabinet Grotesk Heading + Card Land Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Cabinet Grotesk to the app title (as a real `<h1>`), and add the DESIGN.md "land" spring-bounce entrance animation to file cards that arrive after the gallery has mounted.

**Architecture:** A new `--font-display` Tailwind theme token makes Cabinet Grotesk available as the `font-display` utility class, applied only to `AppHeader.vue`'s title. Separately, `FileGallery.vue`'s file-card `v-for` gets wrapped in a `<TransitionGroup>` (leaving `FileUploadSection`/`PasteSection` outside it, unaffected), driven by a small extracted `createEnterStagger()` utility that assigns each newly-entering card a `transitionDelay` based on its order within the current burst, capped at 400ms. Because `<TransitionGroup>` never animates on its own first render (no `appear` prop), cards already present when the gallery first shows its file list are unaffected — only later arrivals animate. `FileCard.vue` is first made single-rooted (moving its `<Teleport>` inside the root `<div>`) so `TransitionGroup` can track it reliably.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Tailwind CSS 4, Vitest + Vue Test Utils.

**Spec:** [`docs/superpowers/specs/2026-07-01-cabinet-grotesk-land-animation-design.md`](../specs/2026-07-01-cabinet-grotesk-land-animation-design.md)

---

### Task 1: Add the `--font-display` theme token

**Files:**
- Modify: `frontend/src/style.css:30-39` (the `@theme` block)

- [ ] **Step 1: Add the token**

In `frontend/src/style.css`, the `@theme` block currently reads:

```css
@theme {
  --color-background: #1C1917;
  --color-surface: #262220;
  --color-primary: #FF7A5C;
  --color-text-primary: #F2EDE7;
  --color-text-secondary: #A69A8D;
  --color-border: #3A3430;
  --color-scope-global: #6FAE8A;
  --color-scope-global-tint: #223026;
}
```

Add `--font-display` as the last line before the closing brace:

```css
@theme {
  --color-background: #1C1917;
  --color-surface: #262220;
  --color-primary: #FF7A5C;
  --color-text-primary: #F2EDE7;
  --color-text-secondary: #A69A8D;
  --color-border: #3A3430;
  --color-scope-global: #6FAE8A;
  --color-scope-global-tint: #223026;
  --font-display: 'Cabinet Grotesk', 'Plus Jakarta Sans', sans-serif;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no CSS/PostCSS errors (Tailwind generates the `font-display` utility class from the new token).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(frontend): add font-display theme token for Cabinet Grotesk"
```

---

### Task 2: Apply Cabinet Grotesk to the app title as a real `<h1>`

**Files:**
- Modify: `frontend/src/components/AppHeader.vue:50-54`
- Test: `frontend/src/components/AppHeader.test.js`

**Context:** The app title is currently a `<span>` inside a flex row, styled `font-semibold` (600). Cabinet Grotesk is only loaded at weights 500/700/800 (see `frontend/index.html`'s Fontshare link), so it must use `font-bold` (700) instead of `font-semibold` to render a real cut rather than a synthetic bold.

- [ ] **Step 1: Write the failing test**

Add this test to `frontend/src/components/AppHeader.test.js`, inside the existing `describe('AppHeader.vue', ...)` block (after the last existing `it(...)`, before the closing `})`):

```javascript
  it('앱 타이틀은 접근성을 위해 실제 h1 엘리먼트로 렌더링된다', async () => {
    const wrapper = await mountReady()
    const heading = wrapper.find('h1')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe('app.title')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run AppHeader`
Expected: FAIL — no `<h1>` element exists in the rendered output yet.

- [ ] **Step 3: Update the template**

In `frontend/src/components/AppHeader.vue`, change:

```html
    <div class="flex items-center gap-3 text-2xl font-semibold">
      <span class="text-4xl">📋</span>
      <span>{{ t('app.title') }}</span>
    </div>
```

to:

```html
    <div class="flex items-center gap-3 text-2xl">
      <span class="text-4xl" aria-hidden="true">📋</span>
      <h1 class="font-display font-bold text-2xl m-0">{{ t('app.title') }}</h1>
    </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run AppHeader`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AppHeader.vue frontend/src/components/AppHeader.test.js
git commit -m "feat(frontend): apply Cabinet Grotesk to app title, use a real h1"
```

---

### Task 3: Make `FileCard.vue` single-rooted

**Files:**
- Modify: `frontend/src/components/FileCard.vue:196-207`

**Context:** `FileCard.vue`'s template currently returns two root nodes: the visible card `<div>` and a sibling `<Teleport to="body">`. `<TransitionGroup>` (added in Task 5) expects each keyed child to resolve to a single root element to track enter/move correctly. This task only moves the `<Teleport>` inside the card's root `<div>` — its content still teleports to `<body>` exactly as before; only its position in the source template changes, which doesn't change runtime behavior. There's no new behavior to test here (pure structural change), so this task is verified by the existing full test suite instead of a new test.

- [ ] **Step 1: Move the Teleport inside the root div**

In `frontend/src/components/FileCard.vue`, change the end of the template from:

```html
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- QR 코드 모달 (Teleport로 body로 이동) -->
  <Teleport to="body">
    <FileQRCodeModal
      :file="file"
      :is-open="isQRModalOpen"
      @close="closeQRModal"
    />
  </Teleport>
</template>
```

to:

```html
          </button>
        </div>
      </div>
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

(There are four closing `</div>` tags before the Teleport in the original: they close the button-group `div`, the `flex justify-end` `div`, the bottom-overlay `div`, and finally the card's root `div`. The edit removes the last one — the root's closing tag — from before the Teleport comment and puts it back after `</Teleport>`, so the Teleport becomes the root div's last child instead of its sibling. No other content changes.)

- [ ] **Step 2: Run the full frontend test suite to confirm no regressions**

Run: `cd frontend && npm test -- --run`
Expected: PASS — same pass/fail counts as before this change (no test references `FileCard`'s root structure directly).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FileCard.vue
git commit -m "refactor(frontend): nest FileCard's Teleport inside its root div for TransitionGroup compatibility"
```

---

### Task 4: Add the `createEnterStagger` utility

**Files:**
- Create: `frontend/src/utils/enterStagger.js`
- Test: `frontend/src/utils/enterStagger.test.js`

**Context:** This is a small, pure/stateful helper extracted so the stagger math (order within a burst → delay, capped, resetting after a short idle gap) can be unit tested without touching Vue's transition/DOM machinery, which is unreliable to test directly (JSDOM/happy-dom don't fire real CSS transition events).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/enterStagger.test.js`:

```javascript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createEnterStagger } from './enterStagger'

describe('createEnterStagger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('같은 배치 안에서 호출할 때마다 80ms씩 지연을 늘린다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    expect(next()).toBe(0)
    expect(next()).toBe(80)
    expect(next()).toBe(160)
  })

  it('지연은 400ms를 넘지 않는다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    for (let i = 0; i < 5; i++) next()
    expect(next()).toBe(400)
    expect(next()).toBe(400)
  })

  it('유휴 시간(50ms)이 지나면 다음 배치는 다시 0부터 시작한다', () => {
    vi.useFakeTimers()
    const next = createEnterStagger()

    next()
    next()
    vi.advanceTimersByTime(50)

    expect(next()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run enterStagger`
Expected: FAIL — `frontend/src/utils/enterStagger.js` doesn't exist yet.

- [ ] **Step 3: Implement the utility**

Create `frontend/src/utils/enterStagger.js`:

```javascript
/**
 * 같은 렌더 플러시 안에서 연속으로 진입하는 항목들에 순서대로 스태거 지연을 부여한다.
 * 짧은 유휴 시간(resetDelayMs) 뒤에는 순번이 초기화되어, 다음 배치는 다시 0부터 시작한다 —
 * 그래야 전체 목록에서의 절대 위치가 아니라 "이번에 도착한 묶음" 안에서만 순번이 매겨진다.
 */
export function createEnterStagger(staggerMs = 80, capMs = 400, resetDelayMs = 50) {
  let order = 0
  let resetTimer = null

  return function next() {
    const delay = Math.min(order * staggerMs, capMs)
    order += 1
    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      order = 0
    }, resetDelayMs)
    return delay
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run enterStagger`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/enterStagger.js frontend/src/utils/enterStagger.test.js
git commit -m "feat(frontend): add createEnterStagger utility for card land animation"
```

---

### Task 5: Wire the land animation into `FileGallery.vue`

**Files:**
- Modify: `frontend/src/components/FileGallery.vue`
- Test: `frontend/src/components/FileGallery.test.js`

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to `frontend/src/components/FileGallery.test.js`, after the existing `describe('FileGallery.vue - 선택 충돌...', ...)` block (i.e., at the end of the file):

```javascript

describe('FileGallery.vue - 파일 카드 land 애니메이션', () => {
  it('초기 마운트 시 이미 존재하는 파일 카드에는 진입 지연이 적용되지 않는다', () => {
    const wrapper = mount(FileGallery, {
      props: { files: dupFiles, roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    const cards = wrapper.findAll('.file-card-stub')
    expect(cards).toHaveLength(2)
    cards.forEach(card => {
      expect(card.element.style.transitionDelay).toBe('')
    })
  })

  it('마운트 이후 한 번에 여러 파일이 추가되면 순서대로 진입 지연이 커진다', async () => {
    const wrapper = mount(FileGallery, {
      props: { files: [], roomId: 'room-a', isLoading: false },
      ...mountOptions
    })

    await wrapper.setProps({
      files: [
        { name: 'first.png', roomId: 'room-a', url: 'https://example.com/first.png', size: 10, created: '2026-01-01T00:00:00.000Z' },
        { name: 'second.png', roomId: 'room-a', url: 'https://example.com/second.png', size: 20, created: '2026-01-01T00:00:01.000Z' }
      ]
    })

    const cards = wrapper.findAll('.file-card-stub')
    expect(cards).toHaveLength(2)
    expect(cards[0].element.style.transitionDelay).toBe('0ms')
    expect(cards[1].element.style.transitionDelay).toBe('80ms')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run FileGallery`
Expected: FAIL — `transitionDelay` is never set because there's no `TransitionGroup`/`onCardBeforeEnter` wiring yet.

- [ ] **Step 3: Wire up the TransitionGroup**

In `frontend/src/components/FileGallery.vue`, add the import and the stagger instance near the top of `<script setup>` (right after the existing imports):

```javascript
import { createEnterStagger } from '../utils/enterStagger'
```

Add this alongside the other `ref`/`computed` declarations (after `const showMultiQRModal = ref(false)`):

```javascript
const nextEnterDelay = createEnterStagger()

function onCardBeforeEnter(el) {
  el.style.transitionDelay = `${nextEnterDelay()}ms`
}
```

Then change the template's file-card loop from:

```html
      <!-- 업로드된 파일 카드들 (로딩 중이 아닐 때) -->
      <template v-else>
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
      </template>
```

to:

```html
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
```

Finally, add a scoped `<style>` block at the end of the file (after the closing `</template>`):

```html

<style scoped>
.card-land-enter-active {
  transition: transform 350ms cubic-bezier(.34, 1.56, .64, 1), opacity 350ms cubic-bezier(.34, 1.56, .64, 1);
}

.card-land-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.85);
}

@media (prefers-reduced-motion: reduce) {
  .card-land-enter-active {
    transition: none;
  }
}
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run FileGallery`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test -- --run`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FileGallery.vue frontend/src/components/FileGallery.test.js
git commit -m "feat(frontend): add land spring-bounce entrance animation for new file cards"
```

---

### Task 6: Manual visual verification

**Files:** none (manual QA step only)

- [ ] **Step 1: Start the dev server and verify the heading**

Run: `cd frontend && npm run dev`, open the app in a browser, and confirm the header title now renders in Cabinet Grotesk (check via devtools computed `font-family` on the new `<h1>`), at the same visual size as before.

- [ ] **Step 2: Verify the land animation on new cards**

With the app open in two browser tabs/windows joined to the same room, upload a file from one tab and confirm in the other tab that the new file card animates in with a translateY+scale overshoot (~350ms) rather than just appearing. Reload the tab with existing files and confirm the existing cards do **not** animate in on page load.

- [ ] **Step 3: Verify multi-file stagger and reduced motion**

Upload several files at once (e.g. select 3-4 files) and confirm the cards land staggered rather than all at once. Then, in Chrome DevTools, open the Rendering tab and set "Emulate CSS media feature prefers-reduced-motion" to `reduce`; upload another file and confirm it now appears instantly with no animation.

- [ ] **Step 4: Commit (if any fixes were needed)**

If manual verification surfaces a bug, fix it, re-run the relevant automated test(s) from Tasks 2-5, and commit the fix separately with a message describing what was wrong.
