# 같은 네트워크/전체 공유 세그먼트 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업로드 카드 오버레이 안에만 있던 scope(같은 네트워크/전체 공유) 선택 UI를 메인 화면의 독립된 세그먼트 탭으로 승격시키고, 탭 전환이 업로드 대상뿐 아니라 화면에 보이는 파일/텍스트 피드까지 필터링하도록 만든다.

**Architecture:** `useShareScope()`를 `App.vue`에서만 호출하는 단일 소스로 통일하고, `scope`/`setScope`를 props-down/emit-up으로 하위 컴포넌트에 배선한다. `App.vue`에 `activeRoomId`/`visibleFiles`/`visibleTexts` computed를 추가해 피드 필터링을 표시 레이어에서만 적용한다(데이터 로딩은 두 룸 모두 백그라운드로 계속). 텍스트 공유가 항상 global로 고정되던 버그를 파일 업로드와 동일한 패턴으로 고치고, 백엔드의 `room-users`(기기 로스터) 브로드캐스트를 global 룸까지 대칭 확장한다.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vitest + Vue Test Utils, Node.js/TypeScript + Socket.IO 4.8, Jest + ts-jest.

**참고 스펙:** [docs/superpowers/specs/2026-07-02-scope-segment-tabs-design.md](../specs/2026-07-02-scope-segment-tabs-design.md)

---

## 사전 참고사항 (스펙 대비 구현 시 조정한 부분)

스펙 작성 후 실제 코드를 다시 확인하며 아래 1건을 발견해 이 계획에서 바로잡았다:

- **`useTextShare.clearAllTexts()`는 두 가지 다른 용도로 이미 쓰이고 있다**: (1) `App.vue`의 재연결/최초 연결 시 로컬 상태 전체 리셋(모든 룸의 텍스트를 지움, 인자 없음), (2) 사용자가 "모두 지우기" 버튼을 누르는 경우. 스펙대로 `clearAllTexts(roomId)`로 시그니처 자체를 바꾸면 (1)의 "전체 리셋" 용도가 깨진다. 대신 기존 `clearAllTexts()`(인자 없음, 전체 리셋)는 그대로 두고, **새 함수 `clearTextsForRoom(roomId)`**를 추가해 "모두 지우기" 버튼 핸들러에서만 사용한다.

---

### Task 1: 백엔드 — `room-users`에 `roomId` 포함 + 전체 공유(global) 룸까지 브로드캐스트 확장

**Files:**
- Modify: `backend/src/types/index.ts`
- Modify: `backend/src/handlers/socketHandlers.ts`
- Test: `backend/src/__tests__/server.test.ts`

- [x] **Step 1: 기존 `room-users` 테스트를 새 payload 형태(`{roomId, devices}`)에 맞게 먼저 고쳐써서 실패시킨다**
- [x] **Step 2: 테스트가 실패하는지 확인**
- [x] **Step 3: `backend/src/types/index.ts`의 `room-users` 이벤트 타입을 payload 형태로 변경**
- [x] **Step 4: `backend/src/handlers/socketHandlers.ts`의 `handleConnection`을 global 룸까지 브로드캐스트하도록 수정**
- [x] **Step 5: `handleDisconnect`에서 ip 룸 전용 조건을 제거하고 두 룸 모두 브로드캐스트**
- [x] **Step 6: 테스트 통과 확인**
- [x] **Step 7: 커밋** — `0278cf3` (+ 후속 recovery 브랜치 테스트 보강 `89748ad`)

Requirements detail (for reference, already implemented and reviewed):
- `room-users` event type: `(payload: { roomId: string; devices: DeviceInfo[] }) => void`.
- `handleConnection`'s recovery branch AND new-connection branch each emit `room-users` for BOTH the ip room and the global room (previously only ip room).
- `handleDisconnect` removes its `if (roomId === socket.ipRoomId)` guard so it broadcasts `room-users` unconditionally for every room the socket was in.
- Test file's Device Roster describe block: same-ip roster test, different-ip-both-in-global-roster test, disconnect-remaining-roster test, plus (added during review) a connectionStateRecovery-branch test.

