# 1:1 연결 (비공개 방) 설계

Status: draft (owner 검토 대기). Created: 2026-10-15.
owner 결정(2026-10-15): 보안 모드(헤더 비밀번호)는 보류. 연결은 30일 유지. 다른 네트워크끼리도 연결 가능. 점진 개발·확장 가능한 구조.

## 목표
- 두 기기가 서로를 골라 **둘만 쓰는 방**을 연다. 같은 네트워크·전체 공유 탭은 그대로 둔다.
- 그 방의 파일·텍스트는 **비밀번호 없이 자동으로 암호화**된다(키는 두 기기에만, 서버는 암호문만).
- 한 번 연결하면 **30일 동안 유지**된다. 새로고침·브라우저 재시작·와이파이 변경(LTE 포함)에도 같은 방에 다시 들어간다. 마지막 사용 기준으로 연장된다.
- 같은 네트워크에서는 기기 목록에서 바로 연결, 다른 네트워크와는 6자리 코드나 QR로 연결한다.
- 나중에 3명 이상 방(그룹)으로 넓힐 수 있게 처음부터 "비공개 방" 단위로 만든다(1:1은 그 첫 사례).

## 비목표 (이번 범위 밖)
- 그룹 방 UI, 접속하지 않은 상대에게 텍스트 보관(지금처럼 접속 중인 기기에만 전달), PWA 공유 시트에서 1:1 방 고르기. → 확장 단계(M4).
- 서버 측 연결 해지(무효화) 목록. 1차는 기기 쪽 삭제 + 상대 알림.

## 용어
| 용어 | 뜻 |
|---|---|
| 비공개 방 | id `prv-<24hex>`. 서버가 만들고, 입장권(ticket)을 가진 기기만 들어온다 |
| 입장권 (ticket) | 서버 서명 값 `pv1.<roomId>.<exp>.<HMAC>`. 방 id와 만료만 담고 기기·멤버 목록은 서버에 저장하지 않는다(무상태) |
| 방 비밀 (roomSecret) | 32B 무작위. 연결을 시작한 기기가 만들어 상대에게 암호화해 넘긴다. 파일·텍스트 키는 여기서 파생 |
| 연결 세션 | 연결 과정(초대 → 수락 → 키 교환 → 그림 확인) 동안만 서버 메모리에 있는 임시 상태, 10분 |
| 확인 그림 (SAS) | 키 교환 결과에서 뽑은 낱말 4개. 두 화면이 같아야 확정 |

## 지금 구조와 맞물리는 지점 (origin/master 4d0b05c 기준 확인)
- 소켓은 접속하면 자동으로 전체 방(`room-shared`)과 IP 방(`room-<12hex>`)에 들어가고 `registered`로 두 방의 룸 토큰을 받는다(`socketHandlers.ts:177-219`, `buildRoomTokenPayload :34`). 연결 복구(2분 이내) 경로는 `registered`를 다시 보내지 않는다(`:187-200`).
- 룸 토큰은 roomId+만료만 HMAC한다(`roomToken.ts:34`). → 비공개 방도 같은 토큰을 그대로 쓸 수 있다.
- REST의 roomId 검사는 대부분 "비어 있지 않음"뿐이고, 잠금 라우트는 `/^[A-Za-z0-9-]{1,100}$/`(`locked.ts:14`, `lockedLink.js:15`). `prv-<hex>`는 모두 통과한다.
- 발행 대상은 `'global' | 'ip'` 고정(`socketHandlers.ts:258-260`, `types/index.ts:64`).
- 빈 방은 10분 뒤 R2 파일까지 지운다(`RoomManager.ts:63-100`). 비공개 방은 상대가 나중에 받을 수 있어야 하므로 이 정리에서 빼야 한다.
- 잠금 암호(`lockCrypto.js deriveLock`)는 PBKDF2로 master를 만든 뒤(`:85`) HKDF로 encKey·verifier를 뽑는다(`:86~`). master만 다른 곳에서 넣으면 업로드·해제·삭제 증명·서버 검증(vh = SHA-256(verifier))을 그대로 재사용할 수 있다. 서버는 salt를 16B 불투명 값으로만 본다.
- 잠금 버킷은 비공개 + 1일 수명 주기. 일반 버킷은 공개 URL이고 수명 주기 설정은 저장소에서 확인되지 않는다.
- 기기 고정 id는 없다(socketId는 접속마다 바뀜, 이름표는 다시 뽑기 가능). → 연결은 기기 id가 아니라 입장권+방 비밀로 유지한다.

