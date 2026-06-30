# IP 격리 + 전체 공유 이중 룸(Dual-Room) 공유 설계

작성일: 2026-06-30

## 배경 / 문제

현재 모든 클라이언트가 단일 공유 룸(`room-shared`)에 자동 입장한다. 무관한 낯선 사용자끼리 한 공간을 공유하므로 파일이 의도치 않게 노출될 우려가 있다.

요구사항:

1. 기존 **전체 공유 방**(`room-shared`, 모두가 보는 글로벌 공간)을 유지한다.
2. **공인 IP 기준 격리 방**을 추가한다 (같은 공인 IP = 같은 네트워크끼리만).
3. 사용자는 **파일 업로드 시점에 공유 대상**(전체 / 같은 네트워크)을 선택한다.
4. 조회 시에는 두 출처(전체 공유 + IP 공유)를 **구분 없이 하나의 목록으로 병합**해서 본다.

## 격리 모델 결정

- 격리 기준: **공인 IP 자동 그룹핑** (Snapdrop/LocalSend 방식). 같은 공인 IP면 같은 방.
- 잔여 위험(카페/회사 와이파이, 모바일 CGNAT에서 낯선 사용자가 같은 공인 IP 공유)은 **감수한다.** 추가 PIN/세분화는 도입하지 않는다 (YAGNI).

## 아키텍처

### 1소켓 = 2룸 멤버십

연결 시 각 소켓이 두 방에 동시 입장한다:

- `room-shared` — 전체 공유(기존, 고정)
- `room-<iphash>` — 같은 공인 IP (신규, 도출)

`registered` 이벤트 페이로드를 문자열 → 객체로 변경한다:

```json
{ "globalRoomId": "room-shared", "ipRoomId": "room-a1b2c3d4e5f6" }
```

- connectionStateRecovery 복구 경로는 `socket.data`에 두 ID를 모두 저장/복원한다.
- disconnect 시 두 방 모두에서 사용자를 제거한다.

### IP → 룸 ID 도출

```
공인 IP 추출  →  정규화(IPv4/IPv6)  →  HMAC(secret)  →  room-<hex 12자>
```

핵심 결정:

1. **IP를 그대로 룸 ID로 쓰지 않고 해시한다.**
   - 개인정보(IP)가 룸 ID·R2 경로·공유 링크에 노출되지 않는다.
   - 서버 시크릿(`ROOM_ID_SECRET`)으로 HMAC 하므로 외부에서 "남의 IP로 만든 룸 ID"를 추측해 REST로 파일을 긁을 수 없다. 즉 **룸 ID 자체가 사실상의 접근 토큰** 역할을 한다.
   - `room-${hmac_sha256(ROOM_ID_SECRET, normalizedIp).slice(0,12)}`

2. **IPv4와 IPv6를 다르게 정규화한다.**
   - IPv4: 전체 주소 사용 (NAT 덕분에 같은 집/사무실 = 같은 공인 IP).
   - IPv6: NAT가 없어 기기마다 주소가 다르므로 **/64 프리픽스**로 묶는다 (같은 망의 기기들이 한 방에 모이도록). 전체 주소로 묶으면 기기마다 방이 갈려 목적이 깨진다.

### 진짜 공인 IP 추출 (프록시 뒤)

백엔드는 Cloudflare 프록시 뒤(`api.clipboardapp.org`)에 있다. `socket.handshake.address`는 프록시 IP만 주므로 헤더에서 실제 IP를 읽어야 한다. 헤더는 위조 가능하므로 **신뢰하는 프록시가 넣어주는 헤더만** 사용한다.

추출 우선순위:

1. `socket.handshake.headers['cf-connecting-ip']` — Cloudflare가 항상 덮어쓰므로 클라이언트 위조 불가. **1순위.**
2. `socket.handshake.headers['x-forwarded-for']`의 **첫 번째** IP — 폴백.
3. `socket.handshake.address` — 최종 폴백.

> 인프라 보강 권고(코드 밖): 오리진이 Cloudflare를 거치지 않고 직접 접근 가능하면 `CF-Connecting-IP` 위조가 가능하므로, 오리진 방화벽을 Cloudflare IP 대역으로 제한하는 것을 권장한다.

### 업로드 — 공유 대상 선택

- UI에 스코프 선택을 추가한다: **"전체 공유" / "같은 네트워크"**.
- 기본값은 **localStorage에 기억된 마지막 선택**을 사용한다. 최초값은 안전한 쪽인 **IP(같은 네트워크)** 로 시작한다.
- 선택된 스코프가 다음 두 가지를 결정한다:
  1. R2 업로드 경로의 roomId (`{roomId}/{fileName}`).
  2. `publish` 실시간 브로드캐스트 대상 방.
