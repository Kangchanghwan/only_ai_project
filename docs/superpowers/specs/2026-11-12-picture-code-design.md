# E. 그림 코드로 방에 들어가기 (마인크래프트 교육판식 그림 4개)

owner 결정(2026-11-12): QR·링크만으로는 PC→PC, 폰→PC 입장이 어렵다. 방에 있는 기기 화면에 그림 4개를 띄우고, 새 기기가 그림을 순서대로 눌러 들어오게 한다. 기본값(owner 승인): **24개 그림 중 4개, 순서 있음, 중복 허용, 코드 5분, 틀린 횟수 제한, 방 쪽 승인 1회, 인원 상한 10대 유지.**

- WORKTREE: `/tmp/cs-pcode`, BRANCH: `pr/20261112-picture-code`
- 공통 규칙: `COMMON.md`. 설계서 `docs/superpowers/specs/2026-11-12-picture-code-design.md`
- **두 단계로 한다.**
  - **1단계(지금)**: origin/master에서 시작. 서버 전체 + 프론트의 독립 모듈·컴포넌트(아래 "1단계 범위")만. App.vue·ShareScopeTabs·GroupInviteSheet·PrivateRoomStrip·ConnectionCard 등 기존 화면에 연결하지 않는다(다른 에이전트가 같은 시간에 그 파일들을 고친다: 1:1과 그룹 방 합치기, 브랜치 `pr/20261112-unify-rooms`). 1단계 끝에 커밋·push하고 보고.
  - **2단계(메인이 나중에 지시)**: 합치기 브랜치 위로 rebase한 뒤 화면 연결.
- 참고: 그룹 방 설계 `docs/superpowers/specs/2026-11-12-group-rooms-design.md`, 1:1 설계 `2026-10-15-private-pair-rooms-design.md`, 1:1 암호 `frontend/src/utils/pairCrypto.js`, 1:1 서버 `backend/src/handlers/socketHandlers.ts`(`pairAllowed` 토큰 버킷, `private:invite`, `enterPrivateRoom`), 그림 자산 `frontend/src/assets/sas/*.svg`(Microsoft Fluent Emoji, MIT, 64개, manifest.json).

## 흐름
1. **방 쪽(호스트, 방에 있는 아무 기기)**: 초대 시트의 "그림" 탭 → 클라이언트가 그림 인덱스 4개(0~23)를 `crypto.getRandomValues`로 뽑는다 → `code:open {roomId, route:[c1,c2]}` → 서버가 등록. 화면에 그림 4개 + 이름(예: "바나나 · 로켓 · 우산 · 열쇠") + 남은 시간. 5분이 지나면 자동으로 새 코드로 바뀐다. 시트를 닫거나 소켓이 끊기면 `code:close`/자동 해제.
2. **들어오는 쪽(새 기기)**: "그림으로 들어가기" → 그림판(24개)에서 4개를 순서대로 누름(칸 4개, 지우기, 확인) → `code:join {route:[c1,c2]}`.
3. 서버가 route로 호스트를 찾으면 코드 세션(sessionId)을 만들고 두 기기 사이에서 SPAKE2 메시지를 중계한다(`code:signal`). **그림 4개 전부**가 SPAKE2 비밀번호다. 서버는 route(앞 2개)만 알고 뒤 2개는 모른다.
4. SPAKE2 키 확인(confirmation MAC)이 성공하면 **그때만** 호스트 화면에 승인 요청: "{기기 이름}({기기 종류})가 들어오려고 해요 [들이기] [거절]". 확인이 실패하면 호스트에게는 아무것도 띄우지 않고, 호스트 클라이언트가 `code:fail {sessionId}`를 보내 서버가 들어오는 쪽의 실패로 센다.
5. 호스트가 들이기 → 호스트가 `private:invite`로 10분 초대 입장권을 받아, SPAKE2 키로 `{secret(32B), ticket, name}`을 AES-GCM으로 암호화해 `code:signal`로 보낸다 → 들어오는 쪽이 복호화 → `private:join([ticket])` → `addRoom({roomId, roomSecret, ticket, name})` → 스코프 전환 → `group.joined` 토스트. 들어오는 쪽은 코드를 직접 입력했으므로 확인 시트(GroupJoinSheet)를 다시 띄우지 않는다.
6. 거절 → 들어오는 쪽에 "방에서 거절했어요". 호스트 응답 대기는 60초, 넘으면 "응답이 없어요".
7. 같은 코드로 여러 기기가 들어올 수 있다(교실). 각 기기마다 승인 1회. 승인 요청은 큐로 하나씩.

