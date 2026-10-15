# 1:1 연결 (비공개 방) 설계

Status: draft v2 (owner 검토 대기). Created: 2026-10-15.

owner 결정:
- 2026-10-15 1차: 보안 모드(헤더 비밀번호)는 보류. 다른 네트워크끼리도 연결 가능. 점진 개발·확장 가능한 구조.
- 2026-10-15 2차: 확인 수단은 낱말이 아니라 **그림(이모지 이미지)** — 번역 최소화. 다른 네트워크도 **기기 목록에서 "1:1 연결" → 수락 → 그림 확인**으로 같은 흐름. 스팸 걱정보다 **사용성 우선**. 30일 유지(입장권)는 **이번 단계에서 제외**.

## 목표 (이번 단계)
- 기기 목록(같은 네트워크·전체 공유 모두)에서 상대를 골라 **둘만 쓰는 방**을 연다. 기존 두 탭은 그대로.
- 그 방의 파일·텍스트는 **비밀번호 없이 자동 암호화**(키는 두 기기에만, 서버는 암호문만).
- 연결은 **이번 접속 동안** 유지된다(잠깐의 네트워크 끊김 2분 이내는 자동 복구). 새로고침·탭 닫기 후에는 다시 연결한다(세 번 탭).
- 나중 단계에서 30일 유지·그룹 방을 붙일 수 있게 경계를 나눠 둔다.

## 이번 단계에서 하지 않는 것
- 새로고침·재접속 후 자동 재입장(30일 유지). → 확장 단계 E1.
- 코드·QR 연결. 기기 목록으로 충분하면 넣지 않는다. → 필요 시 E3.
- 그룹 방, 오프라인 상대에게 텍스트 보관, 공유 시트에서 1:1 방 고르기. → E2·E4.

## 지금 구조와 맞물리는 지점 (origin/master 4d0b05c 확인)
- 소켓은 접속 시 전체 방(`room-shared`)과 IP 방(`room-<12hex>`)에 자동 입장, `registered`로 두 방 룸 토큰을 받는다(`socketHandlers.ts:177-219`, `buildRoomTokenPayload :34`). 연결 복구(2분) 경로는 `socket.data`의 방으로 다시 join하고 `registered`를 다시 보내지 않는다(`:187-200`).
- 모든 소켓이 전체 방에 있으므로 전체 공유 기기 목록 = 지금 접속한 모든 기기. 다른 네트워크 상대도 여기서 고른다.
- 룸 토큰은 roomId+만료만 HMAC(`roomToken.ts:34`) → 비공개 방에도 그대로 발급 가능.
- REST roomId 검사는 대부분 비어 있지 않은지만, 잠금 라우트는 `/^[A-Za-z0-9-]{1,100}$/`(`locked.ts:14`, `lockedLink.js:15`) → `prv-<hex>` 통과.
- 발행 대상은 `'global' | 'ip'` 고정(`socketHandlers.ts:258-260`, `types/index.ts:64`) → 확장 필요.
- 빈 방은 10분 뒤 R2 파일까지 삭제(`RoomManager.ts:63-100`). 이번 단계의 비공개 방은 접속 동안만 쓰므로 **이 정리를 그대로 따른다**(둘 다 나가면 10분 뒤 삭제).
- 잠금 암호(`lockCrypto.js deriveLock`)는 PBKDF2 master(`:85`) 뒤 HKDF로 encKey·verifier(`:86~`). master만 바꿔 넣으면 업로드·해제·삭제 증명·서버 검증(vh)을 재사용. 서버는 salt를 16B 불투명 값으로만 본다.
- 이름표 아이콘은 Fluent Emoji SVG(MIT, `frontend/src/assets/animals/`, `utils/identity.js:40` glob)로 이미 쓰고 있다 → 확인 그림도 같은 방식.

## 연결 흐름 (같은 네트워크·다른 네트워크 동일)
1. A가 기기 목록(어느 탭이든)에서 B 옆 **"1:1 연결"** → `pair:invite {to: B.socketId}`.
2. B에 요청 시트: A의 이름표·기기·브라우저, 같은 네트워크인지 표시(서버가 알려 줌) → **수락 / 거절**.
3. 수락 → 키 교환(아래) → 두 화면에 **그림 4개** → 두 기기 모두 **"같아요"** → 서버가 방을 만들고 둘을 넣는다 → 두 기기에 "1:1" 탭이 생기고 그 탭으로 이동.
4. 하나라도 "달라요"·거절·60초 무응답·한쪽 이탈이면 취소 안내.

