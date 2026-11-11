# 그룹 방: 여러 기기가 QR·링크로 들어오는 비공개 방 (설계)

작성 2026-11-12. owner 결정(2026-11-12): "1:1이 아닌 일대다로 여러 명이 방에 들어올 수 있게 하는 게 우선". 보관 기간과 용량 상한은 보류 → 지금 1:1 방과 같다(파일 최대 1일, 텍스트 10분, 방 총량 기존 한도).

## 요약
- 기존 1:1 연결(기기 목록에서 초대 → 그림 4개 확인)은 **그대로 둔다**. 1:1 방을 그룹으로 바꾸는 기능은 만들지 않는다.
- 새로 "그룹 방"을 만든다. 만든 사람이 QR/링크를 보여 주면 다른 기기가 들어온다. 로그인 없음. 네트워크가 달라도 된다.
- 암호화는 1:1 방과 같은 규격을 재사용한다(`deriveRoomLock(roomSecret, roomId)` → 기존 잠금 업로드·텍스트 암호화). 서버는 방 비밀을 보지 못한다.
- 서버는 지금처럼 무상태다(입장권 HMAC 검증만). 새 저장소 없음.

## 식별자
- 그룹 방 ID: `prv-g-<hex 24>`. 1:1 방은 기존 `prv-<hex 24>`.
- 백엔드 `utils/privateRoom.ts`: `PRIVATE_ROOM_RE = /^prv-(g-)?[0-9a-f]{24}$/`, `newGroupRoomId()`, `isGroupRoomId()`.
- 프론트에도 `isGroupRoomId(roomId)` 유틸을 둔다(방 종류는 ID로만 판단, 저장 필드 추가 없음).
- **roomId 형식을 검사하는 모든 곳을 찾아** `prv-g-…`도 받게 한다(백엔드 routes/locked, multipart, 텍스트, roomToken, R2 키 생성, textQueueStore 키 파싱, 프론트 lockedLink·router 등). `startsWith('prv-')` 판정은 그대로 참이다. 찾은 곳 목록을 보고에 적는다.

## 초대 링크
`<origin>/#/pv?r=<roomId>&t=<초대 입장권>&k=<방 비밀 32바이트 base64url>&n=<방 이름 URL 인코딩>`
- 전부 프래그먼트라 서버로 가지 않는다. `frontend/index.html`의 GA 이전 스크립트(지금 `#/lk?`를 `window.__csLockedLink`로 옮기고 해시를 지우는 부분)에 `#/pv?`를 추가해 `window.__csGroupInvite`에 옮기고 주소창에서 지운다.
- origin은 기존 QR(파일 QR)이 쓰는 방식과 같게 한다.
- 초대 입장권: 기존 입장권과 같은 형식, 만료만 짧다(기본 600초, env `PRIVATE_INVITE_TTL_SEC`). `issueTicket(roomId, ttlSec?)`.
- 들어오면 기존 `private:join`이 30일 입장권을 새로 준다(지금 동작).
- 파싱 검증(`frontend/src/utils/groupInvite.js`: `buildInviteUrl`, `parseInvite`): r은 그룹 방 ID 정규식, t는 `pv1.`로 시작·200자 이하, k는 디코드하면 정확히 32바이트, n은 trim 후 제어문자 제거·20자 이하(없으면 기본 이름). 하나라도 틀리면 무시하고 `group.inviteInvalid` 토스트.

## 방 비밀 보관
- 그룹 방은 나중에도 초대 QR을 만들어야 하므로 방 비밀 원본 32바이트를 IndexedDB 레코드에 `inviteSecret`(Uint8Array)로 함께 저장한다. 1:1 방은 지금처럼 비추출 HKDF 키만 저장한다.
- 보안 차이 메모: 같은 출처 스크립트는 비추출 키로도 `deriveBits`로 master를 얻을 수 있고 입장권도 IndexedDB에 있으므로, 원본 보관으로 새로 열리는 공격면은 없다고 판단. 설계서에 그대로 남긴다.
- 레코드에 `name`(문자열)도 저장. 객체 저장소 키가 roomId라 DB 버전 올림은 필요 없다(필드 추가만). 메모리 대체 저장소도 같게.