## 연결 흐름
### A. 같은 네트워크 (기기 목록에서)
1. A가 IP 방 기기 목록에서 B 옆 "1:1 연결" → `pair:invite {to: B.socketId}`. 서버는 A·B가 같은 IP 방일 때만 허용하고 세션을 만든다.
2. B에 `pair:incoming {sessionId, from: A의 기기 정보}` → 수락/거절 시트. 거절·10분 경과·A 이탈이면 세션 종료.
3. 수락하면 키 교환(아래) → 두 화면에 확인 낱말 4개 → 두 기기 모두 "같아요" → 서버가 방을 만들고 입장권을 둘에게 준다.

### B. 다른 네트워크 (코드·QR)
1. A가 "다른 네트워크 기기와 연결" → `pair:code:create` → 6자리 숫자 코드 + QR(`https://www.clipboardapp.org/#/pair/<코드>`), 10분 유효.
2. B가 코드를 입력하거나 QR을 찍음 → `pair:code:join {code}` → 세션에 B가 붙고, A에게 "누가 들어왔는지(기기 정보)" 표시 → A 수락.
3. 이후는 A의 3단계와 같다.
- 전체 공유 목록에서 낯선 기기에게 직접 초대하는 기능은 넣지 않는다(초대 스팸). 다른 네트워크는 코드를 직접 전달한 경우만 연결된다.

### 키 교환 (서버는 공개키만 중계)
- 각 기기: ECDH P-256 키쌍(Web Crypto, 이번 세션용 1회). `pair:signal {sessionId, data}`로 공개키 교환.
- 공유값 Z = ECDH(내 개인키, 상대 공개키). transcript = sessionId ‖ 공개키 두 개(바이트 순 정렬).
- k_wrap = HKDF(Z, salt=SHA-256(transcript), info=`cs-pair-v1/wrap`), sas = HKDF(..., info=`cs-pair-v1/sas`) 앞 3바이트 → 64개 낱말 목록에서 4개(24bit).
- 시작한 기기(A)가 roomSecret(32B)을 만들어 AES-GCM(k_wrap)으로 감싸 보낸다. B는 풀어서 보관.
  - roomSecret을 ECDH에서 바로 뽑지 않고 따로 만들어 넘기는 이유: 나중에 그룹 방은 같은 roomSecret을 멤버마다 1:1 채널로 나눠 주면 된다(확장 지점).
- 두 기기가 `pair:confirm`을 보내면 서버가 `prv-<24hex>`를 만들고 입장권(30일)을 발급해 `pair:done {roomId, ticket}`.
- 서버가 공개키를 바꿔치기하면 두 화면의 낱말이 달라진다 → 사용자가 거절.

### 방 비밀에서 파생하는 값
| 값 | 파생 |
|---|---|
| master | HKDF(roomSecret, salt=UTF8(roomId), info=`cs-room-v1/master`) 32B |
| encKey, verifier, vh | 기존 잠금 규격과 동일(master → HKDF `cs-lock-v1/enc`, `cs-lock-v1/verify`) |
| salt (잠금 메타의 16B) | HKDF(roomSecret, info=`cs-room-v1/salt`) 16B — 기기 keyring의 열쇠 id |
| 텍스트 키 | encKey 재사용, 메시지마다 iv 12B, AAD=`cs-room-v1/text` ‖ roomId |

## 서버 (backend)
### 새 모듈
- `utils/privateRoom.ts`: `newPrivateRoomId()`, `issueTicket(roomId, exp)`, `verifyTicket(ticket)` → `{ok, roomId, exp} | {ok:false, reason}`. 비밀값 `PRIVATE_ROOM_SECRET`(없으면 `ROOM_TOKEN_SECRET`·`ROOM_ID_SECRET` 순서). `isPrivateRoomId`.
- `managers/PairSessionManager.ts`: 연결 세션(메모리, 10분 만료, 동시 세션 상한). 코드 → 세션 매핑, 시작/참여 소켓, 상태(invited → joined → keyed → confirmed).