사용성 우선 원칙: 단계는 위 3번(누르기 → 수락 → 같아요) 외에 늘리지 않는다. 비밀번호·코드 입력 없음.

### 남용 대비 (사용성을 해치지 않는 최소한)
- 받는 기기에는 요청 시트를 한 번에 하나만 띄우고, 나머지는 대기열.
- 같은 상대에게 거절당하면 그 상대에게는 30초 동안 다시 요청 불가(보낸 쪽에 "잠시 후 다시" 안내).
- 요청 시트에 "이번 접속 동안 이 기기 요청 받지 않기" 링크(작게).
- 서버: 소켓당 동시 요청 3개, 이벤트 토큰 버킷(기존 `tokenBucket.ts`). 수치는 운영 보며 조정.

### 키 교환 (서버는 공개키만 중계)
- 각 기기: ECDH P-256 1회용 키쌍(Web Crypto). `pair:signal {sessionId, data}`로 공개키 교환.
- Z = ECDH(내 개인키, 상대 공개키). transcript = sessionId ‖ 두 공개키(바이트 순 정렬).
- k_wrap = HKDF(Z, salt=SHA-256(transcript), info=`cs-pair-v1/wrap`), sas = HKDF(같은 입력, info=`cs-pair-v1/sas`) 3바이트 → 6비트씩 4개 → 그림 64장 중 4장(순서 포함, 24bit).
- 요청한 기기(A)가 roomSecret(32B 무작위)을 만들어 AES-GCM(k_wrap)으로 감싸 보낸다. B가 풀어 보관(메모리).
  - roomSecret을 ECDH에서 바로 뽑지 않는 이유: 그룹 방(E2)은 같은 roomSecret을 멤버마다 1:1 채널로 나눠 주면 된다.
- 서버가 공개키를 바꿔치기하면 두 화면 그림이 달라진다 → "달라요".

### 확인 그림
- Fluent Emoji SVG 64장, `frontend/src/assets/sas/`. 이름표 동물과 헷갈리지 않게 **동물 제외**(과일·음식·사물·자연·탈것 등), 비슷한 모양끼리(사과/토마토 등)는 빼고 고른다.
- 표시: 큰 그림 4장 가로 배열, 순서까지 같아야 함. 그림 아래 글자 없음(번역 불필요). 스크린리더용 대체 텍스트는 유니코드 이모지 문자 자체(읽는 언어로 자동 낭독).
- 안내 문구는 짧게 2개만 i18n: "두 화면의 그림이 같은지 확인하세요", 버튼 "같아요 / 달라요".

### 방 비밀에서 파생하는 값
| 값 | 파생 |
|---|---|
| master | HKDF(roomSecret, salt=UTF8(roomId), info=`cs-room-v1/master`) 32B |
| encKey, verifier, vh | 기존 잠금 규격과 동일(master → HKDF `cs-lock-v1/enc`, `cs-lock-v1/verify`) |
| salt (잠금 메타 16B) | HKDF(roomSecret, info=`cs-room-v1/salt`) 16B — 기기 keyring 열쇠 id |
| 텍스트 | encKey, 메시지마다 iv 12B, AAD=`cs-room-v1/text` ‖ roomId |

## 서버 (backend)
### 새 모듈
- `utils/privateRoom.ts`: `newPrivateRoomId()` → `prv-<24hex>`, `isPrivateRoomId()`.
- `managers/PairSessionManager.ts`: 연결 세션(메모리, 요청 60초·확인 2분 만료). 상태 invited → accepted → confirmed. 거절 쿨다운·동시 요청 상한.

### 소켓 이벤트
| 이벤트 | 방향 | 내용 |
|---|---|---|
| `pair:invite {to}` (ack) | C→S | 대상이 지금 접속 중이면 세션 생성, 대상에게 `pair:incoming {sessionId, from: DeviceInfo, sameNetwork}` |
| `pair:respond {sessionId, accept}` | C→S | 거절이면 요청자에게 `pair:ended {reason:'declined'}` |
| `pair:signal {sessionId, data}` | C↔S | 세션 두 소켓 사이 중계만(4KB 상한) |
| `pair:confirm {sessionId, same}` | C→S | 둘 다 same=true면 방 생성 → 두 소켓 join → `pair:done {roomId, peer, roomToken}` |
| `pair:cancel {sessionId}` / `pair:ended {reason}` | 양방향 | 취소·만료·이탈 |
| `private:leave {roomId}` | C→S | 연결 끊기 |