## 백엔드 (socketHandlers.ts)
모두 기존 `pairAllowed` 토큰 버킷 뒤에 둔다.
1. `private:create` (ack): 등록된 소켓만. `getPrivateRooms(socket).length >= MAX_PRIVATE_ROOMS_PER_SOCKET`이면 `{error:'TOO_MANY_ROOMS'}`. roomId = `newGroupRoomId()`. `private:join`이 방에 넣는 코드와 같은 경로로 입장(공통 함수로 뽑는다). ack `{roomId, ticket, roomToken, roomTokenTtlSec, devices}`.
2. `private:invite {roomId}` (ack): 그룹 방이고 호출자가 멤버일 때만 `{ticket, expiresAt}`(ms). 아니면 `{error:'NOT_ALLOWED'}`.
3. `private:join`: 그룹 방이고, 이 소켓이 아직 멤버가 아니고, `roomManager.getRoomUserCount(roomId) >= 상한`이면 입장시키지 않고 응답의 `full: [roomId]`에 넣는다(`invalid`에 넣지 않는다 → 클라이언트가 방 기록을 지우면 안 됨). 상한: env `PRIVATE_GROUP_MAX_MEMBERS`, 기본 10(동시에 접속한 기기 수).
4. `alreadyPaired`(1:1 초대 차단)는 1:1 방만 본다(그룹 방을 같이 쓰는 기기끼리도 1:1 초대 가능).
5. `private:leave`: 그대로. 남은 멤버에게 가는 알림도 그대로(프론트가 그룹 방이면 방을 지우지 않음).
6. 텍스트 큐 한도(방 20개, 보낸 기기당 10개)는 그대로 두되 그룹 방에서 깨지는 가정이 없는지 확인.

### 백엔드 테스트 (`src/__tests__/group.socket.test.ts` 등)
- ID: `prv-g-` 형식 통과, 잘못된 형식 거부, 1:1 형식 회귀 없음
- 입장권: ttl 지정, 만료된 초대 입장권은 invalid
- 흐름: A create → A invite → B가 초대 입장권으로 join → B가 30일 입장권 받음, 둘 다 `room-users`에 2대 → C join → 3대
- 상한: env 2로 두고 세 번째는 `full`
- 비멤버의 invite 거부, 1:1 방 ID로 invite 거부
- 그룹 방을 같이 써도 `pair:invite`가 `ALREADY_PAIRED`로 막히지 않음
- 그룹 방에 publish하면 멤버 전원이 받음, 비멤버는 못 받음
- 잠금 업로드 경로·룸 토큰 검사가 그룹 방 ID를 받음(일반 업로드는 기존처럼 `PRIVATE_ROOM_LOCKED_ONLY`)

## 프론트
### 데이터·서비스
- `usePrivateRooms.addRoom({roomId, peer=null, roomSecret, ticket, name})`: 그룹이면 `inviteSecret`·`name` 저장, rec에 `name`. `hydrate`가 `name` 복원. `inviteSecretFor(roomId)`(저장소에서 읽음).
- `socketService`: `createPrivate()`, `invitePrivate(roomId)`, `joinPrivate`가 `full`도 돌려줌.
- 새 composable `useGroupRooms.js`:
  - `createRoom()`: `newRoomSecret()` → `createPrivate()` → `addRoom` → 스코프를 그 방으로 → 초대 시트 열기. 이름 기본값은 `"{내 이름}의 방"`(내 기기 이름 = identity 이름, 로케일 문구 `group.defaultName` `{name}` 사용).
  - `openInvite(roomId)`: `invitePrivate` → `buildInviteUrl` → QR.
  - `acceptInvite(parsed)`: **자동 입장 금지. 반드시 확인 시트를 거친다.** 이미 가진 방이면 스코프만 전환하고 `group.alreadyIn` 토스트. 확인 → 소켓 등록 대기 → `joinPrivate([t])` → 성공: `addRoom`(새 30일 입장권으로) → 스코프 전환 → `group.joined` 토스트 / `invalid`: `group.inviteExpired` / `full`: `group.full` / 내 방이 이미 10개: `group.tooMany`.
- `App.vue`:
  - 마운트 시 `window.__csGroupInvite`를 파싱해 `acceptInvite`.
  - 재접속 rejoin: 그룹 방은 `setPeer` 건너뜀. `full`에 든 방은 지우지 않고 상태 offline + `group.full` 토스트 1회.
  - `handlePrivateLeftMessage`: 그룹 방이면 방을 `left`로 만들거나 지우지 않는다(기기 목록은 `room-users`로 갱신됨).
  - 방 상태(online/offline)는 지금처럼 "다른 기기가 하나라도 있으면 online".
- `usePairFlow.pairStates`, `handlePaired` 등 `peer` 단수 가정 코드는 그룹 방(`peer` 없음)에서 예외가 나지 않게 한다.

