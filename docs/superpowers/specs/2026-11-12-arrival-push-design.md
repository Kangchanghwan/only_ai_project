# 도착 알림 (Web Push): 탭이 닫혀 있어도 도착을 알린다 (설계)

작성 2026-11-12. owner 승인("구현해도 좋을 것 같다", 2026-11-12).

## 요약
- 알림을 켠 기기는 탭이 닫혀 있어도 "새 파일 3개가 도착했어요" 알림을 받는다. 누르면 사이트가 열린다.
- 대상 방: **같은 네트워크 방**과 **비공개 방(1:1, 그룹)**. 전체 공유 방은 보내지 않는다.
- 알림 내용에는 파일 이름, 텍스트 내용, 보낸 사람 정보가 없다(개수와 종류만).
- VAPID 키가 서버에 없으면 기능 전체가 꺼진 것으로 동작한다(프론트 UI도 숨김).
- iOS는 홈 화면에 추가한 웹 앱에서만 PushManager가 있다. 지원 여부는 기능 감지로만 판단한다.

## 백엔드
### 의존성·환경변수
- `web-push`(+ `@types/web-push` dev). worktree의 backend에서 `npm ci` 후 `npm install web-push`(node_modules 심볼릭 링크 금지, package.json·package-lock.json 커밋).
- env 이름: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(기본 `https://www.clipboardapp.org`). 값은 코드·로그·테스트 스냅샷에 넣지 않는다. 테스트는 `webpush.generateVAPIDKeys()`로 만든 임시 키 사용.
- `backend/.env.example`류 파일이 있으면 이름만 추가.

### 구독 저장 (`services/pushStore.ts`)
- 메모리 Map + R2 잠금 버킷 영속화. `textQueueStore.ts` 패턴을 따른다. 키 `_push/<pid>.json`.
- 잠금 버킷에는 1일 수명주기가 있으므로 **12시간마다 전체 레코드를 다시 써서** 유지한다(서버가 하루 넘게 꺼지면 사라지고, 클라이언트가 다음 방문에 다시 등록한다 = 자가 복구). 이 이유를 주석으로 남긴다.
- 부팅 시 hydrate. 잠금 버킷이 없으면 메모리만.
- 레코드: `{pid, endpoint, keys:{p256dh, auth}, lang:'ko'|'en', ipRoomId:string|null, ipSeenAt:number, prv:[{roomId, exp(ms)}], createdAt, updatedAt}`
- 규칙:
  - **같은 네트워크 방은 "가장 최근 방 하나"만** 묶는다. subscribe가 올 때마다 요청 IP에서 구한 방으로 교체하고 `ipSeenAt` 갱신. 마지막 방문 후 **7일** 지나면 무효.
  - 비공개 방 묶음은 입장권 만료 시각까지 유효. 구독당 최대 10개.
  - 유효한 묶음이 하나도 없는 구독은 정리(1시간마다) 때 삭제.
  - 전체 구독 상한 5,000(넘으면 정리 후에도 가득이면 503 `PUSH_FULL`). 방당 발송 대상 상한 20.
- R2 삭제 수단이 없으면 `r2Service`에 잠금 버킷 삭제 메서드를 추가(기존 삭제 코드 재사용).

### 라우트 (`routes/push.ts`, server.ts에 등록, JSON 본문, 메서드는 GET/POST만: CORS 허용 목록이 GET·POST·DELETE·OPTIONS)
- `GET /api/push/key` → `{key}`. 꺼져 있으면 404 `{error:'PUSH_DISABLED'}`.
- `POST /api/push/subscribe` `{pid, subscription:{endpoint, keys:{p256dh, auth}}, lang, tickets?:string[]}`
  - pid: 소문자 hex 32자(클라이언트가 만든 무작위 값).
  - **endpoint 검증(SSRF 방지, 필수)**: https, 길이 ≤ 1000, 호스트가 다음 중 하나로 끝나야 함: `fcm.googleapis.com`, `push.services.mozilla.com`, `notify.windows.com`, `push.apple.com`. 그 외는 400 `BAD_ENDPOINT`. 호스트 비교는 `new URL()`로 파싱한 hostname에 대해 `=== 접미사 || endsWith('.' + 접미사)`.
  - keys: base64url 문자열, 길이 상한(p256dh ≤ 200, auth ≤ 100).
  - ipRoomId: `quickSend.ts`와 같은 방식(요청 IP → `extractClientIp` → `deriveIpRoomId`). 클라이언트가 방 ID를 주장하지 못한다.
  - tickets(≤10): `verifyTicket` 통과분만 `{roomId, exp}`로 묶는다. 나머지는 무시.
  - 응답 `{ok:true, ip:true, prv:<묶인 수>}`.
  - 속도 제한: IP당 분당 30회(quickSend의 버킷 패턴).
- `POST /api/push/unsubscribe` `{pid, endpoint}`: pid와 endpoint가 모두 일치할 때만 삭제. 항상 `{ok:true}`.