- 방 멤버십은 서버 메모리: `socket.data.privateRooms`(Set). 발행은 그 방에 들어간 소켓만(`PublishTarget`에 `prv-` 허용).
- 룸 토큰: `pair:done`에서 발급, `room-tokens` 재발급에 비공개 방 포함.
- 연결 끊김: 비공개 방도 `removeUserFromRoom` + `room-users`(상대에게 "나갔어요").
- 연결 복구(2분): `socket.data.privateRooms`로 다시 join.

### REST
- 비공개 방은 **잠금 업로드만**: 일반 업로드 경로(presigned-url(s), upload, multipart)에 `prv-` roomId → 400 `PRIVATE_ROOM_LOCKED_ONLY`(일반 버킷은 공개 URL이라).
- 목록·잠금 meta/unlock/delete는 그대로.

## 프론트
### 상태
- `composables/usePrivateRooms.js`: 비공개 방 목록(메모리), 상대 정보, 파생 키를 `useLockState.rememberKey(salt, encKey, verifier)`에 등록 → 기존 잠긴 파일 카드가 시트 없이 바로 받기.
- 저장 계층은 인터페이스로 분리(`privateRoomStore`: 이번 단계 구현은 메모리). E1에서 IndexedDB 구현으로 바꿔 끼운다.
- `services/pairing.js`: 세션 상태 기계(idle → inviting/incoming → keyed → confirming → done/ended), 키 교환, 그림 계산. 소켓 이벤트와 분리해 단위 테스트.

### 범위(scope) 일반화
- `'ip' | 'global'` → 문자열 id: `'ip'`, `'global'`, `'prv:<roomId>'`. `useShareScope`(VALID 동적, 비공개는 localStorage에 저장 안 함), `useRoomManager.roomIdForScope`.
- `ShareScopeTabs`: 연결이 있을 때만 세 번째 탭 "1:1"(상대 이름표 아이콘). 2개 이상이면 탭 안에서 상대 선택. 연결이 없으면 지금과 동일.
- 색: 비공개 방 전용 색 1개(`useScopeAccent`).

### 화면
- 기기 목록 다른 기기 행: "1:1 연결" 버튼(이미 연결된 상대는 "연결됨", 누르면 그 탭으로).
- 요청 시트(받는 쪽), 그림 확인 시트(양쪽), 대기 표시(보낸 쪽 "상대가 수락하길 기다리는 중 · 취소").
- 1:1 탭: 업로드 칸 문구 "이 방에 올리는 파일은 자동으로 암호화돼요", 잠금 칩 숨김. 파일은 잠긴 카드 형식, 이름 자동 복원(방 키로 unlock → 이름 복호화, 메모리 캐시). 텍스트 자동 암호화·복호화.
- 상대 상태: 그 방 `room-users`로 "접속 중 / 나갔어요". 상대가 나가면 안내 + "다시 연결"(상대가 목록에 있을 때).
- 연결 끊기: 1:1 탭 메뉴 → `private:leave`.

### 메시지
- 텍스트: `{type:'text-shared', textId, enc:{v:1, iv, ct}, timestamp, roomId}`. 평문 `content` 없음. 복호화 실패면 "읽을 수 없는 텍스트".
- 받는 쪽은 `message.roomId`가 내가 들어간 방인지 확인(지금은 안 함 → 같이 보강).

## 보안 정리
| 누가 | 볼 수 있는 것 | 못 보는 것 |
|---|---|---|
| 같은 네트워크·전체 공유의 다른 사람 | 기기 목록에 보이는 것(지금과 같음) | 1:1 방 존재·내용 |
| 서버 운영자 | 방 id, 암호문, 크기·시간, 보낸 기기 이름표, 연결 때 공개키 | 파일 이름·내용, 텍스트, 방 비밀 |
| 원치 않는 요청을 보내는 사람 | 요청 시트를 띄울 수 있음 | 수락 없이는 아무것도 |
한계: 웹 암호화 공통 한계(서버가 내려주는 코드를 믿어야 함). 연결은 이번 접속 동안만.