---

### Task 2: 프론트엔드 — `socketService`/`useSocket`에 `globalRoomDevices` 추가

**Files:**
- Modify: `frontend/src/services/socketService.js`
- Modify: `frontend/src/composables/useSocket.js`
- Test: `frontend/src/services/socketService.test.js`

- [x] **Step 1-6: 구현 완료, 커밋** — `ebfd7b9`

Requirements detail (already implemented and reviewed):
- Constructor: add `globalRoomDevices = ref([])` next to existing `ipRoomDevices`.
- `connect()`: `room-users` handler destructures `{roomId, devices}`, branches by comparing to `this.ipRoomId.value` / `this.globalRoomId.value`.
- `disconnect()`: reset `globalRoomDevices.value = []` alongside existing `ipRoomDevices` reset.
- `useSocket.js`: expose `globalRoomDevices: readonly(...)` alongside existing `ipRoomDevices`.

---

### Task 3: 프론트엔드 — `useFileManager`에 `hasMoreForRoom(roomId)` 추가

**Files:**
- Modify: `frontend/src/composables/useFileManager.js`
- Test: `frontend/src/composables/useFileManager.test.js`

- [x] **Step 1-5: 구현 완료, 커밋** — `e883ff5`

Requirements detail (already implemented and reviewed):
- `hasMoreForRoom(roomId)` placed directly below `hasMore` computed, above `mergeAndSort`: `return !!roomTokens.value.get(roomId)`.
- Exposed in the composable's returned object, near `hasMore`.
- Must not change `hasMore`/`loadMore` existing behavior.

---

### Task 4: 프론트엔드 — `useTextShare`에 `roomId` 지원 추가 (`addText`, `removeText` 반환값, `clearTextsForRoom`)

**Files:**
- Modify: `frontend/src/composables/useTextShare.js`
- Test: `frontend/src/composables/useTextShare.test.js`

- [x] **Step 1-5: 구현 완료, 커밋** — `bbdf529`

Requirements detail (already implemented and reviewed):
- `addText(content, roomId)` includes `roomId` in the created/pushed text object.
- `removeText(id)` returns the removed text object on success, `null` if not found (via `findIndex` + `splice`).
- New `clearTextsForRoom(roomId)` placed right after `clearAllTexts`, filters `sharedTexts.value` keeping only texts where `roomId !== given roomId`. Added to the returned object right after `clearAllTexts`.
- **`clearAllTexts()` (existing no-arg function) remains completely unchanged** — used elsewhere for full-state reset, must not be merged with the new function.

**Known transitional risk flagged during code review (carry forward to Task 9):** `clearTextsForRoom(undefined)` would wipe every text still tagged `roomId: undefined` (i.e., all texts, until Task 9 threads a real roomId through `addText`). When Task 9 wires `clearTextsForRoom` into `App.vue`'s `handleClearAllTexts`, it MUST guard against a falsy/undefined `roomId` before calling it (e.g. `if (!targetRoomId) return`).

---

### Task 5: 프론트엔드 — `ShareScopeTabs.vue` 신규 컴포넌트

**Files:**
- Create: `frontend/src/components/ShareScopeTabs.vue`
- Test: `frontend/src/components/ShareScopeTabs.test.js`

- [x] **Step 1-5: 구현 완료, 커밋** — `1f4680c`

