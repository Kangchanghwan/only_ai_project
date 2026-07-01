# ConnectedDevices 겹친 아바타 행 (Overlapping Avatar Row) 설계

## 배경

[ConnectedDevices.vue](../../../frontend/src/components/ConnectedDevices.vue)는 `devices` prop(소켓ID/브라우저/OS/기기타입)을 받아 아이콘 배지를 나란히 보여주는 컴포넌트로 이미 존재하지만, 현재 어디에도 import되어 사용되지 않는다. 백엔드도 기기별 정보(browser/os/deviceType)를 만들어 보내지 않고, 룸당 사용자 **수(number)**만 추적한다.

[DESIGN.md](../../../DESIGN.md) motion 섹션에는 이미 다음 방향이 정해져 있다:

> Presence indicator: replaces the "radar ping" convention with a simple overlapping avatar row (who's currently connected) — no scanning/searching animation, since there is no peer discovery step in this app.

이번 작업은 이 컴포넌트를 실제 데이터에 연결하고(백엔드 기기 정보 수집/브로드캐스트 + 프론트 연동), 시각적으로 "겹친 아바타 행"으로 재구성한다.

## 범위

- 백엔드: 소켓 핸드셰이크의 User-Agent를 파싱해 IP 격리 룸(`ip room`, "우리 네트워크") 단위로 접속자 기기 목록을 유지하고, 변경 시 룸에 브로드캐스트.
- 프론트엔드: 그 목록을 받아 AppHeader 좌측(로고 옆)에 겹친 아바타 행으로 렌더링.
- **범위 밖**: 전체 공유(global) 룸의 접속자 목록 브로드캐스트(카운트만 기존대로 유지), 자기 자신 강조 표시, 카드 랜딩 애니메이션과의 통합.

## 백엔드 설계

### 1. UA 파서 — `backend/src/utils/deviceInfo.ts` (신규)

외부 의존성 없이 정규식 기반으로 파싱하는 경량 유틸리티.

```ts
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
    socketId: string;
    deviceType: DeviceType;
    browser: string;
    os: string;
}

export function parseDeviceInfo(userAgent: string | undefined, socketId: string): DeviceInfo
```

- `deviceType` 판별 순서: tablet(`iPad|Android(?!.*Mobile)|Tablet|PlayBook`) → mobile(`iPhone|iPod|Android.*Mobile|Windows Phone|Mobi`) → 기본 desktop.
- `browser` 판별 순서(우선순위 중요 — Edge/Opera가 Chrome UA 문자열을 포함하므로 먼저 검사): Edge(`Edg/`) → Opera(`OPR/|Opera`) → Chrome(`Chrome/`, 단 Edg/OPR 제외) → Firefox(`Firefox/`) → Safari(`Safari/`, 단 Chrome 제외) → `Unknown`.
- `os` 판별: Windows → macOS(`Mac OS X`) → iOS(`iPhone OS|iPad.*OS|iOS`) → Android → Linux → `Unknown`.
- `userAgent`가 없거나 매칭 실패 시 `{ deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' }`.

### 2. RoomManager — `RoomData.userCount` → `RoomData.users` Map으로 교체

카운트와 기기 목록이 서로 다른 소스로 존재하면 drift(카운트와 실제 목록 불일치) 위험이 있으므로, **Map을 단일 소스**로 삼고 카운트는 `.size`로 파생한다.

```ts
export interface RoomData {
    users: Map<string, DeviceInfo>; // key: socketId
    createdAt: Date;
    cleanupTimer?: ReturnType<typeof setTimeout>;
}
```

시그니처 변경:
- `addUserToRoom(roomId: string, socketId: string, deviceInfo: DeviceInfo): number` — Map에 set 후 `users.size` 반환.
- `removeUserFromRoom(roomId: string, socketId: string): Promise<number>` — Map에서 delete 후 size 반환. size가 0이면 기존과 동일하게 grace period 정리 스케줄링.
- `getRoomUserCount(roomId): number` — `users.size` 반환(기존 유지).
- `getRoomUsers(roomId: string): DeviceInfo[]` (신규) — `Array.from(users.values())`.
- `getTotalUsers()` — 각 방의 `users.size` 합산으로 변경.

기존 `addUserToRoom(roomId)` / `removeUserFromRoom(roomId)` 단독 인자 호출부(`RoomManager.test.ts` 등)는 모두 `socketId`, `deviceInfo`를 전달하도록 갱신한다. 테스트에서는 더미 `DeviceInfo` 픽스처를 사용.

### 3. socketHandlers — 연결/해제 시 기기 정보 수집 및 IP 룸 roster 브로드캐스트

`handleConnection`:
1. `parseDeviceInfo(socket.handshake.headers['user-agent'], socket.id)` 로 기기 정보 계산 (신규 연결·recovery 연결 공통, recovery 시에도 handshake UA는 그대로 재사용 가능).
2. `roomManager.addUserToRoom(globalRoomId, socket.id, deviceInfo)`, `roomManager.addUserToRoom(ipRoomId, socket.id, deviceInfo)` 호출.
3. `io.to(ipRoomId).emit('room-users', roomManager.getRoomUsers(ipRoomId))` — 새 유저 본인 포함, 같은 IP 룸의 기존 멤버 전원에게 갱신된 목록 전송.
4. global room에는 roster를 보내지 않음(기존처럼 카운트 기반 흐름 유지, `user-left` 이벤트는 변경 없음).

`handleDisconnect`:
- 기존 루프(`[socket.globalRoomId, socket.ipRoomId]`)에서 `removeUserFromRoom(roomId, socket.id)`로 변경.
- `roomId === socket.ipRoomId`인 경우에 한해 `io.to(ipRoomId).emit('room-users', roomManager.getRoomUsers(ipRoomId))` 추가 브로드캐스트.

### 4. 타입 — `backend/src/types/index.ts`

- `DeviceInfo`, `DeviceType`을 `deviceInfo.ts`에서 re-export(또는 그대로 import해서 사용).
- `ServerToClientEvents`에 `'room-users': (devices: DeviceInfo[]) => void;` 추가.

## 프론트엔드 설계

### 1. socketService.js

- `this.ipRoomDevices = ref([])` 추가.
- `connect()` 내 소켓 리스너 등록부에 `this.socket.on('room-users', (devices) => { this.ipRoomDevices.value = devices })` 추가.
- `disconnect()`에서 `this.ipRoomDevices.value = []`로 초기화(기존 `usersInRoom = 0` 리셋과 동일 패턴).

### 2. useSocket.js

- 반환 객체에 `ipRoomDevices: readonly(socketService.ipRoomDevices)` 추가.

### 3. App.vue → RoomScreen.vue → AppHeader.vue → ConnectedDevices.vue 배선

실제 컴포넌트 계층은 `App.vue`가 `RoomScreen.vue`에 `user-count`를 넘기고, `RoomScreen.vue`가 다시 `AppHeader.vue`에 전달하는 구조다. `devices`도 동일한 경로로 한 단계씩 통과시킨다.

- `App.vue`: `<RoomScreen :devices="socket.ipRoomDevices.value" ... />` (기존 `:user-count="socket.usersInRoom.value"` 옆).
- `RoomScreen.vue`: `devices` prop(Array, default `[]`) 추가, `<AppHeader :devices="devices" ... />`로 전달.
- `AppHeader.vue`: `devices` prop(Array, default `[]`) 추가. 템플릿에서 로고(📋 + 타이틀) 바로 옆에 `<ConnectedDevices :devices="devices" />` 배치.

### 4. ConnectedDevices.vue — 겹친 아바타 행 스타일

기존 `getDeviceIcon`, `getDeviceLabel` 로직은 유지. 템플릿만 아래 방향으로 교체:

- 컨테이너: 텍스트 라벨(`room.connectedDevices`) 스팬은 시각적으로 제거하고, 대신 컨테이너에 `:aria-label="t('room.connectedDevices')"`, `role="group"`을 부여(새 i18n 키 추가 없음).
- 아바타: `w-8 h-8 rounded-full ring-2 ring-background bg-primary/10 flex items-center justify-center text-base` — 기존 `rounded-md`(사각형 배지)를 `rounded-full`로, 사이즈를 7→8(28px→32px)로 소폭 확대.
- 겹침: 첫 번째를 제외한 모든 아바타에 `-ml-2`(-8px) 음수 마진. 먼저 접속한 사람이 위로 오도록 `style="z-index: {{ devices.length - index }}"` (또는 동등한 계산된 바인딩)로 명시적 z-index 부여.
- hover 인터랙션: `hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150` — 인라인 `style="z-index: ..."`는 일반 클래스보다 우선순위가 높으므로, hover 시 이를 덮어쓰려면 Tailwind의 important 수식자가 반드시 필요함. 이 프로젝트는 **Tailwind CSS v4**(`hover:z-20!`, trailing `!`)를 사용하므로 v3 문법(`!z-20`, leading `!`)을 쓰지 않도록 주의. non-important `hover:z-20`로는 인라인 z-index를 덮어쓰지 못해 hover 시 앞으로 나오지 않는 버그가 생긴다.
- **오버플로우**: `devices`가 5개 초과일 때 앞 4개만 아바타로 표시 + 마지막 슬롯에 `+N` 원형 배지(`bg-border text-text-secondary text-xs font-semibold`, 나머지 인원 수 `N = devices.length - 4`). 배지의 `title`은 초과분 기기 라벨을 줄바꿈/쉼표로 나열.
  - (4+1=5개 슬롯 고정: 아바타 최대 4개 + 배지 1개 = 화면에 보이는 원은 항상 5개 이하)
- **entrance/exit 애니메이션**: `<TransitionGroup>`으로 감싸고 CSS 트랜지션(opacity 0→1, scale .8→1, ~200ms ease-out)만 적용. 카드 랜딩용 `createEnterStagger`/spring-bounce는 재사용하지 않음(프레즌스 인디케이터는 "스캐닝 없음" 원칙 — DESIGN.md 그대로).

## 테스트 계획

### 백엔드
- `deviceInfo.test.ts` (신규): 대표 UA 문자열(iPhone Safari, Android Chrome, iPad Safari, Windows Chrome, Mac Firefox, UA 없음)에 대해 `deviceType/browser/os` 기대값 검증.
- `RoomManager.test.ts`: 기존 테스트를 새 시그니처(`socketId`, `deviceInfo` 인자)로 갱신. `getRoomUsers`가 추가/제거에 따라 정확한 목록을 반환하는지 검증하는 케이스 추가.
- `server.test.ts`: 같은 IP로 두 소켓이 연결되면 두 클라이언트 모두 `room-users` 이벤트로 길이 2인 목록을 받고, 한쪽이 disconnect하면 남은 클라이언트가 길이 1인 목록을 받는 통합 테스트.

### 프론트엔드
- `ConnectedDevices.test.js` (신규): 0개(렌더 안 됨), 1~5개(겹침 클래스/개별 아바타), 6개 이상(앞 4개 + `+N` 배지, N 값 정확성) 케이스.
- `socketService.test.js`: `room-users` 이벤트 수신 시 `ipRoomDevices` 갱신, disconnect 시 초기화 검증 케이스 추가.
- `AppHeader.test.js`: `devices` prop 전달 시 `ConnectedDevices`가 렌더되는지 확인하는 케이스 추가.

## 오픈 이슈 / 명시적으로 다루지 않는 것

- Connection State Recovery로 재연결된 소켓은 새 `socket.id`를 받을 수 있어 아바타가 "새로 입장"한 것처럼 보일 수 있음 — 기존 `user-left`/카운트 로직도 동일한 특성을 가지고 있어 이번 작업에서 별도로 보정하지 않음.
- 본인 아바타 강조 표시(예: "You" 라벨)는 이번 스펙에 포함하지 않음.