## 단계
| 단계 | 내용 | 배포 |
|---|---|---|
| M1 서버 | privateRoom id, 연결 세션·중계·확정, 비공개 방 발행·룸 토큰·복구, 일반 업로드 차단, 테스트 | 백엔드만. 화면 변화 없음 |
| M2 프론트 | 키 교환·그림 확인, 기기 목록 "1:1 연결", 1:1 탭, 파일·텍스트 자동 암호화, 그림 64장, i18n ko/en | 프론트 PR |
| M3 다듬기 | 상대 상태·다시 연결·연결 끊기·요청 받지 않기, GA 이벤트(pair_invite/pair_done/private_upload) | 프론트 |
| E1 | 30일 유지(저장 계층 IndexedDB + 재입장 증명) | 서버+프론트 |
| E2 | 그룹 방(같은 roomSecret을 멤버별 1:1 채널로 배포) | |
| E3·E4 | 코드·QR 연결, 오프라인 텍스트 보관, 공유 시트에서 1:1 방 | |

## 테스트
- 백엔드(Jest 소켓 패턴): 초대·수락·확정 후 두 소켓만 방에 있음, 확정 전 발행 불가, 한쪽 "달라요"면 방 미생성, 거절 쿨다운, 중계는 세션 두 소켓 사이만, 비공개 방 룸 토큰으로 목록 200/없으면 401, 일반 업로드 400, 연결 복구 후 비공개 방 유지, 다른 IP끼리도 연결.
- 프론트(Vitest): 양쪽 같은 그림·같은 roomSecret, 공개키 바꿔치기 시 그림 불일치, 방 비밀 → 기존 잠금 규격 암호화 → 다른 인스턴스 복호화 왕복, 텍스트 메시지에 평문 없음, 연결 없을 때 기존 두 탭 회귀 없음.
- E2E(로컬, 실제 R2): 두 탭(서로 다른 IP 흉내 포함) 연결 → 파일·텍스트 → 상대 나감 표시.

## 열린 질문
- 그림 64장 목록 선정(초안을 PR에 이미지로 첨부해 확인받기).

## 프로토콜 계약 (M1·M2 공통, 구현은 이 표를 그대로 따른다)
공통: 모든 pair 이벤트 payload는 객체. 서버 ack는 `{ok:true, ...}` | `{ok:false, code}`. sessionId는 서버가 만든 16B hex.

| 이벤트 | 보내는 쪽 | payload | 응답/결과 |
|---|---|---|---|
| `pair:invite` | 요청자 | `{to: socketId}` | ack `{ok:true, sessionId, expiresAt}` / `{ok:false, code: 'TARGET_NOT_FOUND'|'SELF'|'COOLDOWN'|'TOO_MANY'|'BLOCKED'|'ALREADY_PAIRED'}`. 대상에게 `pair:incoming {sessionId, from: DeviceInfo, sameNetwork: boolean, expiresAt}` |
| `pair:respond` | 대상 | `{sessionId, accept: boolean, block?: boolean}` | ack. accept=false면 요청자에게 `pair:ended {sessionId, reason:'declined'}`(block=true면 그 요청자 소켓의 이후 초대는 `BLOCKED`). accept=true면 두 소켓에 `pair:accepted {sessionId, role: 'initiator'|'responder', peer: DeviceInfo}` |
| `pair:signal` | 둘 다 | `{sessionId, data: object}` (JSON 직렬화 4KB 이하) | 상대에게 `pair:signal {sessionId, data}`. 세션 멤버가 아니면 무시 |
| `pair:confirm` | 둘 다 | `{sessionId, same: boolean}` | 하나라도 same=false → 둘에게 `pair:ended {sessionId, reason:'mismatch'}`. 둘 다 true → 방 생성, 두 소켓 join → 각자에게 `pair:done {sessionId, roomId, peer: DeviceInfo, roomToken, roomTokenTtlSec}` + 그 방에 `room-users {roomId, devices}` |
| `pair:cancel` | 둘 다 | `{sessionId}` | 상대에게 `pair:ended {sessionId, reason:'cancelled'}` |
| (서버) | — | — | 만료(요청 60초 미응답, 수락 후 확인 2분) `pair:ended {reason:'expired'}`, 한쪽 연결 끊김 `pair:ended {reason:'peer-left'}` |
| `private:leave` | 멤버 | `{roomId}` | ack. 방에서 제거, 남은 멤버에게 `room-users` + `message {type:'private-left', roomId}` |
| `publish` | 멤버 | `(message, target)` target = `'ip'|'global'|<prv- roomId>` | prv-는 `socket.data.privateRooms`에 있을 때만 |
| `room-tokens` | — | — | 응답 `roomTokens`에 내가 든 비공개 방 포함 |