## 서버 (1단계)
- 새 파일 `backend/src/services/codeRegistry.ts`(메모리), `backend/src/handlers/codeHandlers.ts`, 등록은 socketHandlers의 기존 핸들러 등록 지점에 한 줄.
- 이벤트(모두 `pairAllowed` 뒤, 등록된 소켓만, ack `{ok:true,...}` / `{ok:false, error}`):
  - `code:open {roomId, route}`: route = 0~23 정수 2개. 호출자가 그 방의 멤버이고 방이 `isGroupRoomId`일 때만. 이미 활성인 route면 `ROUTE_TAKEN`(클라이언트가 새로 뽑음). 소켓당 활성 코드 1개(새로 열면 이전 것 닫힘). 만료 5분(env `CODE_TTL_SEC`, 기본 300). 응답 `{ok, expiresAt}`.
  - `code:close {}`: 호출자 코드 해제.
  - `code:join {route}`: 실패 제한 먼저 확인. 활성 route 없으면 실패 1회 + `NOT_FOUND`. 있으면 세션 생성(만료 90초), 호스트에게 `code:incoming {sessionId}`(이 시점엔 기기 정보 안 보냄), 응답 `{ok, sessionId}`. 같은 소켓이 동시에 세션 1개만.
  - `code:signal {sessionId, data}`: 세션의 두 멤버 사이 중계만. 크기 상한(기존 `PAIR_SIGNAL_MAX_BYTES` 수준). 서버는 내용을 해석하지 않는다.
  - `code:confirmed {sessionId}`(호스트 → 서버): SPAKE2 확인 성공 알림 → 서버가 호스트에게 `code:request {sessionId, from: 들어오는 기기 DeviceInfo}`를 보낸다. (기기 정보는 확인 성공 뒤에만 넘긴다.)
  - `code:fail {sessionId}`(호스트): 세션 종료 + 들어오는 쪽 실패 1회 + 들어오는 쪽에 `code:end {sessionId, reason:'wrong'}`.
  - `code:decide {sessionId, accept}`(호스트): 거절이면 `code:end {reason:'declined'}`. 승인이면 세션을 `approved`로(이후 호스트의 signal 1회 전달 후 종료).
  - `code:cancel {sessionId}`(양쪽): 종료 + 상대에 `code:end {reason:'cancelled'}`.
  - 소켓 끊김: 그 소켓의 코드·세션 정리, 상대에 `code:end {reason:'gone'}`.
- **실패 제한**: 소켓 id와 클라이언트 IP(기존 `extractClientIp` 방식, 소켓 handshake에서 쓰는 것과 같게) 각각 기준. 실패 3회부터 응답에 `warn:true`, 5회째부터 3분 동안 `code:join`이 `WAIT {retryAfterSec}`. 10분 지나면 카운터 초기화. 숫자는 env로 조정 가능(`CODE_MAX_FAILS`, `CODE_LOCK_SEC`).
- 동시 활성 코드 상한 500(넘으면 `BUSY`).
- **로그에 route·sessionId·signal 내용을 남기지 않는다**(코드 열림/닫힘 횟수 정도만).
- 테스트 `backend/src/__tests__/code.socket.test.ts`: 정상 흐름(open → join → signal 중계 → confirmed → request에 기기 정보 → decide accept), 비멤버 open 거부, 1:1(`prv-`) 방 open 거부, ROUTE_TAKEN, 만료 뒤 join NOT_FOUND, 실패 3회 warn·5회 WAIT·시간 지나면 풀림, fail 이벤트가 들어오는 쪽 실패로 셈, 세션 멤버 아닌 소켓의 signal 무시, 끊김 정리, 로그에 route 미출력(로거 mock으로 확인).

## 암호 (1단계): SPAKE2, RFC 9382, P-256
- `frontend/src/utils/spake2.js`. 의존성 `@noble/curves`(p256 점 연산) 추가 + `@noble/hashes`가 필요하면 추가. **그림 코드를 쓸 때만 동적 import**로 불러 첫 화면 번들을 키우지 않는다(`vite build` 결과에서 메인 청크 크기 변화 보고).
- RFC 9382 그대로: 그룹 P-256, 해시 SHA-256, KDF HKDF-SHA256, MAC HMAC-SHA256, RFC의 P-256용 M·N 상수. A = 들어오는 쪽, B = 호스트. idA = `"cs-code-joiner"`, idB = `"cs-code-host"`. 비밀번호 w: `w = SHA-256("cs-code-v1" || 4바이트 그림 인덱스 || sessionId UTF-8)`를 정수로 보고 군 위수 n으로 나눈 나머지(RFC의 MHF 자리. 온라인 전용이라 느린 해시 불필요라고 설계서에 근거를 적는다).
- 확인: RFC의 KcA/KcB로 서로의 MAC 검증. 실패하면 예외. 세션 키 Ke → HKDF(info `"cs-code-v1/wrap"`) → AES-GCM 키(비추출). 페이로드 `{v:1, secret: b64u, ticket, name}` 를 JSON → AES-GCM(AAD `"cs-code-v1/payload"`)으로.
- 테스트 `spake2.test.js`: **RFC 9382 부록의 P-256 테스트 벡터**(w, x, y 고정 시 pA, pB, K, TT 해시, Ke, KcA, KcB가 일치)를 그대로 재현. 같은 비밀번호면 양쪽 Ke 같음, 다른 비밀번호면 MAC 실패, 받은 점이 곡선 위가 아니거나 항등원이면 거부. 랜덤 왕복 20회.