### 화면
- `GroupInviteSheet.vue`: QR(기존 `qrcode` 사용 방식), "링크 복사" 버튼, 안내 2줄: `group.inviteExpiry`("이 QR은 10분 동안 쓸 수 있어요"), `group.inviteWarning`("QR이나 링크를 가진 사람은 누구나 이 방에 들어올 수 있어요. 믿는 사람에게만 보여 주세요"). 열 때마다 새 초대 입장권.
- `GroupJoinSheet.vue`(확인): 제목 `group.joinTitle`("'{name}' 방에 들어갈까요?"), 본문 `group.joinBody`("이 방에 올린 파일과 텍스트는 방에 있는 모든 기기가 볼 수 있어요"), 버튼 들어가기/취소.
- 진입점 2곳:
  1. `ShareScopeTabs.vue`: 탭 줄 끝에 "＋ 방" 버튼(`data-testid="group-create"`, aria-label `group.create`).
  2. `ConnectionCard.vue` 빈 방 안내(혼자일 때) 맨 아래 한 줄 버튼: `group.emptyCta`("다른 와이파이나 데이터를 쓰는 기기와 연결하려면 방을 만드세요", `data-testid="empty-state-group-create"`). **ConnectionCard의 iOS 단축어 상수·링크(25~27행, 180~186행)는 건드리지 않는다**(다른 작업이 수정 중).
- `PrivateRoomStrip.vue`: 그룹 방이면 제목 = 방 이름, 상태 = `group.members`("기기 {n}대") 또는 `group.alone`("아직 나만 있어요"), "초대" 버튼(`data-testid="group-invite"`), 메뉴 "방 나가기"(`group.leave`, 확인 문구 `group.leaveConfirm`: "이 기기에서만 방을 지워요. 다른 기기는 계속 쓸 수 있어요").
- `ShareScopeTabs.vue`: 그룹 방 탭은 방 이름 + 여러 사람 아이콘. 1:1 탭 로직(단일/여러 개 팝오버)은 그룹 방을 같은 목록에 넣되 이름·아이콘만 다르게.
- `RoomScreen.vue`: 그룹 방에서 `room.peer` 대체 목록·`reinviteDevice`를 쓰지 않게. 방 안 기기 목록에서 1:1 버튼은 그대로 둬도 된다.
- 방 색(accent)은 기존 비공개 방 색 그대로.

### 분석
`group_create`, `group_invite_open`, `group_invite_copy`, `group_join {result: joined|expired|full|invalid|already|cancel}`, `group_leave`.

### i18n 삽입 위치
새 최상위 블록 `"group"`을 **`"pair"` 블록 바로 뒤**에 넣는다. 키(최소): `create`, `defaultName`, `emptyCta`, `invite`, `inviteTitle`, `inviteCopy`, `inviteCopied`, `inviteExpiry`, `inviteWarning`, `inviteInvalid`, `inviteExpired`, `joinTitle`, `joinBody`, `joinAction`, `cancel`, `joined`, `alreadyIn`, `full`, `tooMany`, `members`, `alone`, `leave`, `leaveConfirm`.

### 프론트 테스트
- `groupInvite.js`: 왕복, 각 검증 실패
- `usePrivateRooms`: 그룹 방 저장·복원(`inviteSecret`, `name`), 1:1 방 회귀 없음, 같은 비밀로 두 "기기"가 같은 `vh`를 얻음
- `useGroupRooms`: create, invite, accept 각 결과(확인 전에는 join 호출 없음)
- 컴포넌트: 초대 시트, 확인 시트, Strip(그룹), Tabs(그룹+1:1 혼합), ConnectionCard 진입 버튼
- App: `__csGroupInvite` 처리, 그룹 방에서 `private-left`가 방을 지우지 않음, rejoin `full`

## 알려진 한계 (v1)
- 멤버 내보내기 없음(입장권이 방 단위 bearer). 잘못 들어온 기기가 있으면 새 방을 만든다. "열쇠 바꾸기"는 후속.
- 카메라 없는 PC는 링크 복사로 들어온다. 짧은 코드+PIN 입장은 후속.
- 초대 QR은 10분. 기간 선택은 후속.

