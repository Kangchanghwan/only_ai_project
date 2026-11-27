# 구현 계획: 기기 영역 QR·초대 입구 정리

기준 코드: `Kangchanghwan/only_ai_project` origin/master `768ff57` (#135, 2026-11-27)
인텐트 번호 제안: `intent/0049-qr-invite-layout.md` (owner 아이디어, Status: accepted)

## 0. 코드로 확인한 사실 (제안 조정 근거)

| 항목 | 코드 위치 | 사실 | 계획에 미치는 영향 |
|---|---|---|---|
| 헤더 QR | `AppHeader.vue` 94-105, 185-192 | `homeUrl`(사이트 주소)만 담는다. 이름표 `qr.backgroundHint` = "스캔해서 같은 공간 열기" | 역할은 사이트 주소, 이름만 오해를 부른다 |
| 같은 네트워크 QR 줄 | `RoomScreen.vue` 339-344, `ipWakeQr`(172행) | 다른 기기가 1대 이상일 때만 `RoomWakeQr network`로 보인다. 0대면 `ConnectionCard` 빈 화면 QR이 대신 보인다 | 0대 화면은 그대로 두고, 1대 이상일 때만 카드로 바꾼다 |
| 방 QR 줄 | `RoomScreen.vue` 345-350, `RoomWakeQr.vue` `show` | 그룹 방은 다른 기기 0대일 때, 1:1 방은 상대가 오프라인이거나 3초 넘게 연결 중일 때 보인다. 펼쳐 둔 사이 상대가 오면 "들어왔어요" 알림 | 이 동작(조건·알림)을 초대 창 쪽으로 옮겨야 한다 |
| 방 안내 띠 "초대" 버튼 | `PrivateRoomStrip.vue` 106-111 | 기기 수와 상관없이 **항상** 보인다 | 방 탭에는 카드 줄 초대 카드를 넣지 않는다. 띠의 버튼 하나로 끝 |
| 초대 버튼 파란색 | `DESIGN.md` 39-41행 Scope color | `scope-private` 파랑은 방 스코프 색으로 정한 규칙이다 | 앞서 말한 "남색으로 바꾸기"는 철회. 색은 그대로 둔다 |
| 초대 창 | `GroupInviteSheet.vue`, `useGroupRooms.js` 87-100 | 탭 `picture / qr / link`, 폰은 그림·PC는 QR이 기본. 1:1(예전 방식) 방은 `LegacyInviteSheet`가 대신 뜬다 | 그룹 방은 "내 휴대폰" 탭 추가, 1:1 방은 Legacy 창에 내 휴대폰 QR 블록 추가 |
| 다른 네트워크 줄 | `ConnectionCard.vue` 262-305 | 구분선 + 지구 아이콘 + 펼침 화살표. 인원 초과 시 "기기 찾기" 링크가 같은 줄에 붙는다 | 회색 한 줄 + "보기" 링크로 바꾸되 "기기 찾기"는 유지 |

## 1. 바뀐 뒤 화면 (상태별 입구는 1개)

| 화면 상태 | 휴대폰 연결/초대 입구 | 펼쳐지는 곳 |
|---|---|---|
| 같은 네트워크, 다른 기기 0대 | 기존 빈 화면 QR (변경 없음) | 그 자리 |
| 같은 네트워크, 다른 기기 1대 이상 | 카드 줄 2번째 "휴대폰 초대" 점선 카드 | 새 `PhoneConnectSheet` (초대 창과 같은 틀) |
| 그룹 방 (기기 수 무관) | 안내 띠 "초대" 버튼 | `GroupInviteSheet` 첫 탭 "내 휴대폰" |
| 1:1 방 | 안내 띠 "초대" 버튼 | `LegacyInviteSheet` 안 "내 휴대폰에서 열기" QR 블록 |
| 모든 화면 헤더 | 사이트 주소 QR ("···" 메뉴 안) | 기존 `QRZoomModal` |

## 2. 작업 단계 (PR 3개로 나눔, 각자 되돌릴 수 있게)

### PR 1. 공용 QR 패널 분리 + 같은 네트워크 탭
1. `components/WakeQrPanel.vue` 신설: `RoomWakeQr.vue`의 펼침 패널(QR 140px + 두 줄)과 `makeQr()`를 옮긴다. props `qrUrl`, `line1`, `line2`.
2. `components/PhoneConnectSheet.vue` 신설: `GroupInviteSheet`와 같은 껍데기(Teleport, 좁으면 하단 시트·넓으면 가운데, Esc 닫기, `trapTab`) 안에 `WakeQrPanel`만 넣는다. 제목 "휴대폰 초대".
3. `DeviceCards.vue`: prop `inviteCard: Boolean` 추가. 참이면 "나" 카드 바로 뒤에 점선 타일(`border-dashed`, 다른 카드와 같은 높이 85px)을 넣고 `emit('invite-phone')`.
   - 넓은 화면 용량 계산(63-69행): 초대 카드가 한 칸을 쓰므로 `capacity`에서 1을 뺀다.
   - 좁은 화면 가로 스크롤: 2번째라 "+N" 뒤로 숨지 않는다.
4. `ConnectionCard.vue`: `scope === 'ip' && devices.length > 0`일 때 `inviteCard` 켜고, 이벤트를 위로 올린다. `RoomScreen.vue`에서 `PhoneConnectSheet` 열고 닫기.
5. `RoomScreen.vue` 339-344행 `RoomWakeQr network` 제거.
6. 다른 네트워크 줄(`ConnectionCard.vue` 262-305): `border-t`, 지구 아이콘, 화살표 제거. 글 "다른 네트워크에도 {n}대가 있어요" + 밑줄 링크 "보기/접기". 인원 초과일 때는 같은 줄에 " · 기기 찾기" 유지. 펼친 목록(`other-network-list`)은 그대로.
7. 측정: `room_qr_open`은 시트를 열 때 `room_kind: 'ip'`, `source: 'card'`로 그대로 보낸다.

### PR 2. 방 탭
1. `GroupInviteSheet.vue`: `TABS = ['mine', 'picture', 'qr', 'link']`. `mine` 탭은 `WakeQrPanel`(방 꼬리표 든 `roomQrUrl`, 문구 `roomQr.line1/line2`). 기존 QR 탭 이름은 "초대 QR"로 바꿔 구분.
2. `useGroupRooms.js` `openInvite`: 기본 탭 결정 규칙 변경. **방에 다른 기기가 0대면 `mine`**, 1대 이상이면 지금처럼 폰=그림·PC=QR. `selectInviteTab`의 허용 목록에 `mine` 추가. 초대 입장권 발급(`invitePrivate`)은 `mine` 탭에서는 미뤄도 되지만, 1차는 지금처럼 열 때 발급(단순하게).
3. `LegacyInviteSheet.vue`: 상대가 오프라인/연결 중일 때 `WakeQrPanel` 블록을 위에 추가 (기존 `RoomWakeQr`의 1:1 조건 `offline || connecting 3초` 재사용).
4. "들어왔어요" 알림: `RoomWakeQr`의 `arrivedName`·watch를 `RoomScreen.vue`로 옮겨, 초대 창이 `mine` 탭으로 열려 있는 동안 기기가 들어오면 창을 닫고 `roomQr.arrived` 알림 1번.
5. `RoomScreen.vue` 345-350행 `RoomWakeQr` 제거 → `RoomWakeQr.vue`와 `RoomWakeQr.test.js` 삭제 (패널 테스트는 `WakeQrPanel.test.js`로 옮김).
6. 초대 버튼 색은 그대로(`bg-scope-private`).

### PR 3. 헤더 QR 정리
1. `AppHeader.vue`: 헤더의 QR 썸네일 버튼을 "···" 메뉴 항목 "사이트 주소 QR"로 옮긴다. 메뉴에서 누르면 기존 `openQrZoom()`.
2. `QRZoomModal` 제목과 `qr.backgroundHint`(ko) → "휴대폰에서 이 사이트 열기". 21개 로케일 모두 갱신.
3. 측정 `qr_open {qr_type:'site'}`에 `source:'menu'` 추가 (전후 비교용).
4. 되돌리기 쉬워야 하므로 PR 1·2와 분리. 메뉴로 숨긴 뒤 사이트 QR 사용 수가 크게 줄어도 문제 되는지는 2주 뒤 `qr_open` 수로 판단.

## 3. 문구 (ko 기준, 21개 로케일 모두 추가 — CLAUDE.md 규칙)

| 키 | ko | 비고 |
|---|---|---|
| `roomQr.inviteCard` | 휴대폰 초대 | 새 카드 제목 |
| `roomQr.inviteCardSub` | 이 네트워크로 | 카드 아랫줄 |
| `roomQr.myPhoneTab` | 내 휴대폰 | 초대 창 첫 탭 |
| `roomQr.legacyMine` | 내 휴대폰에서 이 방 열기 | Legacy 창 블록 제목 |
| `code.tabQr` | 초대 QR | 기존 "QR" 변경 |
| `pair.otherNetworkLine` | 다른 네트워크에도 {n}대가 있어요 | 새 회색 줄 |
| `pair.otherNetworkShow` / `Hide` | 보기 / 접기 | |
| `header.siteQr` | 사이트 주소 QR | 메뉴 항목 |
| `qr.backgroundHint` | 휴대폰에서 이 사이트 열기 | 기존 값 변경 |

`roomQr.toggle`, `roomQr.toggleIp`는 PR 2 머지 뒤 사용처가 0이면 삭제 (`i18n.test.js` 통과 확인).

## 4. 테스트 수정 목록

- 수정: `RoomScreen.test.js`, `ConnectionCard.otherAuto.test.js`, `ConnectionCard.qrLink.test.js`, `ConnectionCard.rosterMore.test.js`, `DeviceList.pair.test.js`, `GroupInviteSheet.tabs.test.js`, `DeviceCards.cap.test.js`, `App.code.test.js`, `App.code.mobile.test.js`, `AppHeader.test.js`, `i18n.test.js`
- 신규: `WakeQrPanel.test.js`, `PhoneConnectSheet.test.js`, `DeviceCards.inviteCard.test.js`
- 삭제: `RoomWakeQr.test.js` (내용은 위 신규로 이전)

## 5. 통과 기준 (숫자로, 머지 전 확인)

| # | 기준 | 확인 방법 |
|---|---|---|
| G1 | `frontend` `npm test` 실패 0건, 백엔드 변경 없음 | Vitest |
| G2 | 화면 상태 5개(1절 표) 각각에서 보이는 "휴대폰 연결/초대" 입구 수 = 1 | Vitest + 1280px·390px 스크린샷 |
| G3 | 같은 네트워크 탭(다른 기기 4대, 다른 네트워크 8대)에서 입력창 윗변이 지금보다 **80px 이상** 위로 | 배포 전후 `getBoundingClientRect().top` 비교 (지금 측정값: QR 줄 높이 44px + 다른 네트워크 줄 + 구분선) |
| G4 | 390px에서 "휴대폰 초대" 카드가 가로 스크롤 없이 보임 | 스크린샷 |
| G5 | 그룹 방, 나만 있을 때 "초대" → 창이 `mine` 탭으로 열리고 QR 값에 방 꼬리표 포함 | `data-qr-value` 확인 |
| G6 | `mine` 탭 열어 둔 채 다른 기기 입장 → 창 닫힘 + 알림 1회 | Vitest (기존 RoomWakeQr 알림 테스트 이전) |
| G7 | 21개 로케일에 새 키 모두 존재 | `i18n.test.js` |
| G8 | `DESIGN.md` 58행 "QR rows" 항목을 새 배치로 고치고 결정 기록 표에 한 줄 추가 | 문서 diff |

## 6. 위험과 대응

- **초대 입장권을 너무 자주 발급**: 나만 있는 방에서 초대 창을 열 때마다 `invitePrivate`가 호출된다. 지금도 같은 동작이라 1차는 유지, `mine` 탭에서만 쓸 때 발급을 미루는 건 후속.
- **"내 휴대폰" QR과 "초대 QR"을 사용자가 헷갈림**: 탭 이름과 각 탭 아래 안내문(내 휴대폰 = "처음 보는 휴대폰이면 연결 요청이 와요", 초대 QR = "10분 동안 쓸 수 있어요")으로 구분. 2주 뒤 `room_qr_open` 대비 초대 성공 수로 확인.
- **헤더 QR을 메뉴로 숨겨 사이트 QR 사용 감소**: PR 3만 되돌리면 된다.

## 7. 배포

PR 1 → PR 2 → PR 3 순서. 각 PR은 G1·G2 통과 후 owner에게 1280px·390px 스크린샷을 보여 주고 "배포해"를 받은 뒤 머지한다.
