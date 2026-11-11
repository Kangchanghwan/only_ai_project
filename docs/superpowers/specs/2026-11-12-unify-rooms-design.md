# D. 1:1 방과 그룹 방을 하나의 "방"으로 합치기

owner 결정(2026-11-12): "1:1과 그룹방은 같은 개념. 처음엔 둘이지만 이후 사람을 초대하면 하나의 방". 방 개념을 하나로 만든다.

- WORKTREE: `/tmp/cs-unify`, BRANCH: `pr/20261112-unify-rooms` (origin/master 기준)
- 공통 규칙: `COMMON.md` (같은 폴더). 설계서 파일명 `docs/superpowers/specs/2026-11-12-unify-rooms-design.md`
- 현재 구조는 master의 `docs/superpowers/specs/2026-11-12-group-rooms-design.md`(그룹 방)와 `2026-10-15-private-pair-rooms-design.md`(1:1)를 먼저 읽는다.
- 이 작업과 **병행해서** 다른 에이전트가 "그림 코드 입장"(새 파일 위주: `backend/src/handlers/codeHandlers.ts`, `backend/src/services/codeRegistry.ts`, `frontend/src/utils/spake2.js`, `frontend/src/utils/pictureCode.js`, `frontend/src/services/codeJoin.js`, `frontend/src/components/PictureCode*.vue`, 로케일의 새 `code` 블록)을 만든다. 그 파일들은 만들지 말고, 로케일에 `code` 블록을 넣지 않는다.

## 목표 동작
1. **새로 만드는 비공개 방은 전부 "초대 가능한 방"**이다.
   - 기기 목록의 1:1 연결(그림 확인)로 만든 방도 서버에서 `newGroupRoomId()`(`prv-g-…`)로 만든다(`createPairRoom`).
   - 프론트 `usePrivateRooms.addRoom`은 `prv-g-` 방이면 이미 `inviteSecret`을 저장한다 → 1:1로 시작한 방에서 "초대"를 누르면 QR·링크가 나오고, 들어온 기기가 생기면 그냥 3대짜리 방이 된다.
   - 인원 상한(`PRIVATE_GROUP_MAX_MEMBERS`, 기본 10)도 똑같이 적용된다.
2. **예전 방(`prv-<hex24>`, 이미 만들어진 1:1 방)**은 그대로 동작한다(입장권 30일이 지나면 자연히 사라짐). 이 방에서 "초대"를 누르면 시트 대신 안내: `room.legacyInviteTitle`("예전 방식으로 만든 방이라 초대할 수 없어요"), `room.legacyInviteBody`("새 방을 만들어 이 기기와 다른 기기를 함께 넣어 주세요"), 버튼 `room.legacyInviteCreate`("새 방 만들기") → 기존 `createRoom()`.
3. **이름과 표시**: 모든 방은 이름이 있다.
   - "＋ 방"으로 만든 방: 지금처럼 `"{내 이름}의 방"`.
   - 1:1 연결로 만든 새 방: 양쪽 기기가 같은 이름을 갖도록 **연결을 요청한 기기(initiator)의 이름**으로 `group.defaultName`을 쓴다. 각 기기는 pairing의 role과 peer 정보로 initiator 이름을 안다(받은 쪽은 peer가 initiator). 저장 시 `name`에 넣는다.
   - 예전 방: 이름이 없으면 지금처럼 상대 기기 이름 기준 표시를 유지한다(기존 `pair.tabTitle` 등 그대로 써도 됨. 단 화면 문구에서 "1:1"은 빼고 아래 규칙대로).
   - 탭·스트립 제목 = 방 이름. 상태 줄: 다른 기기가 0대면 `group.alone`, 1대 이상이면 `group.members`("기기 {n}대", 나 포함 총 대수, 지금 의미 유지) 뒤에 다른 기기 이름을 최대 2개 `·`로 붙인다(예: "기기 2대 · 졸린 판다"). 아바타는 다른 기기들(최대 3개 겹쳐서)로.