Requirements detail (already implemented and reviewed):
- Props: `scope` (String, default `'ip'`), `ipDevices` (Array, default `[]`), `globalDevices` (Array, default `[]`). Emits: `select`.
- Root `role="tablist"` with `:aria-label="t('shareScope.label')"`; exactly 2 `role="tab"` buttons.
- Active tab styling: `scope==='ip'` → `bg-primary text-white` + `aria-selected="true"` on first tab; `scope==='global'` → `bg-scope-global text-white` + `aria-selected="true"` on second tab.
- Each tab embeds a `ConnectedDevices` instance (existing component) — first tab gets `ipDevices`, second gets `globalDevices`, wrapped in `<span class="scale-75 origin-left">` to visually shrink it.
- Standalone component only — not wired into any parent yet (that's Tasks 7/8).

---

### Task 6: 프론트엔드 — `FileUploadSection.vue`를 prop/emit 기반으로 전환 (내부 `useShareScope()` 호출 제거)

**Files:**
- Modify: `frontend/src/components/FileUploadSection.vue`
- Test: `frontend/src/components/FileUploadSection.test.js`

- [x] **Step 1-5: 구현 완료, 커밋** — `d08214d`

Requirements detail (already implemented and reviewed):
- Removed the `useShareScope` import and its usage entirely.
- Added `scope` prop (String, default `'ip'`).
- Added `'select-scope'` to `defineEmits` (alongside existing `'upload-files'`).
- `selectScope(next)` now emits `emit('select-scope', next)` instead of calling `setScope(next)`.
- Template requires no changes (`<script setup>`'s `defineProps` auto-exposes declared props to the template).

---

### Task 7: 프론트엔드 — `FileGallery.vue`에 `scope` prop 전달 + `select-scope` emit 전파

**Files:**
- Modify: `frontend/src/components/FileGallery.vue`
- Test: `frontend/src/components/FileGallery.test.js`

- [x] **Step 1-5: 구현 완료, 커밋** — `9047c4e`

Requirements detail (already implemented and reviewed):
- `scope` prop added to `defineProps` (String, default `'ip''`), after `hasMore`.
- `'select-scope'` added to `defineEmits`, right after `'upload-files'`.
- Template: `<FileUploadSection>` gains `:scope="scope"` and `@select-scope="$emit('select-scope', $event)"`, alongside existing `@upload-files` binding.
- Pure passthrough only.

---

### Task 8: 프론트엔드 — `RoomScreen.vue`에 `ShareScopeTabs` 배치 및 배선

**Files:**
- Modify: `frontend/src/components/RoomScreen.vue`
- Test: `frontend/src/components/RoomScreen.test.js`

- [x] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/RoomScreen.test.js`의 `stubs` 객체에 `ShareScopeTabs` 항목 추가:

```js
const stubs = {
  AppHeader: {
    name: 'AppHeader',
    template: '<div class="app-header-stub"><slot /></div>',
    props: ['userCount', 'isConnecting', 'devices']
  },
  ShareScopeTabs: {
    name: 'ShareScopeTabs',
    template: '<div class="share-scope-tabs-stub"></div>',
    props: ['scope', 'ipDevices', 'globalDevices'],
    emits: ['select']
  },
  FileGallery: {
    name: 'FileGallery',
    template: '<div class="file-gallery-stub"></div>',
    props: ['files', 'isLoading', 'scope'],
    emits: ['copy-image', 'download-file', 'download-selected', 'download-parallel', 'download-all', 'copy-selected-to-clipboard', 'upload-files', 'select-scope']
  },
  TextShareBox: {
    name: 'TextShareBox',
    template: '<div class="text-share-box-stub"></div>',
    props: ['texts'],
    emits: ['remove-text', 'clear-all', 'copy-text']
  },
  AppFooter: {
    name: 'AppFooter',
    template: '<div class="app-footer-stub"></div>'
  }
}
```

`defaultProps`에 새 필드 추가:

```js
  const defaultProps = {
    roomId: 'room-shared',
    files: [],
    texts: [],
    isLoading: false,
    userCount: 1,
    isConnecting: false,
    devices: [],
    scope: 'ip',
    ipRoomDevices: [],
    globalRoomDevices: []
  }
```

`describe('컴포넌트 렌더링', ...)` 블록 안에 테스트 추가:

```js
    it('ShareScopeTabs가 렌더링되고 scope/기기 목록 props를 전달받는다', () => {
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, scope: 'global', ipRoomDevices: [{ socketId: 'a' }], globalRoomDevices: [{ socketId: 'b' }] },
        global: { stubs }
      })

      const tabs = wrapper.findComponent({ name: 'ShareScopeTabs' })
      expect(tabs.exists()).toBe(true)
      expect(tabs.props('scope')).toBe('global')
      expect(tabs.props('ipDevices')).toEqual([{ socketId: 'a' }])
      expect(tabs.props('globalDevices')).toEqual([{ socketId: 'b' }])
    })