## 프론트 모듈·컴포넌트 (1단계, 독립)
- `frontend/src/utils/pictureCode.js`: 그림 24개 목록(아래), `randomCode()`(4개), `routeOf(code)`, `codeBytes(code)`, 검증(`isValidCode`). 그림 자산은 `assets/sas/*.svg`를 그대로 쓴다(새 이미지 파일 추가 금지).
  - 24개(서로 헷갈리지 않고 이름을 말하기 쉬운 것): banana, pizza, rocket, umbrella, key, guitar, sunflower, strawberry, airplane, bicycle, camera, moon, rainbow, trophy, hamburger, sailboat, headphone, grapes, lightbulb, mushroom, watermelon, scissors, balloon, carrot.
- `frontend/src/services/codeJoin.js`: 소켓 어댑터를 주입받는 상태 기계 두 개.
  - `createCodeHost({socket, roomId, getInviteTicket, getRoomSecret, roomName})`: open/renew(5분)/close, incoming → SPAKE2(B) → confirmed/fail → request 큐 → decide → payload 전송. 상태를 Vue ref로 노출(code, expiresAt, pendingRequest).
  - `createCodeJoiner({socket})`: join(code) → SPAKE2(A) → 결과 `{status:'joined', payload}` | `wrong` | `declined` | `timeout` | `wait {retryAfterSec}` | `notFound` | `busy`, `warn` 플래그.
  - 테스트: 가짜 소켓 쌍(서버 역할 최소 구현)으로 왕복, 틀린 코드(뒤 2개만 다름 → wrong, 호스트에 request 안 뜸), 거절, 시간 초과, 재시도 제한 응답 처리.
- 컴포넌트(App에 연결하지 않고 단독 테스트만):
  - `PictureCodeShow.vue`: 그림 4개 큰 타일 + 이름 줄 + 남은 시간 + "새 코드" 버튼 + 승인 요청 카드(기기 아바타·이름·종류, 들이기/거절).
  - `PictureCodeEnter.vue`: 칸 4개(누르면 그 칸부터 다시), 그림판 24개(폰 360px에서 6열, PC 8열, 각 타일 최소 44px), 지우기, 확인(4개 찼을 때만), 상태 문구(기다리는 중/틀렸어요/잠시 뒤에/거절/응답 없음), 틀린 뒤엔 칸 비움.
  - 각 그림 타일 aria-label = 그림 이름.
- i18n 새 블록 `"code"`: 21개 로케일 전부 실제 번역. 삽입 위치: **`group` 블록 바로 뒤**. 키(최소): `tabPicture`("그림"), `tabQr`("QR"), `tabLink`("링크"), `showTitle`("이 그림 4개를 새 기기에서 순서대로 누르세요"), `expiresIn`("{min}분 {sec}초 남음"), `renew`("새 코드"), `enter`("그림으로 들어가기"), `enterTitle`("방에 있는 기기에 보이는 그림 4개를 순서대로 누르세요"), `clear`("지우기"), `confirm`("들어가기"), `waiting`("방 쪽에서 들여보내 주기를 기다리고 있어요"), `wrong`("그림이 맞지 않아요. 다시 눌러 주세요"), `warn`("여러 번 틀렸어요. 계속 틀리면 잠시 기다려야 해요"), `wait`("너무 많이 틀렸어요. {sec}초 뒤에 다시 해 주세요"), `notFound` 는 `wrong`과 같은 문구로(코드 존재 여부를 드러내지 않음), `declined`("방에서 거절했어요"), `timeout`("방에서 응답이 없어요"), `busy`("잠시 뒤에 다시 해 주세요"), `requestTitle`("{name}가 들어오려고 해요"), `requestDevice`("{device}"), `approve`("들이기"), `reject`("거절"), `approved`("{name}가 들어왔어요"), 그림 이름 24개 `pic.<id>`(ko: 바나나, 피자, 로켓, 우산, 열쇠, 기타, 해바라기, 딸기, 비행기, 자전거, 카메라, 달, 무지개, 트로피, 햄버거, 돛단배, 헤드폰, 포도, 전구, 버섯, 수박, 가위, 풍선, 당근).
- 테스트 `frontend/src/i18n/i18n.code.test.js`(새 파일). `i18n.test.js`는 건드리지 않는다.