4. **화면 문구에서 "1:1" 없애기**: ko/en의 `pair.*`, `text.storagePrivate`, `dropOverlay.toPair` 등 사용자에게 보이는 문구를 "방" 기준으로 바꾼다. 기준(ko):
   - 기기 행 버튼 `pair.button`: "방으로 연결", `pair.buttonShort`: "연결", 이미 같은 방이면 `pair.paired`: "같은 방"
   - `pair.hint`: "기기를 누르면 둘이 쓰는 방을 만들 수 있어요. 나중에 다른 기기도 초대할 수 있어요"
   - `pair.request.title`: "방 연결 요청", `pair.request.announce`: "{name}가 방 연결을 요청했어요"
   - `pair.openRoom`: "{name}(으)로 이동" 류 → 방 이름 기준으로. `pair.tab`/`pair.tabMany`: "방"/"방 ({n})"
   - `pair.leaveConfirmTitle`: "방에서 나갈까요?" (그룹과 같은 의미: 이 기기에서만 지움)
   - `pair.expired`: "방 입장권이 만료됐어요. 다시 연결해 주세요", `pair.errors.noRoom`: "방을 찾을 수 없어요"
   - `text.storagePrivate`: "방 키로 암호화해서 10분 보관", `dropOverlay.toPair`: "이 방으로 보내요"
   - en도 같은 의미로("1:1" 대신 room). 나머지 19개 로케일은 `pair` 블록이 없으니 그대로 둔다(영어 폴백). `group.*` 키는 이미 21개에 있으니 필요하면 재사용한다.
   - `group.textNote`/`group.expired`/`group.dropTo` 같은 그룹 전용 분기는 이제 의미가 같아지므로 정리해도 되지만, **키 삭제는 하지 말고** 코드 분기만 단순화(없어도 되는 분기는 제거)한다. 테스트 기대값을 바꾸면 이유를 보고.
5. **같은 두 기기의 중복 방 막기(서버 `alreadyPaired`)**: 지금은 1:1 방만 본다. 바꿀 규칙: 두 기기가 함께 있는 비공개 방 중 **지금 접속 중인 멤버가 정확히 그 두 기기뿐인 방**이 있으면 `ALREADY_PAIRED`. 3대 이상 쓰는 방을 같이 쓰는 것은 막지 않는다(그 안에서 둘만의 방을 따로 만들 수 있게). 예전 `prv-` 방은 지금처럼 막는다.
6. **나가기·떠남 처리**: `handlePrivateLeftMessage`에서 지금 1:1 방은 상대가 나가면 방을 `left`로 바꾸거나 지우는데, 새 방(`prv-g-`)은 그룹과 같게(지우지 않음). 예전 `prv-` 방은 기존 동작 유지.
7. **`peer` 단수 가정 정리**: 새 방도 1:1로 만들었으면 `peer`가 있을 수 있다. 화면은 `peer`가 아니라 `room-users`(현재 기기 목록)를 기준으로 그린다. `RoomScreen`의 `reinviteDevice`(상대가 오프라인일 때 다시 연결)는 예전 방에서만 쓰거나, 새 방에서는 숨긴다. 판단을 설계서 구현 메모에 적는다.
8. **분석**: 1:1로 만든 방도 `pair_*` 이벤트는 그대로. 새 이벤트 `room_legacy_invite`(예전 방 초대 시도) 하나만 추가.

## 손대지 말 것
- 암호화 규격(`pairCrypto.js`, `lockCrypto.js`, 방 비밀 → `deriveRoomLock`)과 입장권 형식은 그대로.
- 1:1 연결 절차(요청 → 그림 4개 확인 → 방 생성)도 그대로. 바뀌는 건 만들어지는 방의 ID 종류, 이름, 표시뿐.
- `ConnectionCard.vue`의 iOS 단축어 부분, `next-time-hint`, 푸시(`usePush`, `pushNotifier`) 관련 코드.

## i18n
- 새 키 `room.legacyInviteTitle`, `room.legacyInviteBody`, `room.legacyInviteCreate`: 21개 로케일 전부 실제 번역. 삽입 위치: 각 로케일의 `room` 블록 **맨 끝**. `room` 블록이 없는 로케일이 있으면 보고.
- 테스트: `frontend/src/i18n/i18n.unify.test.js` 새 파일에 새 키 검사 + "ko·en의 pair·group·text·dropOverlay 블록 문자열에 '1:1'이 없다" 검사. `i18n.test.js`는 건드리지 않는다.

## 테스트 (최소)
- 백엔드: 1:1 연결 완료 시 방 ID가 `prv-g-` 형식, 그 방에 `private:invite`가 되고 세 번째 기기가 초대 입장권으로 들어오면 3대. 예전 `prv-` 방은 invite `NOT_ALLOWED`. `alreadyPaired` 새 규칙(둘만 있는 방 → 막음, 3대 방 → 허용, 예전 방 → 막음).
- 프론트: pair 완료 → `addRoom`에 `name`(initiator 이름)·`inviteSecret` 저장, 양쪽 role에서 같은 이름. 새 방 Strip에 초대 버튼, 예전 방은 안내 시트. 상대가 나가도 새 방은 남음, 예전 방은 기존 동작. 상태 줄 "기기 2대 · 이름" 형식. 문구 "1:1" 없음.
- 기존 테스트 중 "1:1" 문구나 `prv-` 형식을 기대하는 것은 의미를 지키며 고치고, 몇 개를 왜 고쳤는지 보고한다.