```

`describe('이벤트 전파', ...)` 블록 안에 테스트 추가:

```js
    it('ShareScopeTabs에서 select 이벤트가 select-scope로 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const tabs = wrapper.findComponent({ name: 'ShareScopeTabs' })
      await tabs.vm.$emit('select', 'global')

      expect(wrapper.emitted('select-scope')).toBeTruthy()
      expect(wrapper.emitted('select-scope')[0]).toEqual(['global'])
    })

    it('FileGallery에서 select-scope 이벤트가 전파되어야 한다', async () => {
      const wrapper = mount(RoomScreen, {
        props: defaultProps,
        global: { stubs }
      })

      const fileGallery = wrapper.findComponent({ name: 'FileGallery' })
      await fileGallery.vm.$emit('select-scope', 'global')

      expect(wrapper.emitted('select-scope')).toBeTruthy()
      expect(wrapper.emitted('select-scope')[0]).toEqual(['global'])
    })
```

- [x] **Step 2: 테스트 실패 확인**

Run (frontend 디렉토리에서): `npx vitest run src/components/RoomScreen.test.js`
Expected: FAIL — `RoomScreen`이 아직 `ShareScopeTabs`를 렌더링하지 않고, `scope`/`ipRoomDevices`/`globalRoomDevices` prop과 `select-scope` emit이 없음

- [x] **Step 3: `RoomScreen.vue` 수정**

`import` 구문에 추가:

```js
<script setup>
import AppHeader from './AppHeader.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import AppFooter from './AppFooter.vue'
```

다음으로 교체:

```js
<script setup>
import AppHeader from './AppHeader.vue'
import ShareScopeTabs from './ShareScopeTabs.vue'
import FileGallery from './FileGallery.vue'
import TextShareBox from './TextShareBox.vue'
import AppFooter from './AppFooter.vue'
```

`defineProps`에 3개 필드 추가(기존 `hasMore` 뒤):

```js
  hasMore: {
    type: Boolean,
    default: false
  }
})
```

다음으로 교체:

```js
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
```

`defineEmits` 배열에 `'select-scope'` 추가(맨 끝):

```js
  'paste-content',
  'load-more'
])
```

다음으로 교체:

```js
  'paste-content',
  'load-more',
  'select-scope'
])
```

템플릿에서 `<AppHeader ... />`와 `<main ...>` 사이에 `ShareScopeTabs` 삽입:

```html
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
      :devices="devices"
    />

    <main class="bg-surface rounded-xl p-8 border border-border">
      <FileGallery
        :files="files"
        :room-id="roomId"
        :is-loading="isLoading"
        :has-more="hasMore"
        @copy-image="$emit('copy-image', $event)"
        @download-file="$emit('download-file', $event)"
        @download-parallel="$emit('download-parallel', $event)"
        @copy-selected-to-clipboard="$emit('copy-selected-to-clipboard', $event)"
        @delete-file="$emit('delete-file', $event)"
        @delete-selected="$emit('delete-selected', $event)"
        @clear-storage="$emit('clear-storage')"
        @upload-files="$emit('upload-files', $event)"
        @paste-content="$emit('paste-content')"
        @load-more="$emit('load-more')"
      />