### 소켓
- `push:bind {pid}`: `socket.data.pushId = pid`(형식 검증). 접속 중인 기기를 발송 대상에서 빼는 데 쓴다.

### 발송 (`services/pushNotifier.ts`)
- `notifyArrival({roomId, scope:'ip'|'prv', kind:'file'|'text', senderSocketId?})`
- scope가 전체 공유면 호출하지 않는다.
- 대상 = 그 방에 유효하게 묶인 구독 − (지금 그 방에 소켓이 붙어 있는 기기의 pid) − 보낸 기기의 pid.
- 묶어 보내기: pid별로 4초 디바운스(최대 10초 대기), 같은 pid에는 20초에 1번까지. 그 사이 도착분은 개수로 합친다.
- 페이로드(JSON): `{v:1, title:'Clipboard Share', body, tag:'cs-arrival', target:'ip'|<roomId>}`
  - body(ko/en만, 그 외 언어는 en): "새 파일 {n}개가 도착했어요" / "새 텍스트가 도착했어요" / "새 파일 {n}개와 텍스트가 도착했어요" · "{n} new file(s) arrived" / "New text arrived" / "{n} new file(s) and text arrived"
  - 파일 이름·텍스트·보낸 기기 이름·IP는 넣지 않는다.
- `webpush.sendNotification` 옵션: TTL 3600, urgency normal. 404/410이면 구독 삭제. 그 외 오류는 pid 앞 6자만 로그(엔드포인트 전체를 로그에 남기지 않는다).
- 연결: `socketHandlers.ts` `handlePublish`에서 방으로 emit한 직후(파일 추가 `file-uploaded` action `added`, 텍스트 `text-shared`), `routes/quickSend.ts`의 두 emit 직후(보낸 소켓 없음).
- 꺼져 있으면(no VAPID) 전부 no-op.

### 백엔드 테스트
- store: 묶음 교체(가장 최근 IP 방만), 7일 만료, 입장권 만료, 상한, 영속화(스토어 mock), 12시간 재기록
- routes: 꺼진 상태 404, pid·endpoint·keys 검증, **허용 목록 밖 호스트 400**(예: `https://evil.example/x`, `https://fcm.googleapis.com.evil.example/x`, `http://fcm.googleapis.com/x`), 입장권 묶음, unsubscribe 일치 조건, 속도 제한
- notifier(web-push mock, 가짜 타이머): 접속 중 기기·보낸 기기 제외, 전체 공유 미발송, 디바운스 합산, 20초 간격, 410 삭제, 페이로드에 이름·내용 없음
- socket: publish가 notifier를 부름(ip, prv), global은 안 부름

## 프론트
### 서비스워커 (`frontend/public/sw.js`)
- `push`: JSON 파싱(실패 시 일반 문구) → **항상** `showNotification(title, {body, tag, renotify:true, icon:'/icon-192.png', data:{target}})`.
- `notificationclick`: 알림 닫기 → 열린 창이 있으면 focus + `postMessage({type:'PUSH_OPEN', target})` / 없으면 target을 SW 전역(`pendingPushTarget`, 기존 `pendingShareData` 패턴)에 넣고 `clients.openWindow('/?utm_source=push&utm_medium=notification')`.
- `message`: `GET_PUSH_TARGET` → 값 돌려주고 비움.
- 방 ID를 URL에 넣지 않는다(GA로 가지 않게).

### 클라이언트 (`composables/usePush.js`)
- `isSupported()`: `serviceWorker`, `PushManager`, `Notification` 기능 감지 + `/api/push/key` 200.
- pid: localStorage `cs_push_id`(없으면 무작위 16바이트 hex). 상태: `cs_push` = `on`|`off`.
- `enable()`(사용자 동작 안에서): 권한 요청 → `navigator.serviceWorker.ready` → `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})` → `POST subscribe`(가진 비공개 방 입장권 포함, lang) → `cs_push=on` → 소켓 `push:bind`.
- `sync()`: `cs_push==='on'`이고 권한 granted일 때, 앱 시작·소켓 등록/재연결·비공개 방 목록 변경(디바운스) 때마다 구독을 확인(없으면 다시 subscribe)하고 `POST subscribe` + `push:bind`. 실패는 조용히 무시.
- `disable()`: `subscription.unsubscribe()` + `POST unsubscribe` + `cs_push=off`.
- API 주소는 기존 REST 호출이 쓰는 방식 그대로.

### 기존 도착 표시와 연결 (`useArrivalBadge.js`, `ArrivalNotifyPrompt.vue`)
- `enableNotifications()`가 권한을 얻으면 push 지원 시 `push.enable()`도 한다.
- 안내 프롬프트는 지금 데스크톱만 대상이다. push가 지원되는 모바일(안드로이드 크롬, 홈 화면에 추가한 iOS)에서도 뜨게 한다.
- 탭이 열려 있고 자리를 비운 동안의 알림: 모바일에서는 `new Notification` 대신 `registration.showNotification`을 쓴다(안드로이드에서 `new Notification`은 예외). 데스크톱 동작은 유지.