- `publish` 메시지에 `target` 필드를 추가한다. **서버는 `target`이 그 소켓이 속한 두 방(globalRoomId / ipRoomId) 중 하나인지 검증**하고, 검증 실패 시 거부한다 (임의 방 발행 차단).

### 조회 — 병합 (구분 없이)

- **실시간**: 소켓이 두 방에 모두 속해 있으므로 양쪽 `message`를 자동 수신한다 → 같은 목록에 합친다.
- **초기 로드**: `GET /api/r2/files/:roomId`를 **두 roomId 각각 호출**하고 결과를 **병합·중복제거·시간순 정렬**한다.
- 화면에는 출처 라벨 없이 하나의 목록으로 표시한다 (요구사항: 구분 없이).
- 단, **내부 데이터는 각 파일이 자신의 roomId를 보유**한다. 삭제/다운로드/공유 링크가 올바른 방을 가리키려면 필요하다. (표시만 통합, 데이터는 출처 유지.)

## 변경 범위

### 백엔드

- 신규 `backend/src/utils/clientIp.ts` — IP 추출(헤더 우선순위) + 정규화(IPv4 / IPv6 /64) + HMAC 해시 → roomId.
- `backend/src/handlers/socketHandlers.ts`:
  - `handleConnection`: 두 방 입장, `registered`를 객체로 emit, `socket.data`에 두 ID 저장.
  - `handlePublish`: `target` 검증 + 해당 방으로만 라우팅.
  - `handleDisconnect`: 두 방 모두에서 사용자 제거.
- `backend/src/types/index.ts`: `registered`(객체화) · `publish`(`target` 필드) 타입 수정.
- `backend/src/managers/RoomManager.ts` · R2 서비스: **변경 없음** (방이 2개로 늘 뿐이고, 각 방 grace-cleanup이 독립적으로 동작).
- 신규 환경변수: `ROOM_ID_SECRET` (HMAC 솔트).

### 프론트엔드

- `services/socketService.js`: 새 `registered` 객체 처리, 두 roomId 보관.
- 업로드 UI: 스코프 선택 컴포넌트 + localStorage 기억.
- 파일 목록 로직(`useFileManager` 등): 두 방 조회·병합·중복제거·정렬, 파일별 roomId 태깅.
- i18n: 선택 라벨 키를 21개 로케일 전부에 추가.
- 하드코딩된 `'room-shared'` 상수/주석 정리.

## 엣지 케이스 / 마이그레이션

| 상황 | 처리 |
|---|---|
| IP 추출 실패(빈 값/unknown) | 전용 폴백 IP 룸(`room-unknown`)으로. 연결 거부 대신 가용성 우선. |
| 로컬 개발(`::1`/`127.0.0.1`) | 모든 dev 사용자가 같은 IP 룸 → dev에서 정상 동작. |
| 기존 `room-shared` 잔존 파일 | 영향 없음 (글로벌 방은 그대로 유지·사용). |
| 공유 링크의 크로스-IP 접근 | 링크에 roomId가 포함되어 다른 IP에서도 링크로는 접근 가능 — "명시적 공유"라 의도된 동작. 실시간 presence만 IP로 격리, 링크 공유는 경계를 넘는다. |

기존 위험(범위 밖): REST 엔드포인트(`DELETE /api/r2/files/:roomId` 등)에 인증이 없어 roomId만 알면 조작 가능하다. IP 룸은 해시 ID라 추측이 불가능해 실질적으로 더 안전해지지만, 글로벌 룸 ID는 알려져 있으므로 근본적인 인증 부재는 별도 과제로 남긴다.

## 남는 세부(구현 시 확정)

- **온라인 사용자 수 표시**: 방이 2개라 카운트도 2개다. 기본은 글로벌(`room-shared`) 수를 "접속자"로 표시한다.
- **글로벌 방 파일 자동삭제**: 현행대로 비면 grace 후 삭제를 유지한다 (전 세계 아무도 없을 때만 발생하므로 사실상 드묾).

## 테스트 (TDD)

- `clientIp.ts` 단위 테스트:
  - 같은 IPv4 → 같은 룸, 다른 IPv4 → 다른 룸.
  - 같은 /64 IPv6 → 같은 룸, 다른 /64 → 다른 룸.
  - 헤더 우선순위(CF > XFF 첫 IP > address).
  - 추출 실패 시 폴백 룸.
- `socketHandlers` 통합 테스트:
  - 연결 시 두 방 입장 및 `registered` 객체 페이로드.
  - `publish target=global` → 두 소켓(다른 IP) 모두 수신.
  - `publish target=ip` → 같은 IP 소켓만 수신, 다른 IP는 미수신.
  - 소켓이 속하지 않은 방을 target으로 한 발행 거부.