### 소켓 이벤트
| 이벤트 | 방향 | 내용 |
|---|---|---|
| `private:join {tickets[]}` (ack) | C→S | 유효한 입장권마다 `socket.join`, RoomManager 등록, 새 만료(지금+30일)로 재발급. 응답 `{rooms:[{roomId, ticket, roomToken}], invalid:[...]}` + 그 방에 `room-users`. `registered` 뒤와 재연결 뒤에 클라이언트가 호출 |
| `private:leave {roomId}` | C→S | 그 방에서 나감(연결 끊기 때) |
| `pair:invite {to}` | C→S | 같은 IP 방 상대에게만. 상대에게 `pair:incoming` |
| `pair:respond {sessionId, accept}` | C→S | 수락/거절 |
| `pair:code:create` / `pair:code:join {code}` | C→S | 코드 세션 |
| `pair:signal {sessionId, data}` | C↔S | 세션 두 소켓 사이 중계만(4KB 상한, 토큰 버킷) |
| `pair:confirm {sessionId}` | C→S | 둘 다 오면 `pair:done {roomId, ticket}` |
| `pair:cancel` / `pair:ended {reason}` | 양방향 | 취소·만료·상대 이탈 |

- 발행: `PublishTarget`에 비공개 방 id 허용. 소켓이 실제로 들어가 있는 비공개 방일 때만 중계(`socket.data.privateRooms`).
- 룸 토큰: `buildRoomTokenPayload`와 `room-tokens` 재발급에 비공개 방 포함.
- 연결 끊김: 비공개 방도 `removeUserFromRoom` + `room-users`.
- 연결 복구 경로: `socket.data.privateRooms`로 다시 join.

### REST
- 비공개 방에는 **잠금 업로드만** 허용. 일반 업로드 경로(presigned-url(s), upload, multipart)에 `prv-` roomId가 오면 400 `PRIVATE_ROOM_LOCKED_ONLY`.
- 목록·잠금 meta/unlock/delete는 지금 그대로 동작(roomId 형식 통과 확인함). 룸 토큰은 `private:join`에서 받는다.

### 정리
- 빈 방 10분 정리에서 비공개 방은 **파일을 지우지 않고** 방 객체만 메모리에서 지운다. 파일은 잠금 버킷 1일 수명 주기로 정리.

### 남용 방지
- 초대: 소켓당 진행 중 세션 1개, IP 키당 10분에 10회. 코드 참여 시도: IP 키당 10분에 10회(틀린 코드 포함). 코드 6자리 + 10분 + 시도 제한 + 확인 낱말.
- 입장권 검증 실패는 조용히 `invalid`로만 알림.
- 기존 일일 업로드 한도(IP별 20GB)·방 용량(10GB) 그대로.

## 프론트
### 상태·저장
- `composables/usePrivateRooms.js`: 방 목록(반응형), 로드/저장, 입장, 파생 키를 `useLockState.rememberKey(salt, encKey, verifier)`에 등록해 **기존 잠긴 파일 카드가 시트 없이 바로 받기**로 동작하게 한다.
- 저장: IndexedDB `cs-private-rooms`. 항목 `{roomId, ticket, secretKey(CryptoKey, extractable=false, HKDF용), peer:{name, device}, createdAt, lastUsedAt, expiresAt}`. 비밀은 추출 불가 키로 넣어 스크립트가 원문을 읽을 수 없게 한다. IndexedDB가 막힌 환경(일부 시크릿 모드)은 "이 브라우저에서는 연결을 저장할 수 없어요"로 막는다.
- 30일: `expiresAt = lastUsedAt + 30일`. 들어갈 때마다 갱신, 지난 항목은 시작 시 삭제.
- 한 기기당 비공개 방 최대 10개.

### 범위(scope) 모델 일반화
- 지금 `'ip' | 'global'` → 문자열 id. `'ip'`, `'global'`, `'prv:<roomId>'`. `useShareScope`의 VALID를 동적으로, `useRoomManager.roomIdForScope`가 비공개 방도 반환.
- `ShareScopeTabs`: 연결이 있으면 세 번째 탭 "1:1"(상대 이름표). 2개 이상이면 탭 안에서 상대 고르기. 연결이 없으면 지금과 똑같다(클릭 수 증가 없음).
- 색: 비공개 방 전용 색 하나 추가(`useScopeAccent`). 주황(같은 네트워크)·초록(전체 공유)과 구분.

### 화면
- 기기 목록(같은 네트워크 탭의 다른 기기 행): "1:1 연결" 버튼. 이미 연결된 상대는 "연결됨".
- 기기 목록 하단: "다른 네트워크 기기와 연결" → 코드·QR 시트 / "코드 입력".
- 받는 쪽: 요청 시트(보낸 기기 정보, 수락/거절) → 확인 낱말 시트(두 기기 공통, "같아요 / 달라요").
- 1:1 탭: 업로드 칸 문구 "이 방에 올리는 파일은 자동으로 암호화돼요", 잠금 칩 숨김. 파일 카드는 잠긴 카드 그대로 쓰되 이름은 자동 복원(이 방 키로 unlock 호출 → 이름 복호화, 결과는 메모리 캐시). 텍스트는 자동 암호화·복호화.
- 상대 접속 상태: 그 방 `room-users`로 "접속 중 / 마지막 접속".
- 연결 관리(M3): 연결 목록, 이름 표시, 연결 끊기(내 기기에서 삭제 + 방에 `pair-left` 알림 → 상대 기기도 삭제 안내).

