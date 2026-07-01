# 같은 네트워크/전체 공유 세그먼트 탭 설계

## 배경

현재 공유 대상(`scope`: `ip` | `global`) 선택 UI는 [FileUploadSection.vue:109-134](../../../frontend/src/components/FileUploadSection.vue)의 업로드 카드 상단 오버레이 안에 작은 pill 버튼 두 개로만 존재한다. 이 UI는 **다음 업로드가 어디로 갈지**만 결정할 뿐, 화면에 보이는 파일/텍스트 피드에는 전혀 영향을 주지 않는다 — `App.vue`는 항상 `ip` 룸과 `global` 룸의 파일을 하나로 합쳐서([App.vue:91](../../../frontend/src/App.vue), `useFileManager.js:113` `mergeAndSort`) 보여준다.

[DESIGN.md:51](../../../DESIGN.md)에는 이미 다음 방향이 정해져 있다:

> Scope tabs: a segmented pill control (`우리 네트워크` / `전체 공유`) sits above the feed; active tab fills with the scope color (coral for ip, sage for global). Default active tab is always `ip`.

이번 작업은 이 pill 선택 UI를 메인 화면의 독립된 탭 컴포넌트로 승격시키고, 탭이 이름 그대로 "진짜 탭"처럼 동작하도록 — 즉 피드 자체도 선택된 scope로 필터링되도록 — 만든다.

관련 기존 스펙: [2026-06-30-ip-scoped-sharing-design.md](2026-06-30-ip-scoped-sharing-design.md) (scope 개념 최초 도입), [2026-07-01-connected-devices-avatar-row-design.md](2026-07-01-connected-devices-avatar-row-design.md) (ip 룸 전용 아바타 로스터 — 이번 작업에서 global 룸까지 확장).

## 범위

- 새 컴포넌트 `ShareScopeTabs.vue`: `같은 네트워크`/`전체 공유` 세그먼트 탭, 각 탭에 해당 룸의 접속자 아바타 로스터 포함.
- `RoomScreen.vue`에 배치: `AppHeader`와 `<main>` 사이 독립된 바.
- 탭 전환 시 업로드 대상 **및** 화면에 보이는 파일/텍스트 피드를 함께 전환(피드 필터링).
- 텍스트 공유가 항상 `global`로 고정되어 있던 기존 동작을 파일 업로드와 동일하게 scope를 따르도록 수정.
- 백엔드: `room-users`(기기 로스터) 브로드캐스트를 기존 ip 룸 전용에서 global 룸까지 대칭 확장.
- **범위 밖**: `FileUploadSection.vue` 오버레이 안의 기존 pill 버튼 자체의 제거 여부(유지하되 새 탭과 상태를 공유 — 중복 UI 정리는 별도 판단), scope 라벨 문구 변경(기존 i18n 값 그대로 사용), 모바일 Web Share Target 관련 오픈 이슈([DESIGN.md:59-60](../../../DESIGN.md)), 룸 전환을 위한 socket 재연결/rejoin(불필요 — 클라이언트는 이미 두 룸에 동시 입장해 있음).

## UI/배치 설계

`RoomScreen.vue`의 `<AppHeader>`와 `<main>` 사이에 `ShareScopeTabs`를 추가한다:

```html
<AppHeader ... />
<ShareScopeTabs
  :scope="scope"
  :ip-devices="ipRoomDevices"
  :global-devices="globalRoomDevices"
  @select="setScope"
/>
<main class="bg-surface rounded-xl p-8 border border-border"> ... </main>
```

`ShareScopeTabs.vue` 내부 구조 (DESIGN.md 색상/spacing 그대로 적용):
- 컨테이너: `role="tablist"`, `rounded-full`(pill), `border border-border`, `bg-surface`, padding `p-1`(4px 유닛).
- 탭 버튼 2개, 각각 `role="tab"`, `aria-selected`:
  - `같은 네트워크`(`shareScope.ip`): 활성 시 `bg-primary text-white`(coral).
  - `전체 공유`(`shareScope.global`): 활성 시 `bg-scope-global text-white`(sage).
  - 비활성 탭은 투명 배경 + `text-text-secondary`.