```

다음으로 교체:

```html
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
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/components/RoomScreen.test.js`
Expected: PASS

- [x] **Step 5: 커밋**

```bash
cd frontend
git add src/components/RoomScreen.vue src/components/RoomScreen.test.js
git commit -m "feat(frontend): render ShareScopeTabs in RoomScreen and wire select-scope"
```

---

### Task 9: 프론트엔드 — `App.vue`: 단일 scope 소스, 피드 필터링, 텍스트 공유 scope 반영

**Files:**
- Modify: `frontend/src/App.vue`

이 태스크는 기존 자동 테스트 커버리지가 없는 최상위 컴포넌트(App.test.js 없음)를 다룬다. 자동화된 테스트 대신, 이전 태스크들에서 이미 검증된 하위 유닛(`useTextShare`, `useFileManager`, `ShareScopeTabs` 등)을 배선만 하고, 아래 "수동 검증" 단계에서 실제 동작을 확인한다.

- [x] **Step 1: `computed` import 추가**

```js
import { onMounted, onUnmounted, ref } from 'vue'
```

다음으로 교체:

```js
import { onMounted, onUnmounted, ref, computed } from 'vue'
```

- [x] **Step 2: `activeRoomId`/`visibleFiles`/`visibleTexts` computed 추가**

`const shareScope = useShareScope()` 다음 줄(`const isConnecting = ref(false)` 이전)에 추가:

```js
const shareScope = useShareScope()
const isConnecting = ref(false)
const currentRoute = ref({ type: 'home' })
```

다음으로 교체:

```js
const shareScope = useShareScope()
const isConnecting = ref(false)
const currentRoute = ref({ type: 'home' })

// 현재 선택된 scope('ip'|'global')에 대응하는 룸 ID — 피드 필터링/업로드 대상 공통 기준
const activeRoomId = computed(() => roomManager.roomIdForScope(shareScope.scope.value))

// 화면에 표시할 파일/텍스트를 활성 scope로 필터링한다.
// 실제 데이터 로딩(loadFilesFromRooms, 소켓 수신)은 두 룸 모두 백그라운드로 계속 진행되며,
// 필터링은 표시 시점에만 적용되므로 탭 전환은 네트워크 요청 없이 즉시 반영된다.
const visibleFiles = computed(() =>
  fileManager.files.value.filter(f => f.roomId === activeRoomId.value)
)
const visibleTexts = computed(() =>
  textShare.sharedTexts.value.filter(t => t.roomId === activeRoomId.value)
)
```

- [x] **Step 3: 소켓 메시지 수신 핸들러에서 텍스트에 `roomId` 태깅 + `texts-cleared`를 룸 스코프로 처리**

`setupSocketListeners()` 내부의 아래 부분을:

```js
    } else if (message.type === 'text-shared') {
      const exists = textShare.sharedTexts.value.some(t => t.id === message.textId)
      if (!exists) {
        const newText = {
          id: message.textId,
          content: message.content,
          timestamp: message.timestamp
        }
        textShare.sharedTexts.value.push(newText)
        notification.showInfo('새 텍스트가 공유되었습니다!')
      }
    } else if (message.type === 'text-removed') {
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
      textShare.clearAllTexts()
      notification.showInfo('모든 텍스트가 삭제되었습니다.')
    }
```

다음으로 교체:

```js
    } else if (message.type === 'text-shared') {
      const exists = textShare.sharedTexts.value.some(t => t.id === message.textId)
      if (!exists) {
        const newText = {
          id: message.textId,
          content: message.content,
          timestamp: message.timestamp,
          roomId: message.roomId
        }
        textShare.sharedTexts.value.push(newText)
        notification.showInfo('새 텍스트가 공유되었습니다!')
      }
    } else if (message.type === 'text-removed') {
      textShare.removeText(message.textId)
    } else if (message.type === 'texts-cleared') {
      textShare.clearTextsForRoom(message.roomId)
      notification.showInfo('모든 텍스트가 삭제되었습니다.')
    }