## 분석
`code_show`, `code_renew`, `code_enter_open`, `code_join {result: joined|wrong|declined|timeout|wait|busy|cancel}`, `code_request {accept: true|false}`. 그림 인덱스·방 ID 금지.

## 2단계(나중 지시): 화면 연결 메모
- 초대 시트(GroupInviteSheet)에 탭 [그림][QR][링크]. 기본 탭: 호스트가 모바일이면 그림, PC면 QR.
- "＋ 방" 버튼 → 작은 선택 시트: "새 방 만들기" / "그림으로 들어가기". 빈 방 안내에도 "그림으로 들어가기" 한 줄.
- 승인 요청은 초대 시트가 열려 있을 때 시트 안에 뜬다(시트를 닫으면 코드도 닫힘).
- 예전 `prv-` 방에서는 그림 탭 대신 D의 예전 방 안내.

## 1단계 보고에 꼭 넣을 것
- RFC 9382 벡터 재현 여부(어느 벡터, 몇 개 값 일치)
- 메인 청크 크기 변화(전/후 KB), SPAKE2 청크 크기
- 서버 실패 제한 수치, 로그 점검 결과

## 구현 메모 (1단계)

- **RFC 9382 부록 B 벡터 4개 전부 재현**: A/B 식별자가 ('server','client'), ('','client'), ('server',''), ('','')인 P256-SHA256-HKDF-HMAC 벡터. w·x·y를 고정했을 때 pA, pB, K, TT, Hash(TT), Ke, Ka, KcA, KcB, A conf, B conf가 모두 일치한다(`spake2.test.js`, 벡터 원문은 `spake2.rfcVectors.js`).
- **w 계산**: `w = SHA-256("cs-code-v1" || 그림 4바이트 || sessionId) mod n`. RFC의 MHF 자리에 느린 해시를 쓰지 않은 근거는 온라인 시도만 가능하기 때문이다(서버가 틀린 횟수를 세어 잠그고, 코드는 5분 안에 만료되고, 세션마다 sessionId가 달라 미리 계산해 둘 수 없다). 오프라인 추측은 SPAKE2가 막는다.
- **해시·HMAC·HKDF·AES-GCM은 WebCrypto**를 쓴다. 의존성은 `@noble/curves`(P-256 점 연산)뿐이다(`@noble/hashes`는 curves의 하위 의존성으로만 들어온다).
- **메시지 순서**: A1(pA) → B1(pB, cB) → A2(cA) → 호스트 확인 → code:confirmed → code:request → code:decide → P(암호화 페이로드). 들어오는 쪽은 cB 확인이 틀려도 cA를 보낸다. 호스트가 틀림을 서버에 알려야(`code:fail`) 틀린 횟수가 세어지기 때문이다.
- **서버 `code:*` 토큰 버킷**은 `pairAllowed`(socketHandlers 내부, 비공개)를 가져다 쓰지 않고 같은 수치(용량 20, 초당 5)로 `codeHandlers.ts`에 따로 둔다. socketHandlers는 import 1줄 + 등록 1줄만 바꾼다(1:1·그룹 합치기 작업과 충돌을 피하기 위함).
- **실패 제한**: 기본 5회째에 3분 잠금(`CODE_MAX_FAILS`, `CODE_LOCK_SEC`), 3회부터 `warn:true`, 10분 지나면 카운터 초기화. 소켓 id와 IP 각각 센다. 5회째 응답에도 `retryAfterSec`가 같이 간다.
- **세션 상한**: 호스트당 동시 세션 20개(넘으면 `BUSY`), 들어오는 소켓당 1개.
- **화면 연결 없음**: `PictureCodeShow.vue`, `PictureCodeEnter.vue`는 어디에도 붙어 있지 않다(2단계).
- **i18n**: `code` 블록은 `group` 블록 바로 뒤. 키는 SPEC의 최소 키에 `slotLabel`, `slotEmpty`, `pickerLabel`, `openFailed`를 더했다. `notFound`는 `wrong` 문구를 그대로 쓴다.