- 각 탭 버튼 내부, 라벨 오른쪽에 해당 룸의 `ConnectedDevices` 인스턴스를 작게 배치(`MAX_VISIBLE`은 기존 컴포넌트 기본값 4 그대로 재사용, 탭 안에 들어가므로 아바타 크기만 축소 — `ConnectedDevices`에 `size` prop을 추가하지 않고, 탭 쪽에서 래퍼에 `text-xs` + 축소된 컨테이너로 감싸 기존 컴포넌트를 그대로 재사용). 활성/비활성 탭 모두에서 항상 보임(활성 탭에서만 보이는 게 아님).
- `FileUploadSection.vue`의 기존 pill 버튼은 그대로 둔다 — 동일한 `useShareScope()` 인스턴스를 참조하므로(Vue 3 composable은 호출마다 독립된 `ref`를 생성함에 유의 — 아래 "상태 공유" 참고) 두 UI가 항상 같은 값을 반영한다.

## 상태 관리 설계

`useShareScope()`는 호출할 때마다 새 `ref(initial)`을 만들기 때문에, `App.vue`와 `FileUploadSection.vue`가 각자 호출하면 서로 다른 반응형 인스턴스가 생긴다(지금은 `localStorage` write는 공유되지만 read는 각자 마운트 시점에만 일어나 즉시 동기화되지 않음). 새 탭까지 추가되면 3곳에서 각자 호출하게 되므로, **`useShareScope()`는 `App.vue`에서 한 번만 호출**하고 `scope`/`setScope`를 `props`/`emit`으로 하위 컴포넌트(`RoomScreen` → `ShareScopeTabs`, `RoomScreen` → `FileGallery` → `FileUploadSection`)에 전달하는 방식으로 통일한다.

- `FileUploadSection.vue`: 내부 `useShareScope()` 호출을 제거하고 `scope`(prop) / `select-scope`(emit) 방식으로 변경.
- `FileGallery.vue`: `scope` prop을 받아 `FileUploadSection`에 그대로 전달, `upload-files` emit과 별개로 `select-scope` emit을 한 단계 위(`RoomScreen`)로 전달.
- `RoomScreen.vue`: `scope` prop을 받아 `ShareScopeTabs`와 `FileGallery` 양쪽에 전달, `select-scope` emit을 `App.vue`로 전달.
- `App.vue`: `useShareScope()`를 유일한 소스로 유지, `select-scope` 핸들러에서 `shareScope.setScope(next)` 호출.

## 피드 필터링 설계

`App.vue`에 다음 computed를 추가한다:

```js
const activeRoomId = computed(() => roomManager.roomIdForScope(shareScope.scope.value))

const visibleFiles = computed(() =>
  fileManager.files.value.filter(f => f.roomId === activeRoomId.value)
)
const visibleTexts = computed(() =>
  textShare.sharedTexts.value.filter(t => t.roomId === activeRoomId.value)
)
```

`RoomScreen`에는 `fileManager.files.value`/`textShare.sharedTexts.value` 대신 `visibleFiles`/`visibleTexts`를 전달한다. 실제 데이터 로딩(`loadFilesFromRooms`, 소켓 이벤트 수신)은 지금처럼 두 룸 모두에 대해 백그라운드로 계속 일어난다 — 필터링은 표시 시점에만 적용되므로, 탭 전환은 네트워크 요청 없이 즉시 반영된다.

`textShare.sharedTexts`의 각 항목에 `roomId`가 없으므로(현재 `{id, content, timestamp}`만 가짐, [useTextShare.js:46-50](../../../frontend/src/composables/useTextShare.js)) 아래 "텍스트 공유 scope 수정"에서 함께 추가한다.

## 텍스트 공유 scope 수정