```

- [x] **Step 4: 텍스트 공유 핸들러 3개를 scope-aware로 수정**

`handleAddText`를:

```js
async function handleAddText(content) {
  if (!roomManager.globalRoomId.value) return

  const newText = textShare.addText(content)
  if (!newText) return

  socket.publishMessage({
    type: 'text-shared',
    textId: newText.id,
    content: newText.content,
    timestamp: newText.timestamp,
    roomId: roomManager.globalRoomId.value
  }, 'global')

  notification.showSuccess('텍스트가 공유되었습니다!')
}
```

다음으로 교체:

```js
async function handleAddText(content) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.scope.value
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  const newText = textShare.addText(content, targetRoomId)
  if (!newText) return

  socket.publishMessage({
    type: 'text-shared',
    textId: newText.id,
    content: newText.content,
    timestamp: newText.timestamp,
    roomId: targetRoomId
  }, targetScope)

  notification.showSuccess('텍스트가 공유되었습니다!')
}
```

`handleRemoveText`를:

```js
async function handleRemoveText(textId) {
  if (!roomManager.globalRoomId.value) return

  const removed = textShare.removeText(textId)
  if (!removed) return

  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: roomManager.globalRoomId.value
  }, 'global')
}
```

다음으로 교체:

```js
async function handleRemoveText(textId) {
  if (roomManager.roomIds.value.length === 0) return

  const removed = textShare.removeText(textId)
  if (!removed) return

  const targetScope = removed.roomId === roomManager.globalRoomId.value ? 'global' : 'ip'

  socket.publishMessage({
    type: 'text-removed',
    textId,
    roomId: removed.roomId
  }, targetScope)
}
```

`handleClearAllTexts`를:

```js
async function handleClearAllTexts() {
  if (!roomManager.globalRoomId.value) return

  textShare.clearAllTexts()

  socket.publishMessage({
    type: 'texts-cleared',
    roomId: roomManager.globalRoomId.value
  }, 'global')

  notification.showInfo('모든 텍스트가 삭제되었습니다.')
}
```

다음으로 교체 (주의: `clearTextsForRoom`은 `roomId`가 falsy면 안전하게 아무 것도 하지 않고 리턴해야 한다 — Task 4 코드 리뷰에서 확인된 위험: `clearTextsForRoom(undefined)`를 호출하면 아직 roomId가 태깅되지 않은 텍스트를 모두 지워버릴 수 있음):

```js
async function handleClearAllTexts() {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.scope.value
  const targetRoomId = activeRoomId.value
  if (!targetRoomId) return

  textShare.clearTextsForRoom(targetRoomId)

  socket.publishMessage({
    type: 'texts-cleared',
    roomId: targetRoomId
  }, targetScope)

  notification.showInfo('모든 텍스트가 삭제되었습니다.')
}
```

- [x] **Step 5: 템플릿에서 `RoomScreen`에 새 props/emit 배선**

```html
    <RoomScreen
      v-else
      :is-connecting="isConnecting"
      :room-id="roomManager.globalRoomId.value"
      :files="fileManager.files.value"
      :texts="textShare.sharedTexts.value"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      :devices="socket.ipRoomDevices.value"
      :has-more="fileManager.hasMore.value"
      @copy-image="handleCopyImage"
      @upload-files="handleUploadFiles"
      @download-file="handleDownloadFile"
      @download-parallel="handleDownloadParallel"
      @copy-selected-to-clipboard="handleCopySelectedToClipboard"
      @delete-file="handleDeleteFile"
      @delete-selected="handleDeleteSelected"
      @clear-storage="handleClearStorage"
      @remove-text="handleRemoveText"
      @clear-all-texts="handleClearAllTexts"
      @copy-text="handleCopyText"
      @paste-content="handlePasteContent"
      @load-more="handleLoadMore"
    />