키 교환 `data` 형식(서버는 내용을 보지 않음):
- `{t:'pk', v:1, pk: base64url(raw P-256 공개키 65B)}` — 수락 직후 양쪽이 보냄.
- `{t:'secret', v:1, iv, ct}` — initiator가 상대 pk를 받은 뒤 roomSecret을 k_wrap으로 감싸 보냄(AAD=`cs-pair-v1/secret`).
- 그림 계산은 양쪽 pk를 다 받은 뒤 각자 로컬에서.

남용 제한 기본값: 소켓당 진행 중 요청 3, 같은 대상 거절 후 30초 쿨다운, pair 이벤트 토큰 버킷(용량 20, 초당 5), 받는 쪽 동시 표시 1(나머지는 서버가 그대로 보내고 클라이언트가 대기열).

## UI 배치 (owner 승인 2026-10-15: 추천안 전부)
- 시작점: 기기 목록 행 오른쪽 끝 "1:1"(넓은 패널) / "1:1 연결"(폰 시트, 44px). 내 행 제외. 연결된 상대는 채워진 "1:1 중" → 그 탭으로 이동. 같은 네트워크·전체 공유 목록 모두.
- 폰 첫 안내: 다른 기기가 처음 1대 이상일 때 연결 카드 아래 한 줄 "기기를 눌러 둘만 쓰는 1:1 방을 열 수 있어요" + 닫기. 닫으면 localStorage `pair-hint-dismissed`.
- 보내는 쪽: 해당 행이 "수락 기다리는 중 · N초 · 취소"로 바뀜(작업 막지 않음).
- 받는 쪽 요청 시트: 상대 아바타·이름·기기·브라우저, 같은/다른 네트워크 배지, 거절(첫 포커스)/수락(주 버튼), "이번 접속 동안 이 기기 요청 받지 않기". 탭이 숨겨져 있으면 문서 제목 앞 "(1) ".
- 그림 확인 시트(양쪽): 두 아바타 ⇄, "두 화면의 그림이 같은지 확인하세요", 그림 4장 큰 정사각 타일(글자 없음, alt=이모지 문자), 달라요/같아요. 먼저 누르면 "상대 확인 기다리는 중".
- 완료: 1:1 탭으로 자동 이동 + 탭 1회 강조(prefers-reduced-motion이면 생략) + 토스트 "○○와 연결됐어요".
- 범위 탭: 연결 1개면 "[상대 아바타] 1:1", 2개 이상이면 "1:1 (n)" → 상대 선택 팝오버. 연결 없으면 기존 2탭 그대로.
- 1:1 탭: 탭 아래(전체 공유 경고 자리) 안내 띠 = 상대 아바타·이름 "와 1:1", 상태 점(접속 중/나갔어요), "여기 올리는 파일·텍스트는 둘만 보고 자동으로 암호화돼요", "⋯" 메뉴(연결 끊기 → 확인). 업로드 칸 보조 문구 "끌어다 놓아도 자동으로 암호화돼요", 잠금 칩 숨김.
- 상대가 나감: 상태 회색 "나갔어요", 업로드 칸 대신 "다시 연결"(상대가 목록에 있을 때) 또는 "상대가 나갔어요" 안내.
- 색: 1:1 전용 파랑 계열 토큰 `scope-private` (tailwind 설정에 추가), 탭·주 버튼·테두리·띠 통일.
- 접근성: 44px, 시트 포커스 가둠 + Esc=거절/취소, 요청 도착 aria-live, 색+아이콘+문구.
- GA 이벤트: pair_invite, pair_incoming, pair_accept, pair_decline, pair_confirm(same), pair_done, pair_mismatch, private_upload, private_text, pair_leave.