[App.vue:364-403](../../../frontend/src/App.vue)의 `handleAddText`/`handleRemoveText`/`handleClearAllTexts`는 항상 `roomManager.globalRoomId.value`와 `'global'` 타겟을 하드코딩하고 있다. 파일 업로드와 동일한 패턴으로 변경한다:

```js
async function handleAddText(content) {
  if (roomManager.roomIds.value.length === 0) return

  const targetScope = shareScope.scope.value
  const targetRoomId = roomManager.roomIdForScope(targetScope)
  if (!targetRoomId) return

  const newText = textShare.addText(content, targetRoomId) // roomId 인자 추가
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

- `useTextShare.js`의 `addText(content, roomId)`는 생성하는 객체에 `roomId`를 포함하도록 수정(`{id, content, timestamp, roomId}`).
- `removeText(id)`의 반환값을 `boolean`에서 **삭제된 텍스트 객체(찾지 못하면 `null`)**로 변경한다. `handleRemoveText`가 발행하는 소켓 메시지의 target은 삭제 대상 텍스트가 원래 속한 room/scope로 보내야 같은 scope의 다른 클라이언트에게만 전파되므로, 반환된 객체의 `roomId`로 `target`을 계산한다(`removed.roomId === globalRoomId.value ? 'global' : 'ip'`).
- `clearAllTexts()`는 인자 없이 전체를 비우던 기존 동작 대신 `clearAllTexts(roomId)`로 변경해 **해당 roomId의 텍스트만** 제거한다(`sharedTexts.value = sharedTexts.value.filter(t => t.roomId !== roomId)`). 탭으로 피드가 나뉘는 이상 "모두 지우기"는 현재 보고 있는 scope 기준으로 동작해야 다른 scope의 텍스트가 화면에 보이지도 않는데 함께 사라지는 혼란을 피할 수 있다. `handleClearAllTexts`는 `activeRoomId`를 넘겨 호출한다.
- `App.vue`의 `message.type === 'text-shared'` 수신 핸들러([App.vue:115-125](../../../frontend/src/App.vue))는 수신한 `message.roomId`를 그대로 로컬 text 객체에 `roomId`로 저장해야 한다(현재는 `id/content/timestamp`만 저장하고 있음).

## 프레즌스(접속자) 로스터 확장

현재 `room-users`(기기 로스터) 이벤트는 ip 룸에만 브로드캐스트된다([socketHandlers.ts:64,83,106](../../../backend/src/handlers/socketHandlers.ts)). global 룸에도 동일하게 확장한다 — 새 이벤트 타입 없이 기존 `roomManager.getRoomUsers()`를 재사용:

- `handleConnection`: 신규 연결/recovery 연결 모두에서 `io.to(globalRoomId).emit('room-users', roomManager.getRoomUsers(globalRoomId))`를 ip 룸 emit 옆에 추가.
- `handleDisconnect`: 현재 `if (roomId === socket.ipRoomId)` 조건으로 ip 룸에만 재브로드캐스트하는 부분([socketHandlers.ts:105-107](../../../backend/src/handlers/socketHandlers.ts))을 제거하고, 두 룸(`rooms` 배열 순회) 모두에서 무조건 `room-users`를 브로드캐스트하도록 변경.

프론트엔드:
- `socketService.js`: `ipRoomDevices`와 같은 패턴으로 `globalRoomDevices = ref([])` 추가. 단, `room-users` 이벤트 payload만으로는 어느 룸에서 온 것인지 구분할 수 없으므로(현재 이벤트는 `DeviceInfo[]`만 전달) — 서버 emit에 룸 식별자를 함께 실어야 한다. 이벤트 payload를 `{ roomId, devices }`로 변경하고, 프론트에서 `roomId === ipRoomId ? ipRoomDevices : roomId === globalRoomId ? globalRoomDevices`로 분기 저장한다. (백엔드 `ServerToClientEvents`의 `'room-users'` 타입도 `(payload: { roomId: string; devices: DeviceInfo[] }) => void`로 변경)
- `useSocket.js`: `globalRoomDevices: readonly(socketService.globalRoomDevices)` 추가 노출.
- `App.vue` → `RoomScreen.vue` → `ShareScopeTabs.vue`로 `ipRoomDevices`/`globalRoomDevices` 배선(기존 `devices` prop 배선과 동일 경로).

## 페이지네이션(hasMore) 조정

`useFileManager.js`의 `hasMore`는 현재 모든 룸의 토큰을 합쳐 계산한다([useFileManager.js:29-34](../../../frontend/src/composables/useFileManager.js)). 활성 탭 기준으로 "더 보기" 여부를 판단하도록 단일 룸용 computed 헬퍼를 추가한다:

```js
function hasMoreForRoom(roomId) {
  return !!roomTokens.value.get(roomId)
}
```

`RoomScreen`에는 `fileManager.hasMore.value` 대신 `fileManager.hasMoreForRoom(activeRoomId.value)`를 전달한다. `loadMore()` 자체(다음 페이지 fetch 로직)는 변경하지 않는다 — 두 룸 모두 백그라운드로 계속 페이지네이션되며, UI의 "더 보기" 버튼 노출 여부만 활성 탭 기준으로 계산한다.

## i18n

새 키 없음. 기존 `shareScope.label/ip/ipDescription/global/globalDescription`(21개 로케일 모두에 이미 존재)을 그대로 재사용한다. `ShareScopeTabs.vue`의 `role="tablist"` 컨테이너에는 `:aria-label="t('shareScope.label')"`을 부여.

## 테스트 계획

### 백엔드
- `socketHandlers` 관련 테스트(`server.test.ts`): global 룸에 대해서도 `room-users` 이벤트가 (연결/해제 시) 브로드캐스트되는지, payload가 `{roomId, devices}` 형태인지 검증하는 케이스 추가. 기존 ip 룸 케이스는 payload 형태 변경에 맞춰 갱신.

### 프론트엔드
- `ShareScopeTabs.test.js`(신규): 탭 클릭 시 `select` emit, `aria-selected`/활성 색상 클래스가 scope에 따라 정확히 바뀌는지, 각 탭에 해당 scope의 `devices`가 전달되는지 검증.
- `useFileManager.test.js`: `hasMoreForRoom(roomId)`가 룸별로 독립적으로 정확한 값을 반환하는지 케이스 추가.
- `useTextShare.test.js`: `addText(content, roomId)`가 `roomId`를 포함한 객체를 생성하는지, `removeText`가 삭제된 항목(또는 그 roomId)을 반환하는지 케이스 추가.
- `App.test.js`(있다면) 또는 통합 테스트: scope 전환 시 `visibleFiles`/`visibleTexts`가 해당 룸의 항목만 포함하는지, 텍스트 추가/삭제 시 현재 활성 scope로 발행되는지 검증.
- `FileUploadSection.test.js`: `useShareScope()` 직접 호출 제거에 따라 prop/emit 기반으로 테스트 갱신.

## 오픈 이슈 / 명시적으로 다루지 않는 것

- `FileUploadSection.vue` 오버레이 안 기존 pill 버튼과 새 `ShareScopeTabs`가 화면에 동시에 존재하게 되어 다소 중복으로 보일 수 있음 — 이번 스펙에서는 오버레이 pill을 제거하지 않고 상태만 공유시킨다. 제거 여부는 실제 화면을 보고 별도로 판단.
- 전체 공유(global) 룸은 이론상 접속자가 매우 많을 수 있어 아바타 로스터가 `+N` 배지로 대부분 뭉뚱그려질 수 있음 — 기존 `ConnectedDevices`의 `MAX_VISIBLE=4` 로직을 그대로 재사용하며 별도 스케일링 대응은 하지 않음.
- `handleRemoveText`/`handleClearAllTexts`가 텍스트의 원래 scope를 정확히 추적하지 못하는 예외 상황(예: 클라이언트 재시작 후 로컬 상태 유실)에 대한 방어 로직은 다루지 않음 — 현재도 새로고침 시 텍스트 목록 자체가 서버에 영속화되지 않아 사라짐(범위 밖).