## 보고에 꼭 넣을 것
- ko 화면에서 "1:1"이 남은 곳(문구 키가 아닌 하드코딩 포함) 검색 결과: `grep -rn "1:1" frontend/src --include=*.vue --include=*.js | grep -v test` 결과 요약
- `frontend/public/how-to-use.html`, `frontend/public/guide/**`에 "1:1 연결" 문구가 몇 곳 있는지(수정은 하지 말고 개수와 파일만)

## 구현 메모 (2026-11-12, 구현하며 달라진 점)
- **방 ID**: `createPairRoom`이 `newGroupRoomId()`로 방을 만든다. 서버 `newPrivateRoomId` import는 쓰는 곳이 없어 지웠다(유틸 함수와 예전 `prv-` 검증은 그대로).
- **`alreadyPaired`**: 두 기기가 같이 든 방 중 예전 `prv-` 방이 있거나, 새 방 중 현재 접속 멤버 수가 정확히 2인 방이 있으면 `ALREADY_PAIRED`. 접속 기준이라 한 기기가 잠시 끊겨 있으면 그 사이에는 막히지 않는다.
- **방 이름**: `pairing.js`가 `onPaired`에 `role`을 같이 준다. `usePairFlow.handlePaired`가 initiator면 내 이름(`getMyName`), responder면 peer 이름으로 `group.defaultName`을 만들어 `addRoom({name})`에 넣는다. 양쪽이 같은 이름이 된다.
- **"같은 방" 표시(`pairStates`)**: 새 방은 `getRoomDeviceCount`(현재 접속 기기 수)가 정확히 2일 때만 기기 행을 "같은 방"으로 본다(3대 이상이면 그 안에서 둘만의 방을 따로 만들 수 있게 서버 규칙과 맞춤). 새 방의 `peer`는 메모리에만 있어 새로고침하면 사라진다(`hydrate`가 그룹 방 peer를 비움). 그 뒤에는 버튼이 다시 보이고, 누르면 서버가 `ALREADY_PAIRED`로 안내한다. 후속 과제로 남긴다.
- **예전 방 초대**: Strip의 "초대" 버튼을 예전 방에도 보이게 하고, `useGroupRooms.openInvite`가 예전 방이면 `LegacyInviteSheet`(새 파일)를 열고 `room_legacy_invite`만 기록한다(서버 호출 없음). "새 방 만들기"는 `createRoom()`.
- **상태 줄/아바타**: Strip에 `others` prop(나를 뺀 현재 기기 목록)을 추가했다. 0대면 `group.alone`, 아니면 `기기 {n}대`(나 포함) 뒤에 이름 최대 2개를 ` · `로 붙인다. 아바타는 다른 기기 최대 3개를 겹쳐 그린다(없으면 기존 아이콘).
- **`reinviteDevice`(다시 연결)**: 새 방에서는 이미 숨김(RoomScreen이 `isGroupRoom`이면 null). 그대로 두고 예전 방에서만 쓴다. `handlePrivateLeftMessage`도 이미 새 방(`prv-g-`)은 지우지 않아 변경 없음.
- **문구**: ko·en의 `pair`/`text.storagePrivate`/`dropOverlay.toPair`에서 "1:1"을 뺐다. `group.textNote`·`group.expired`·`group.dropTo`는 키와 코드 분기를 그대로 뒀다(삭제·단순화 안 함. 의미가 같아 후속에서 정리 가능).
- **테스트 수정**: 기존 테스트 중 "1:1" 문구/예전 방 초대 버튼 부재를 기대하던 14개를 의미를 지키며 고쳤다(ConnectionCard.pair 2, DeviceList.pair 3, PrivateRoomStrip.group 1, RoomScreen.group 1, ShareScopeTabs.group 1, ShareScopeTabs.private 3, TextShareBox.group 2, TextShareBox.queue 1). 백엔드는 `pair.socket`(방 ID 형식 1)과 `group.socket`(ALREADY_PAIRED 규칙 1)을 고쳤다.