```

다음으로 교체:

```html
    <RoomScreen
      v-else
      :is-connecting="isConnecting"
      :room-id="activeRoomId"
      :files="visibleFiles"
      :texts="visibleTexts"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      :devices="socket.ipRoomDevices.value"
      :scope="shareScope.scope.value"
      :ip-room-devices="socket.ipRoomDevices.value"
      :global-room-devices="socket.globalRoomDevices.value"
      :has-more="fileManager.hasMoreForRoom(activeRoomId.value)"
      @copy-image="handleCopyImage"
      @upload-files="handleUploadFiles"
      @select-scope="shareScope.setScope"
      @download-file="handleDownloadFile"
      @download-parallel="handleDownloadParallel"
      @copy-selected-to-clipboard="handleCopySelectedToClipboard"
      @delete-file="handleDeleteFile"
      @delete-selected="handleDeleteSelected"
      @clear-storage="handleClearStorage"
      @remove-text="handleRemoveText"
      @clear-all-texts="handleClearAllTexts"
      @copy-text="handleCopyText"
      @paste-content="handlePasteContent"
      @load-more="handleLoadMore"
    />
```

- [x] **Step 6: 프론트엔드 전체 테스트 스위트 통과 확인 (회귀 확인)**

Run (frontend 디렉토리에서): `npx vitest run`
Expected: PASS — 전체 스위트(이 계획의 이전 태스크에서 수정한 모든 파일 포함) 회귀 없이 통과.

- [x] **Step 7: 커밋**

```bash
cd frontend
git add src/App.vue
git commit -m "feat(frontend): filter visible feed by active scope and fix text-share scope"
```

---

### Task 10: 전체 검증 — 백엔드/프론트엔드 전체 테스트 + 수동 스모크 테스트

**Files:** 없음(검증 전용 태스크)

- [x] **Step 1: 백엔드 전체 테스트 스위트 실행**

Run (backend 디렉토리에서): `npm test`
Expected: PASS — 전체 Jest 스위트 (RoomManager, deviceInfo, clientIp, r2Service, StorageService, server 포함)

- [x] **Step 2: 프론트엔드 전체 테스트 스위트 실행**

Run (frontend 디렉토리에서): `npx vitest run`
Expected: PASS — 전체 Vitest 스위트

- [x] **Step 3: 수동 스모크 테스트 (로컬 dev 서버)**

```bash
# 터미널 1
cd backend && npm run dev
# 터미널 2
cd frontend && npm run dev
```

브라우저에서 `http://localhost:5173`을 두 개의 탭(또는 시크릿 창 하나 + 일반 창 하나, 같은 로컬 네트워크이므로 같은 ip 룸으로 묶임)으로 열어 아래를 확인한다:

1. 헤더 아래에 세그먼트 탭("같은 네트워크" / "전체 공유")이 보이고, 기본값은 "같은 네트워크"가 활성(coral)이다.
2. 각 탭 옆에 접속 기기 아바타가 표시된다 — 두 탭을 모두 열어둔 상태에서 "같은 네트워크" 쪽에 아바타 2개가 보여야 한다.
3. 파일을 업로드하면 활성 탭("같은 네트워크")의 피드에 즉시 나타난다.
4. "전체 공유" 탭을 클릭하면 피드가 즉시 바뀌고(방금 업로드한 파일은 사라짐), 텍스트를 붙여넣으면 이 탭에서만 보인다.
5. 다시 "같은 네트워크" 탭으로 전환하면 아까 업로드한 파일이 다시 보인다(데이터가 유실되지 않았음을 확인).
6. "전체 공유" 탭에서 "모두 지우기"를 눌러도 "같은 네트워크" 탭의 텍스트는 남아있는지 확인(탭 전환으로 검증).
7. 브라우저 콘솔에 에러가 없는지 확인.

- [x] **Step 4: 개발 서버 종료**

각 터미널에서 `Ctrl+C`로 종료한다.