### 메시지
- 텍스트: `{type:'text-shared', textId, enc:{v:1, iv, ct}, timestamp, roomId}`. 평문 `content`는 보내지 않는다. 키가 없거나 복호화 실패면 "읽을 수 없는 텍스트"로 표시.
- 파일 알림: 지금 잠긴 파일 알림 그대로.
- 받는 쪽은 `message.roomId`가 내가 들어간 방인지 확인한다(지금은 확인 안 함).

## 보안 정리
| 누가 | 볼 수 있는 것 | 못 보는 것 |
|---|---|---|
| 같은 네트워크·전체 공유의 다른 사람 | 없음(1:1 방 목록·알림이 가지 않음) | 전부 |
| 서버 운영자 | 방 id, 입장권, 암호문, 크기·시간, 보낸 기기 이름표, 연결 때 공개키 | 파일 이름·내용, 텍스트, 방 비밀 |
| 입장권만 훔친 사람 | 방에 들어와 암호문 목록·크기를 봄, 쓰레기 업로드 가능 | 내용(방 비밀이 없음), 삭제(삭제 키·verifier 필요) |
| 기기 저장소를 가진 사람 | 그 기기가 이미 열 수 있는 것 전부 | — (기기 분실 시 연결 끊기 필요) |
한계: 서버가 내려주는 웹 코드를 믿어야 하는 웹 암호화 공통 한계는 그대로. 무상태 입장권이라 한쪽이 연결을 끊어도 상대 기기의 입장권은 만료 전까지 유효(다만 끊은 쪽 비밀이 사라져 그 방은 더 쓰이지 않음).

## 단계 (점진 배포)
| 단계 | 내용 | 배포 |
|---|---|---|
| M1 서버 기반 | privateRoom 입장권, `private:join/leave`, 비공개 방 발행·룸 토큰·정리 예외·일반 업로드 차단, 연결 세션·중계·남용 제한, 테스트 | 백엔드만 배포. 화면 변화 없음(아무도 호출 안 함) |
| M2 연결 + 1:1 탭 | 키 교환·확인 낱말, IndexedDB 저장, 같은 네트워크 초대 + 코드·QR, scope 일반화, 1:1 탭 파일·텍스트 자동 암호화, i18n ko/en | 프론트 PR(owner 승인) |
| M3 관리 | 연결 목록·끊기·상대 접속 상태·만료 안내, GA 이벤트(pair_start/pair_done/private_upload) | 프론트 |
| M4 확장 | 그룹 방(같은 roomSecret을 멤버별 1:1 채널로 배포), 오프라인 상대용 텍스트 보관(작은 잠금 객체), 공유 시트에서 1:1 방 고르기 | 단계별 |

## 테스트
- 백엔드(Jest, 소켓 패턴 `identity.socket.test.ts`): 입장권 발급·위조·만료, `private:join` 후 토큰으로 목록 조회 200 / 토큰 없으면 401, 다른 IP 방 상대 초대 거부, 코드 틀림 제한, 세션 중계는 세션 두 소켓 사이만, 비공개 방 발행은 들어간 소켓만, 빈 비공개 방 정리 시 파일 미삭제, 일반 업로드 400.
- 프론트(Vitest): 키 교환 양쪽 같은 낱말·같은 roomSecret, 공개키 바꿔치기 시 낱말 불일치, 방 비밀 → 기존 잠금 규격으로 암호화 → 다른 인스턴스 복호화 왕복, IndexedDB 저장/만료/갱신, scope 일반화 회귀(연결 없을 때 기존 두 탭 그대로), 텍스트 암호화 메시지에 평문 없음.
- E2E(로컬, 실제 R2): 두 탭 같은 네트워크 연결 → 파일·텍스트 → 새로고침 후 유지 → 다른 IP(헤더로 흉내) 코드 연결.

## 열린 질문
- 확인 낱말 목록(64개, 한국어·영어) 선정.
- 코드 자릿수 6 vs 8(현재 6 + 시도 제한).