### 열기 처리 (`App.vue`)
- 마운트 시 SW에 `GET_PUSH_TARGET`을 묻고, `PUSH_OPEN` 메시지도 받는다. target이 `ip`면 같은 네트워크 탭으로, 비공개 방 ID이고 그 방을 가지고 있으면 그 방으로 스코프 전환. `trackEvent('push_open', {target_kind:'ip'|'prv'})`.
- App.vue 수정은 이것과 `push.sync()` 호출들로 한정한다.

### 켜고 끄기 (`AppFooter.vue`)
- push 지원 시 한 줄: 꺼짐 → "도착 알림 켜기"(`data-testid="push-enable"`), 켜짐 → "도착 알림 켜짐 · 끄기"(`data-testid="push-disable"`). 권한이 denied면 표시하지 않는다.

### 분석
`push_subscribe {result: ok|denied|error}`, `push_unsubscribe`, `push_open {target_kind}`.

### i18n 삽입 위치
기존 `"arrival"` 블록의 **맨 끝**에 키 추가: `pushEnable`, `pushOn`, `pushOff`, `pushEnabled`(토스트 "도착 알림을 켰어요"), `pushDisabled`(토스트 "도착 알림을 껐어요"), `pushError`. 다른 블록은 건드리지 않는다.

### 프론트 테스트
- `usePush`: 미지원/키 404, enable 성공·권한 거부, sync 재구독, disable (SW·pushManager·fetch mock)
- `useArrivalBadge`: 권한 후 push.enable 호출, 모바일 away에서 `registration.showNotification`
- sw.js push/notificationclick/GET_PUSH_TARGET(기존 `self.__lockedTest` 방식처럼 테스트 가능하게 노출해도 됨)
- `AppFooter`: 상태별 표시
- App: target 처리

## 알려진 한계
- 같은 네트워크 방 알림은 그 네트워크에서 마지막으로 연 뒤 7일까지. 공용 와이파이에서 켠 노트북은 집에서 사이트를 다시 열기 전까지 그 와이파이 방의 도착 알림을 받을 수 있다(내용 없음, 20초에 1번 이하).
- 소켓이 붙어 있지만 화면이 멈춘 모바일 탭은 소켓이 끊길 때까지 push를 받지 못할 수 있다.
- 서버 인스턴스 1개 가정(지금 구조와 같음).
- 운영 반영에는 서버에 VAPID 키 설정이 필요하다(배포 단계에서 메인이 처리).

## 구현 메모
- `web-push`는 `^3.6.7`로 고정했다. 4.0.0은 ESM 전용이라 CommonJS인 백엔드(ts-jest 포함)에서 불러오지 못하고, `@types/web-push`(3.6.x)도 3.x용이다.
- 구독 저장소는 `services/pushStore.ts`에 R2 저장 구현(`r2PushPersistence`)까지 함께 두었다. 잠금 버킷 삭제 수단(`deleteLockedKeys`)이 이미 있어 `r2Service`는 바꾸지 않았다.
- `routes/push.ts`는 VAPID가 없으면 `GET /api/push/key`뿐 아니라 subscribe/unsubscribe도 404 `PUSH_DISABLED`로 답한다(메모리에 아무것도 쌓지 않는다).
- subscribe는 입장권 묶음을 요청에 담긴 목록으로 교체한다(방을 나가면 다음 sync에서 빠진다). 같은 endpoint가 다른 pid로 다시 오면 옛 레코드를 지운다.
- 변경이 없는 재등록은 1시간 안에는 R2에 다시 쓰지 않는다(앱을 열 때마다 subscribe가 오므로). 12시간 전체 재기록은 그대로다.
- 서버 알림은 `file-uploaded`(공개 방, 잠긴 파일 포함)와 `text-shared`에서만 부른다. 클라이언트가 파일마다 publish하므로 디바운스가 개수로 합친다. `file-deleted` 등은 부르지 않는다.
- 같은 pid에 다른 방의 도착이 섞이면 알림은 하나로 합치고 target은 가장 최근 방으로 한다.
- 접속 중 기기 제외는 발송 시점과 실제 전송 직전(대기 중 앱을 연 기기) 두 번 확인한다.
- 서비스워커는 페이로드의 target을 `ip` 또는 `prv-<hex24>` 형식만 받아들이고, 길이가 200을 넘는 문구는 일반 문구로 바꾼다.
- 모바일 도착 표시(`useArrivalBadge`)는 `navigator.serviceWorker`가 있고 알림 권한이 granted일 때 `registration.showNotification`을 쓴다. 안내 프롬프트는 모바일에서 `usePush`가 지원 확정(`supported`)일 때만 뜬다.
- `enable()`은 Safari가 사용자 동작으로 인정하도록 권한 요청을 첫 await으로 둔다.
- `CLAUDE.md` 환경 변수 목록에 VAPID 이름 3개를 추가했다(`.env.example`류 파일은 저장소에 없다).