## 구현 메모 (2026-11-12, 구현하며 달라진 점)
- **`issueTicket` 시그니처**: 기존 호출자와 테스트(`issueTicket(roomId, nowSec)`)를 그대로 두려고 `issueTicket(roomId, nowSec = now, ttlSec = 30일)`로 세 번째 인자를 더했다. 초대 입장권은 `issueTicket(roomId, nowSec, getPrivateInviteTtlSec())`(기본 600초, env `PRIVATE_INVITE_TTL_SEC`).
- **ack 형태**: `private:create`, `private:invite` 성공은 `{ok:true, ...}`, 실패는 `{ok:false, error:'TOO_MANY_ROOMS'|'NOT_ALLOWED'|'NOT_REGISTERED'}`(pair 이벤트의 `{ok,code}`와 달리 `error` 키. 스펙 표기를 따랐다). `private:create`는 payload 없이 ack만 보내도 받는다. 소켓당 방 상한은 `MAX_PRIVATE_ROOMS_PER_SOCKET`(10) 그대로.
- **정원 초과**: `private:join` 응답에 `full: string[]`를 항상 넣는다. 프론트 `joinPrivate`는 기존 테스트 호환을 위해 `full`이 비어 있지 않을 때만 결과에 `full` 키를 넣는다. 이미 멤버인 소켓의 재입장(연결 복구, 같은 소켓의 중복 join)은 정원에 걸리지 않는다. 연결 복구 경로(`handleConnection`)는 기존대로 정원 검사 없이 복원한다(원래 멤버였으므로).
- **공통 함수**: `enterPrivateRoom()`을 뽑아 `private:join`과 `private:create`가 같이 쓴다. 1:1 방 생성(`createPairRoom`)은 손대지 않았다.
- **roomId 형식 검사 지점**: 백엔드 `privateRoom.ts` 정규식(`prv-(g-)?hex24`, 그룹 전용 `isGroupRoomId`), `privateTicket.verifyTicket`(`isPrivateRoomId` 경유), `RoomManager._cleanupRoom`(`isPrivateRoomId` 경유: 그룹 방도 빈 방 정리 때 파일을 지우지 않음), `textQueue.ts`(`isPrivateRoomId` 경유 + `isQueueRoomId`는 `[A-Za-z0-9-]{1,100}`이라 통과), `routes/texts.ts`(`isPrivateRoomId` 경유), `routes/locked.ts`(`isRoomId` `[A-Za-z0-9-]{1,100}` 통과), `middleware/rejectPrivateRoom.ts`(접두사 `prv-`만 봄), `socketHandlers.handlePublish`/`private:leave`(`isPrivateRoomId` 경유). 룸 토큰(`roomToken.ts`)과 R2 키(`<roomId>/<id>`, `_texts/<roomId>/<textId>.json`)는 형식 검사가 없고 roomId를 그대로 쓴다. 프론트는 `lockedLink.js`(`ROOM_ID` 통과), `useRoomManager`(`startsWith('prv-')`), `socketService`의 `room-users`(`startsWith('prv-')`)가 그대로 참이고, 새로 `utils/groupRoom.js`·`groupInvite.js`가 그룹 전용 검사를 한다. `router.js`는 `#/pv?`를 만들지 않는다(`index.html`이 주소창에서 미리 지움).
- **화면 키 추가**: 최소 키 외에 `createShort`("방", 탭 끝 버튼 글자), `close`(초대 시트 닫기), `unnamed`(이름 없는 초대로 들어온 방의 표시 이름)를 더했다.
- **"＋ 방" 버튼·빈 방 CTA는 1:1 연결 기능이 켜진 경우(`pairEnabled`/pair 문맥)에만** 보인다(소켓 어댑터가 없는 테스트 환경에서 기존 화면이 바뀌지 않게).
- **로케일 삽입 위치**: `pair` 블록이 있는 로케일은 ko, en 둘뿐이다(나머지 19개는 영어로 폴백). 그 둘은 `pair` 바로 뒤, 나머지 19개는 `pair`가 없어 `arrival` 블록 바로 앞에 `group`을 넣었다. 그래서 다른 언어에서 `pair.errors.generic` 같은 공용 안내는 영어로 폴백된다(기존 동작).
- **방 이름**: 초대 링크의 이름뿐 아니라 저장 전에도 `sanitizeRoomName`을 거친다(제어문자와 글자 방향 바꾸는 문자 제거, trim, 20자).
- **앱 시작 직후 링크**: `acceptInvite`는 저장된 방 목록 복원(`hydrate`)을 기다린 뒤 "이미 가진 방"을 판단한다.
- **보안 점검 메모**: 방 비밀 원본(`inviteSecret`)은 IndexedDB 레코드에만 있고 반응형 방 목록(`rooms`)에는 없다. 초대 링크는 시트가 열려 있는 동안만 메모리에 있고 닫으면 지운다. 분석 이벤트(`group_*`)에는 파라미터가 `group_join.result` 하나뿐이다. 서버 로그에는 방 생성/ID만 남고 입장권 값은 쓰지 않는다. 만료된 그룹 방 입장권(30일)으로 재입장이 거부되면 기존 `pair.expired` 안내가 뜬다(문구가 1:1 기준). 후속에서 그룹 전용 문구로 바꿀 수 있다.
