# IP 격리 + 전체 공유 이중 룸 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 사용자가 공유하는 전체 룸(`room-shared`)을 유지하면서, 같은 공인 IP끼리만 공유되는 격리 룸을 추가하고, 업로드 시 대상을 선택하며 조회 시 두 출처를 구분 없이 병합해 보여준다.

**Architecture:** 각 소켓이 `room-shared`와 `room-<iphash>` 두 방에 동시 입장한다. 공인 IP는 Cloudflare `CF-Connecting-IP` 헤더에서 추출 후 HMAC 해시해 불투명 룸 ID로 만든다. 업로드 스코프가 R2 경로 roomId와 `publish` 브로드캐스트 대상을 결정하고, 조회는 두 roomId의 파일 목록을 병합한다. `RoomManager`와 R2 서비스는 변경 없이 재사용한다.

**Tech Stack:** Node.js + TypeScript + Socket.IO 4.8 (backend, Jest), Vue 3 Composition API + Vite (frontend, Vitest), Cloudflare R2.

설계 문서: `docs/superpowers/specs/2026-06-30-ip-scoped-sharing-design.md`

---

## File Structure

**Backend (생성/수정):**
- Create: `backend/src/utils/clientIp.ts` — IP 추출(헤더 우선순위) + 정규화(IPv4 / IPv6 /64) + HMAC → roomId. 단일 책임.
- Create: `backend/src/__tests__/clientIp.test.ts` — clientIp 단위 테스트.
- Modify: `backend/src/types/index.ts` — `registered` 객체화, `publish`에 `target`, `ExtendedSocket`/`SocketData`에 두 roomId.
- Modify: `backend/src/handlers/socketHandlers.ts` — 두 방 입장, registered 객체 emit, publish target 검증·라우팅, disconnect 두 방 정리.
- Modify: `backend/src/__tests__/server.test.ts` — 기존 기대값(문자열 registered) 갱신 + 이중 룸/타깃 라우팅 통합 테스트.
- Modify: `backend/.env.example` (있으면) / 문서 — `ROOM_ID_SECRET` 추가.

**Frontend (생성/수정):**
- Create: `frontend/src/composables/useShareScope.js` — 선택 스코프 상태 + localStorage 기억.
- Create: `frontend/src/composables/useShareScope.test.js` — 단위 테스트.
- Modify: `frontend/src/services/socketService.js` — 새 `registered` 객체 처리, `globalRoomId`/`ipRoomId` 노출.
- Modify: `frontend/src/composables/useRoomManager.js` — 두 roomId 보관.
- Modify: `frontend/src/composables/useFileManager.js` — 두 방 병합 로더 `loadFilesFromRooms`, 파일별 `roomId` 태깅.
- Modify: `frontend/src/composables/useFileManager.test.js` (없으면 생성) — 병합 로더 테스트.
- Modify: `frontend/src/components/FileUploadSection.vue` — 스코프 선택 UI + emit.
- Modify: `frontend/src/App.vue` — 두 룸 연결/병합 로딩/스코프별 업로드·publish 배선.
- Modify: `frontend/src/i18n/locales/*.json` (21개) — 스코프 라벨 키.

---

## Task 1: clientIp 유틸 — IP 추출 + 정규화 + 해시

**Files:**
- Create: `backend/src/utils/clientIp.ts`
- Test: `backend/src/__tests__/clientIp.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/src/__tests__/clientIp.test.ts`:

```typescript
import { extractClientIp, normalizeIp, deriveIpRoomId } from '../utils/clientIp';

// socket.handshake 형태를 흉내내는 최소 목 객체
const mkHandshake = (headers: Record<string, string | string[]>, address = '10.0.0.1') => ({
  headers,
  address,
});

describe('extractClientIp', () => {
  test('CF-Connecting-IP를 최우선으로 사용한다', () => {
    const hs = mkHandshake({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.2',
    });
    expect(extractClientIp(hs)).toBe('203.0.113.7');
  });

  test('CF 헤더가 없으면 X-Forwarded-For의 첫 IP를 사용한다', () => {
    const hs = mkHandshake({ 'x-forwarded-for': '198.51.100.1, 10.0.0.2' });
    expect(extractClientIp(hs)).toBe('198.51.100.1');
  });

  test('두 헤더가 모두 없으면 handshake.address로 폴백한다', () => {
    const hs = mkHandshake({}, '192.0.2.55');
    expect(extractClientIp(hs)).toBe('192.0.2.55');
  });

  test('아무것도 없으면 null을 반환한다', () => {
    const hs = mkHandshake({}, '');
    expect(extractClientIp(hs)).toBeNull();
  });
});

describe('normalizeIp', () => {
  test('IPv4는 전체 주소를 그대로 쓴다', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
  });

  test('IPv6는 /64 프리픽스로 정규화한다', () => {
    // 같은 /64 → 같은 정규화 결과
    expect(normalizeIp('2001:db8:abcd:0012:0000:0000:0000:0001'))
      .toBe(normalizeIp('2001:db8:abcd:0012:ffff:ffff:ffff:ffff'));
    // 다른 /64 → 다른 결과
    expect(normalizeIp('2001:db8:abcd:0012::1'))
      .not.toBe(normalizeIp('2001:db8:abcd:0099::1'));
  });

  test('IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4로 취급한다', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });
});

describe('deriveIpRoomId', () => {
  const secret = 'test-secret';

  test('같은 IP → 같은 룸 ID', () => {
    expect(deriveIpRoomId('203.0.113.7', secret))
      .toBe(deriveIpRoomId('203.0.113.7', secret));
  });

  test('다른 IP → 다른 룸 ID', () => {
    expect(deriveIpRoomId('203.0.113.7', secret))
      .not.toBe(deriveIpRoomId('203.0.113.8', secret));
  });

  test('room- 접두사 + 12자 hex 형식', () => {
    expect(deriveIpRoomId('203.0.113.7', secret)).toMatch(/^room-[0-9a-f]{12}$/);
  });

  test('같은 /64 IPv6는 같은 룸 ID로 묶인다', () => {
    expect(deriveIpRoomId('2001:db8:abcd:0012::1', secret))
      .toBe(deriveIpRoomId('2001:db8:abcd:0012::abcd', secret));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && npx jest src/__tests__/clientIp.test.ts`
Expected: FAIL — "Cannot find module '../utils/clientIp'".

- [ ] **Step 3: 최소 구현 작성**

Create `backend/src/utils/clientIp.ts`:

```typescript
import { createHmac } from 'crypto';

/** socket.handshake의 일부만 사용하는 최소 인터페이스 */
interface HandshakeLike {
    headers: Record<string, string | string[] | undefined>;
    address?: string;
}

const firstHeader = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
};

/**
 * 신뢰하는 프록시(Cloudflare)가 넣어주는 헤더에서 실제 공인 IP를 추출한다.
 * 우선순위: CF-Connecting-IP → X-Forwarded-For 첫 IP → handshake.address
 */
export const extractClientIp = (handshake: HandshakeLike): string | null => {
    const cf = firstHeader(handshake.headers['cf-connecting-ip']);
    if (cf && cf.trim()) return cf.trim();

    const xff = firstHeader(handshake.headers['x-forwarded-for']);
    if (xff && xff.trim()) {
        const first = xff.split(',')[0].trim();
        if (first) return first;
    }

    const addr = handshake.address?.trim();
    return addr ? addr : null;
};

/**
 * 그룹핑 키로 IP를 정규화한다.
 * - IPv4(및 IPv4-mapped IPv6): 전체 주소
 * - IPv6: /64 프리픽스(앞 4 hextet)로 묶음
 */
export const normalizeIp = (ip: string): string => {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) → IPv4
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return mapped[1];

    // IPv4
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;

    // IPv6: 앞 4개 hextet(= /64)만 사용
    if (ip.includes(':')) {
        const full = expandIpv6(ip);
        return full.slice(0, 4).join(':');
    }

    return ip;
};

/** 압축된 IPv6(::)를 8개 hextet 배열로 확장 */
const expandIpv6 = (ip: string): string[] => {
    const [head, tail = ''] = ip.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    const middle = missing > 0 ? new Array(missing).fill('0') : [];
    return [...headParts, ...middle, ...tailParts].map(h => (h || '0').toLowerCase());
};

/**
 * 공인 IP로부터 불투명한 격리 룸 ID를 만든다.
 * HMAC(secret) 으로 raw IP 노출과 추측을 막는다.
 */
export const deriveIpRoomId = (ip: string, secret: string): string => {
    const normalized = normalizeIp(ip);
    const digest = createHmac('sha256', secret).update(normalized).digest('hex');
    return `room-${digest.slice(0, 12)}`;
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && npx jest src/__tests__/clientIp.test.ts`
Expected: PASS — 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/utils/clientIp.ts backend/src/__tests__/clientIp.test.ts
git commit -m "feat(backend): 공인 IP 추출·정규화·해시 유틸 추가"
```

---

## Task 2: 타입 정의 수정 — 이중 룸 & publish target

**Files:**
- Modify: `backend/src/types/index.ts`

- [ ] **Step 1: 타입 수정**

`backend/src/types/index.ts`에서 아래를 교체한다.

`ExtendedSocket` 교체:

```typescript
/** Socket.IO 소켓에 룸 정보 추가 */
export interface ExtendedSocket extends Socket {
    globalRoomId?: string;   // 전체 공유 룸 (room-shared)
    ipRoomId?: string;       // 같은 공인 IP 격리 룸 (room-<iphash>)
}
```

`registered` 이벤트 페이로드 타입 추가 + `ServerToClientEvents` 수정:

```typescript
/** registered 이벤트 페이로드 (두 룸 ID) */
export interface RegisteredPayload {
    globalRoomId: string;
    ipRoomId: string;
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (payload: RegisteredPayload) => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    error: (error: ErrorResponse) => void;
}
```

`ClientToServerEvents`의 publish에 target 추가:

```typescript
/** publish 메시지 공유 대상 */
export type PublishTarget = 'global' | 'ip';

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
    publish: (
        message: any,
        target: PublishTarget,
        callback?: (error: Error | null, response?: PublishResponse) => void
    ) => void;
}
```

`SocketData` 수정:

```typescript
/** 소켓에 저장되는 데이터 */
export interface SocketData {
    globalRoomId?: string;
    ipRoomId?: string;
    userId?: string;
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && npx tsc --noEmit`
Expected: `socketHandlers.ts`에서 타입 에러 발생(다음 태스크에서 수정). 이 시점의 에러는 `registered` 호출 인자 불일치와 publish 시그니처 관련이어야 한다. 다른 신규 에러가 없는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/types/index.ts
git commit -m "feat(backend): 이중 룸 멤버십·publish target 타입 정의"
```

---

## Task 3: socketHandlers — 두 방 입장 / target 라우팅 / disconnect

**Files:**
- Modify: `backend/src/handlers/socketHandlers.ts`
- Modify: `backend/src/__tests__/server.test.ts`

- [ ] **Step 1: 기존 통합 테스트의 깨질 기대값을 새 모델로 갱신**

`backend/src/__tests__/server.test.ts`에서 `registered`를 문자열로 받는 부분을 객체로 바꾼다.

"should register client with shared room ID on connect" 교체:

```typescript
test('connect 시 globalRoomId와 ipRoomId를 함께 등록한다', (done) => {
  const client = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
  clients.push(client);

  client.on('registered', (payload: { globalRoomId: string; ipRoomId: string }) => {
    expect(payload.globalRoomId).toBe('room-shared');
    expect(payload.ipRoomId).toMatch(/^room-[0-9a-f]{12}$/);
    done();
  });
});
```

"should register all clients with the same shared room ID" 교체:

```typescript
test('모든 클라이언트가 같은 globalRoomId(room-shared)를 받는다', (done) => {
  const client1 = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
  const client2 = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
  clients.push(client1, client2);

  const globals: string[] = [];
  const check = () => {
    if (globals.length === 2) {
      expect(globals[0]).toBe('room-shared');
      expect(globals[1]).toBe('room-shared');
      done();
    }
  };

  client1.on('registered', (p: { globalRoomId: string }) => { globals.push(p.globalRoomId); check(); });
  client2.on('registered', (p: { globalRoomId: string }) => { globals.push(p.globalRoomId); check(); });
});
```

"should broadcast message to all users in shared room" 의 publish 호출에 target 인자를 추가한다(브로드캐스트가 `publish(msg, 'global')` 형태가 되도록). 해당 테스트에서 `client.emit('publish', testMessage)` 를 `client.emit('publish', testMessage, 'global')` 로 바꾼다.

- [ ] **Step 2: 새 통합 테스트 추가 (target 라우팅 격리)**

`server.test.ts`의 `describe('2. Message Broadcasting', ...)` 안에 추가한다. 다른 X-Forwarded-For 헤더로 서로 다른 IP 룸을 시뮬레이션한다.

```typescript
test("target=global 메시지는 IP가 다른 두 클라이언트 모두에게 도달한다", (done) => {
  const a = ioClient(`http://localhost:${serverPort}`, {
    transports: ['polling'],
    extraHeaders: { 'x-forwarded-for': '198.51.100.1' },
  });
  const b = ioClient(`http://localhost:${serverPort}`, {
    transports: ['polling'],
    extraHeaders: { 'x-forwarded-for': '203.0.113.9' },
  });
  clients.push(a, b);

  const msg = { type: 'text', content: 'global-hello' };
  let registered = 0;
  let received = 0;

  const onReg = () => { registered++; if (registered === 2) a.emit('publish', msg, 'global'); };
  a.on('registered', onReg);
  b.on('registered', onReg);

  const onMsg = (m: any) => { expect(m).toEqual(msg); received++; if (received === 2) done(); };
  a.on('message', onMsg);
  b.on('message', onMsg);
});

test("target=ip 메시지는 같은 IP 클라이언트끼리만 도달한다", (done) => {
  // 같은 XFF → 같은 IP 룸
  const a = ioClient(`http://localhost:${serverPort}`, {
    transports: ['polling'],
    extraHeaders: { 'x-forwarded-for': '198.51.100.50' },
  });
  const b = ioClient(`http://localhost:${serverPort}`, {
    transports: ['polling'],
    extraHeaders: { 'x-forwarded-for': '198.51.100.50' },
  });
  // 다른 IP → 받으면 안 됨
  const stranger = ioClient(`http://localhost:${serverPort}`, {
    transports: ['polling'],
    extraHeaders: { 'x-forwarded-for': '203.0.113.200' },
  });
  clients.push(a, b, stranger);

  const msg = { type: 'text', content: 'ip-only' };
  let registered = 0;
  const onReg = () => { registered++; if (registered === 3) a.emit('publish', msg, 'ip'); };
  a.on('registered', onReg);
  b.on('registered', onReg);
  stranger.on('registered', onReg);

  let received = 0;
  a.on('message', () => { received++; });
  b.on('message', () => { received++; });
  stranger.on('message', () => done(new Error('다른 IP가 ip 메시지를 수신함')));

  // a, b 두 명이 받으면 성공으로 간주
  const settle = () => { if (received === 2) done(); };
  a.on('message', settle);
  b.on('message', settle);
});

test("소켓이 속하지 않은 target은 에러로 거부된다", (done) => {
  const c = ioClient(`http://localhost:${serverPort}`, { transports: ['polling'] });
  clients.push(c);
  c.on('registered', () => {
    // @ts-expect-error 잘못된 target 강제 전송
    c.emit('publish', { type: 'text', content: 'x' }, 'bogus', (err: Error | null) => {
      expect(err).toBeTruthy();
      done();
    });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && npx jest src/__tests__/server.test.ts`
Expected: FAIL — 핸들러가 아직 객체 registered/target 라우팅을 구현하지 않아 실패.

- [ ] **Step 4: 핸들러 구현**

`backend/src/handlers/socketHandlers.ts` 전체를 아래로 교체한다.

```typescript
import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import logger from '../utils/logger';

// === 유틸리티 함수 ===

/** 타임스탬프가 포함된 에러 응답 생성 */
const createError = (message: string, code?: string): ErrorResponse => ({
    message,
    code,
    timestamp: new Date().toISOString()
});

/** IP 추출 실패 시 사용할 폴백 IP 룸 */
const FALLBACK_IP_ROOM_ID = 'room-unknown';

/** 소켓 핸드셰이크로부터 격리 IP 룸 ID 도출 (실패 시 폴백) */
const resolveIpRoomId = (socket: ExtendedSocket): string => {
    const secret = process.env.ROOM_ID_SECRET || 'dev-insecure-secret';
    const ip = extractClientIp(socket.handshake);
    if (!ip) {
        logger.error(`IP 추출 실패 [${socket.id}] → ${FALLBACK_IP_ROOM_ID}`);
        return FALLBACK_IP_ROOM_ID;
    }
    return deriveIpRoomId(ip, secret);
};

// === 메인 핸들러 설정 ===

export const setupSocketHandlers = (io: Server, roomManager: RoomManager) => {
    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        handleConnection(socket, roomManager);

        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager));

        socket.on('publish', (msg: any, target: PublishTarget, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, msg, target, ack)
        );

        socket.on('error', (error) => {
            logger.error(`Socket 에러 [${socket.id}]:`, error);
        });
    });
};

// === 개별 이벤트 핸들러 ===

/** 새 연결 처리: 전체 공유 룸 + IP 격리 룸 양쪽에 입장 */
const handleConnection = (socket: ExtendedSocket, roomManager: RoomManager) => {
    try {
        // connectionStateRecovery로 복구된 연결
        if (socket.recovered && socket.data.globalRoomId && socket.data.ipRoomId) {
            socket.globalRoomId = socket.data.globalRoomId;
            socket.ipRoomId = socket.data.ipRoomId;
            roomManager.addUserToRoom(socket.globalRoomId);
            roomManager.addUserToRoom(socket.ipRoomId);
            logger.log(`연결 복구 [${socket.id}] → ${socket.globalRoomId} / ${socket.ipRoomId}`);
            return;
        }

        const globalRoomId = SHARED_ROOM_ID;
        const ipRoomId = resolveIpRoomId(socket);

        socket.globalRoomId = globalRoomId;
        socket.ipRoomId = ipRoomId;
        socket.data.globalRoomId = globalRoomId;
        socket.data.ipRoomId = ipRoomId;

        socket.join(globalRoomId);
        socket.join(ipRoomId);
        roomManager.addUserToRoom(globalRoomId);
        roomManager.addUserToRoom(ipRoomId);

        socket.emit('registered', { globalRoomId, ipRoomId });

        logger.log(`사용자 등록 [${socket.id}] → ${globalRoomId} / ${ipRoomId}`);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`연결 에러 [${socket.id}]: ${errMsg}`);

        socket.emit('error', createError('룸 입장 실패', 'ROOM_JOIN_ERROR'));
        socket.disconnect();
    }
};

/** 연결 종료 처리: 두 방 모두에서 사용자 제거 */
const handleDisconnect = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    const rooms = [socket.globalRoomId, socket.ipRoomId].filter((r): r is string => !!r);
    if (rooms.length === 0) return;

    for (const roomId of rooms) {
        try {
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);
            io.to(roomId).emit('user-left', remainingUsers);
            logger.log(`사용자 퇴장 [${socket.id}] ← ${roomId} (남은 인원: ${remainingUsers})`);
        } catch (error) {
            logger.error(`퇴장 처리 에러 [${socket.id}] @ ${roomId}:`, error);
        }
    }
};

/** 메시지 발행 처리: target이 소켓이 속한 방인지 검증 후 해당 방에만 브로드캐스트 */
const handlePublish = (
    socket: ExtendedSocket,
    io: Server,
    msg: any,
    target: PublishTarget,
    ack?: (error: Error | null, response?: PublishResponse) => void
) => {
    const targetRoomId =
        target === 'global' ? socket.globalRoomId :
        target === 'ip' ? socket.ipRoomId :
        undefined;

    if (!targetRoomId) {
        const error = new Error('유효하지 않은 공유 대상');
        if (ack) {
            ack(error);
        } else {
            socket.emit('error', createError('유효하지 않은 공유 대상', 'INVALID_TARGET'));
        }
        return;
    }

    try {
        if (msg === undefined || msg === null) {
            if (ack) ack(new Error('유효하지 않은 메시지'));
            return;
        }

        io.to(targetRoomId).emit('message', msg);

        if (ack) ack(null, { success: true });

        logger.log(`메시지 발행 [${socket.id}] @ ${targetRoomId} (target=${target})`);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`발행 에러 [${socket.id}]: ${errMsg}`);

        if (ack) {
            ack(error instanceof Error ? error : new Error(errMsg));
        } else {
            socket.emit('error', createError('메시지 발행 실패', 'PUBLISH_ERROR'));
        }
    }
};
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && npx jest src/__tests__/server.test.ts && npx tsc --noEmit`
Expected: PASS — 통합 테스트 통과, 타입 에러 없음.

> 참고: 통합 테스트는 `transports: ['polling']` 로 연결해야 `extraHeaders`의 `x-forwarded-for`가 서버에 전달된다(websocket 핸드셰이크는 커스텀 헤더를 신뢰성 있게 보내지 못함).

- [ ] **Step 6: 커밋**

```bash
git add backend/src/handlers/socketHandlers.ts backend/src/__tests__/server.test.ts
git commit -m "feat(backend): 이중 룸 입장과 publish target 라우팅 구현"
```

---

## Task 4: ROOM_ID_SECRET 환경변수 문서화

**Files:**
- Modify: `backend/CLAUDE.md` (Environment Configuration 섹션) 또는 `backend/.env.example`(있으면)

- [ ] **Step 1: 환경변수 추가**

`backend/.env.example`이 존재하면 아래 줄을 추가한다. 없으면 루트 `CLAUDE.md`의 "Environment Variables > Backend" 블록에 추가한다.

```
# IP 격리 룸 ID 생성을 위한 HMAC 시크릿 (운영에서 반드시 임의의 강한 값으로 설정)
ROOM_ID_SECRET=change-me-to-a-long-random-string
```

- [ ] **Step 2: 커밋**

```bash
git add -A
git commit -m "docs(backend): ROOM_ID_SECRET 환경변수 문서화"
```

---

## Task 5: useShareScope 컴포저블 — 스코프 상태 + localStorage 기억

**Files:**
- Create: `frontend/src/composables/useShareScope.js`
- Test: `frontend/src/composables/useShareScope.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `frontend/src/composables/useShareScope.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { useShareScope } from './useShareScope'

describe('useShareScope', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('기본 스코프는 ip(같은 네트워크)이다', () => {
    const { scope } = useShareScope()
    expect(scope.value).toBe('ip')
  })

  it('localStorage에 저장된 값을 초기값으로 복원한다', () => {
    localStorage.setItem('share-scope', 'global')
    const { scope } = useShareScope()
    expect(scope.value).toBe('global')
  })

  it('setScope는 값을 바꾸고 localStorage에 저장한다', () => {
    const { scope, setScope } = useShareScope()
    setScope('global')
    expect(scope.value).toBe('global')
    expect(localStorage.getItem('share-scope')).toBe('global')
  })

  it('유효하지 않은 값은 무시한다', () => {
    const { scope, setScope } = useShareScope()
    setScope('nonsense')
    expect(scope.value).toBe('ip')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/composables/useShareScope.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

Create `frontend/src/composables/useShareScope.js`:

```javascript
import { ref } from 'vue'

const STORAGE_KEY = 'share-scope'
const VALID = ['ip', 'global']
const DEFAULT_SCOPE = 'ip'

/**
 * @composable useShareScope
 * @description 업로드 공유 대상('ip' | 'global') 상태를 관리하고
 *              마지막 선택을 localStorage에 기억한다.
 */
export function useShareScope() {
  const stored = localStorage.getItem(STORAGE_KEY)
  const initial = VALID.includes(stored) ? stored : DEFAULT_SCOPE
  const scope = ref(initial)

  function setScope(next) {
    if (!VALID.includes(next)) return
    scope.value = next
    localStorage.setItem(STORAGE_KEY, next)
  }

  return { scope, setScope }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/composables/useShareScope.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/composables/useShareScope.js frontend/src/composables/useShareScope.test.js
git commit -m "feat(frontend): 공유 스코프 상태·localStorage 기억 컴포저블"
```

---

## Task 6: socketService & useRoomManager — 두 roomId 처리

**Files:**
- Modify: `frontend/src/services/socketService.js`
- Modify: `frontend/src/composables/useRoomManager.js`

- [ ] **Step 1: socketService — 새 registered 객체 처리**

`frontend/src/services/socketService.js`에서:

생성자(`constructor`)의 반응형 상태 블록에 두 룸 ID 상태를 추가한다(예: `this.usersInRoom = ref(0)` 아래):

```javascript
    // 룸 ID 상태 (전체 공유 / IP 격리)
    this.globalRoomId = ref(null)
    this.ipRoomId = ref(null)
```

`handleRegistered` 함수(현재 `(roomId) => {...}`)를 객체 페이로드 처리로 교체한다:

```javascript
      const handleRegistered = (payload) => {
        console.log('[SocketService] 룸 입장 완료:', payload)
        clearTimeout(connectionTimeout)

        this.globalRoomId.value = payload.globalRoomId
        this.ipRoomId.value = payload.ipRoomId

        this.usersInRoom.value = 1
        this.connectionError.value = null
        this._wasConnected = true

        this.socket.off('registered', handleRegistered)
        resolve({ globalRoomId: payload.globalRoomId, ipRoomId: payload.ipRoomId, users: 1 })
      }
```

`connect()`의 "이미 연결되어 있는 경우" early-return의 resolve도 객체로 맞춘다:

```javascript
    if (this.socket?.connected) {
      console.warn('[SocketService] 이미 소켓에 연결되어 있습니다')
      return Promise.resolve({
        globalRoomId: this.globalRoomId.value,
        ipRoomId: this.ipRoomId.value,
        users: this.usersInRoom.value
      })
    }
```

`publishMessage`에 target 인자를 추가한다:

```javascript
  /**
   * 메시지를 서버로 전송합니다.
   * @param {Object} message - 전송할 메시지
   * @param {'global'|'ip'} target - 공유 대상 룸
   */
  publishMessage(message, target) {
    if (!this.socket?.connected) {
      console.error('[SocketService] 소켓이 연결되지 않았습니다')
      throw new Error('Socket not connected')
    }
    console.log('[SocketService] 메시지 전송:', message, 'target:', target)
    this.socket.emit('publish', message, target)
  }
```

상단의 `const SHARED_ROOM_ID = 'room-shared'` 상수와 그 주석은 더 이상 신뢰 원천이 아니므로 제거한다(서버가 registered로 내려줌).

- [ ] **Step 2: useSocket 컴포저블에 두 roomId / publish target 노출**

`frontend/src/composables/useSocket.js`를 열어 `socketService`의 값을 노출하는 부분을 확인한다. `publishMessage`를 래핑하는 메서드가 있으면 `(message, target)` 시그니처로 바꾸고, `globalRoomId`/`ipRoomId`를 반환 객체에 추가한다. (래핑 없이 `socketService`를 직접 노출 중이면 추가 작업 불필요 — 그 경우 App.vue에서 `socketService`/`socket.globalRoomId`로 접근한다.)

예시(useSocket이 명시적으로 래핑하는 패턴인 경우):

```javascript
  function publishMessage(message, target) {
    socketService.publishMessage(message, target)
  }
  // return 객체에 추가:
  //   globalRoomId: socketService.globalRoomId,
  //   ipRoomId: socketService.ipRoomId,
```

- [ ] **Step 3: useRoomManager — 두 roomId 보관**

`frontend/src/composables/useRoomManager.js` 전체를 교체한다:

```javascript
import { ref, computed, readonly } from 'vue'

/**
 * @composable useRoomManager
 * @description 이중 룸(전체 공유 + IP 격리) ID를 보관한다.
 */
export function useRoomManager() {
  const globalRoomId = ref(null)
  const ipRoomId = ref(null)

  /** 조회/병합에 사용할 룸 ID 목록 (값이 있는 것만) */
  const roomIds = computed(() =>
    [globalRoomId.value, ipRoomId.value].filter(Boolean)
  )

  /**
   * 서버가 내려준 두 룸 ID를 설정한다.
   * @param {{globalRoomId: string, ipRoomId: string}} payload
   */
  function setRooms(payload) {
    globalRoomId.value = payload.globalRoomId
    ipRoomId.value = payload.ipRoomId
    console.log('[useRoomManager] 룸 설정:', payload)
  }

  /** 스코프('global'|'ip')에 해당하는 룸 ID 반환 */
  function roomIdForScope(scope) {
    return scope === 'global' ? globalRoomId.value : ipRoomId.value
  }

  function leaveRoom() {
    globalRoomId.value = null
    ipRoomId.value = null
  }

  return {
    globalRoomId: readonly(globalRoomId),
    ipRoomId: readonly(ipRoomId),
    roomIds,
    setRooms,
    roomIdForScope,
    leaveRoom
  }
}
```

- [ ] **Step 4: 컴파일/실행 점검**

Run: `cd frontend && npx vitest run`
Expected: PASS — 기존 테스트가 깨지지 않음(useRoomManager의 `enterSharedRoom`/`currentRoomId`를 참조하던 테스트가 있으면 다음 태스크의 App 배선과 함께 갱신해야 하므로, 이 단계에서 실패하는 테스트가 있다면 그 목록을 기록).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/services/socketService.js frontend/src/composables/useSocket.js frontend/src/composables/useRoomManager.js
git commit -m "feat(frontend): 두 룸 ID 처리 및 publish target 전달"
```

---

## Task 7: useFileManager — 두 방 병합 로더 + roomId 태깅

**Files:**
- Modify: `frontend/src/composables/useFileManager.js`
- Create/Modify: `frontend/src/composables/useFileManager.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `frontend/src/composables/useFileManager.test.js` (없으면 신규):

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// r2Service 모킹
vi.mock('../services/r2Service.js', () => ({
  r2Service: {
    loadFiles: vi.fn(),
  },
}))

// gtag 전역 stub (useFileManager 모듈 로드시 호출됨)
globalThis.gtag = () => {}

import { r2Service } from '../services/r2Service.js'
import { useFileManager } from './useFileManager'

describe('useFileManager.loadFilesFromRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('여러 룸의 파일을 병합하고 각 파일에 roomId를 태깅한다', async () => {
    r2Service.loadFiles
      .mockResolvedValueOnce({ files: [{ name: 'a.png', url: 'u1', size: 10, created: '2026-01-01T00:00:00Z' }], nextToken: null })
      .mockResolvedValueOnce({ files: [{ name: 'b.png', url: 'u2', size: 20, created: '2026-01-02T00:00:00Z' }], nextToken: null })

    const fm = useFileManager()
    await fm.loadFilesFromRooms(['room-shared', 'room-abc'], { limit: 10 })

    const names = fm.files.value.map(f => f.name)
    expect(names).toContain('a.png')
    expect(names).toContain('b.png')
    // roomId 태깅 확인
    const a = fm.files.value.find(f => f.name === 'a.png')
    const b = fm.files.value.find(f => f.name === 'b.png')
    expect(a.roomId).toBe('room-shared')
    expect(b.roomId).toBe('room-abc')
  })

  it('최신순(created 내림차순)으로 정렬한다', async () => {
    r2Service.loadFiles
      .mockResolvedValueOnce({ files: [{ name: 'old.png', url: 'u', size: 1, created: '2026-01-01T00:00:00Z' }], nextToken: null })
      .mockResolvedValueOnce({ files: [{ name: 'new.png', url: 'u', size: 1, created: '2026-06-01T00:00:00Z' }], nextToken: null })

    const fm = useFileManager()
    await fm.loadFilesFromRooms(['room-shared', 'room-abc'])

    expect(fm.files.value[0].name).toBe('new.png')
  })

  it('총 용량은 두 룸 합계로 계산한다', async () => {
    r2Service.loadFiles
      .mockResolvedValueOnce({ files: [{ name: 'a', url: 'u', size: 10, created: '2026-01-01T00:00:00Z' }], nextToken: null })
      .mockResolvedValueOnce({ files: [{ name: 'b', url: 'u', size: 20, created: '2026-01-02T00:00:00Z' }], nextToken: null })

    const fm = useFileManager()
    await fm.loadFilesFromRooms(['room-shared', 'room-abc'])
    expect(fm.totalSize.value).toBe(30)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/composables/useFileManager.test.js`
Expected: FAIL — `loadFilesFromRooms`가 없음.

- [ ] **Step 3: loadFilesFromRooms 구현 + 기존 loader의 roomId 태깅**

`frontend/src/composables/useFileManager.js`의 `loadFiles` 함수 안에서 파일을 저장할 때 roomId를 태깅하도록 수정한다. `files.value = result.files` 줄을 아래로 교체:

```javascript
      files.value = result.files.map(f => ({ ...f, roomId }))
```

그리고 새 함수 `loadFilesFromRooms`를 `loadFiles` 바로 아래에 추가한다:

```javascript
  /**
   * 여러 룸(전체 공유 + IP 격리)의 파일을 한 번에 불러와 병합한다.
   * 각 파일에 출처 roomId를 태깅하고, created 내림차순으로 정렬한다.
   *
   * @param {string[]} roomIds - 조회할 룸 ID 목록
   * @param {Object} options - 로드 옵션 (limit)
   * @returns {Promise<void>}
   */
  async function loadFilesFromRooms(roomIds, options = {}) {
    const ids = (roomIds || []).filter(Boolean)
    if (ids.length === 0) {
      console.warn('[useFileManager] roomIds가 비어 있습니다')
      return
    }

    isLoading.value = true
    error.value = null
    // 병합 모드에서는 단일 페이지네이션을 비활성화한다(여러 룸 토큰 혼재 방지)
    currentRoomId.value = null
    nextToken.value = null

    try {
      const results = await Promise.all(
        ids.map(roomId =>
          r2Service.loadFiles(roomId, options)
            .then(res => res.files.map(f => ({ ...f, roomId })))
            .catch(err => {
              console.error(`[useFileManager] 룸 ${roomId} 로드 실패:`, err)
              return []
            })
        )
      )

      const merged = results.flat()
      // created 내림차순 정렬(최신 우선)
      merged.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

      files.value = merged
      totalSize.value = merged.reduce((sum, f) => sum + (f.size || 0), 0)

      console.log(`[useFileManager] 병합 로드 완료: ${merged.length}개, 총 용량 ${totalSize.value} bytes`)
    } catch (err) {
      console.error('[useFileManager] 병합 로드 오류:', err)
      error.value = err
      files.value = []
    } finally {
      isLoading.value = false
    }
  }
```

마지막으로 반환 객체(`return { ... }`)에 `loadFilesFromRooms`를 추가한다:

```javascript
    loadFiles,
    loadFilesFromRooms,
    loadMore,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/composables/useFileManager.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/composables/useFileManager.js frontend/src/composables/useFileManager.test.js
git commit -m "feat(frontend): 두 룸 파일 병합 로더와 roomId 태깅"
```

---

## Task 8: i18n — 스코프 라벨 키 추가 (21개 로케일)

**Files:**
- Modify: `frontend/src/i18n/locales/*.json` (전체)

- [ ] **Step 1: 키 구조 확인**

Run: `cd frontend && ls src/i18n/locales && head -30 src/i18n/locales/ko.json`
Expected: 각 로케일 JSON의 최상위 구조 확인(예: `upload`, `room` 등 네임스페이스).

- [ ] **Step 2: ko.json에 키 추가**

`frontend/src/i18n/locales/ko.json`의 적절한 네임스페이스(예: `upload`)에 추가한다. 네임스페이스 위치는 Step 1 결과에 맞춘다:

```json
"shareScope": {
  "label": "공유 대상",
  "ip": "같은 네트워크",
  "global": "전체 공유"
}
```

- [ ] **Step 3: 나머지 20개 로케일에 동일 키 추가(각 언어로 번역)**

각 `src/i18n/locales/<lang>.json`에 같은 경로로 키를 추가한다. 영어 예시(`en.json`):

```json
"shareScope": {
  "label": "Share with",
  "ip": "Same network",
  "global": "Everyone"
}
```

나머지 언어는 해당 언어로 번역해 추가한다. 모든 파일에 `shareScope.label/ip/global` 세 키가 존재해야 한다.

- [ ] **Step 4: 누락 검증**

Run: `cd frontend && for f in src/i18n/locales/*.json; do node -e "const o=require('./$f'); const has=JSON.stringify(o).includes('shareScope'); if(!has) console.log('MISSING:', '$f')"; done`
Expected: 출력 없음(모든 파일에 존재).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/i18n/locales
git commit -m "i18n: 공유 스코프 선택 라벨 키 21개 로케일 추가"
```

---

## Task 9: FileUploadSection — 스코프 선택 UI

**Files:**
- Modify: `frontend/src/components/FileUploadSection.vue`

- [ ] **Step 1: 현재 컴포넌트 구조 확인**

Run: `cd frontend && sed -n '1,80p' src/components/FileUploadSection.vue`
Expected: props/emits, 파일 선택 핸들러 구조 파악.

- [ ] **Step 2: 스코프 선택 UI + emit 추가**

`<script setup>`에 `useShareScope`를 가져와 상태를 만들고, 사용자가 바꾸면 상위로 emit 한다. props로 받지 않고 컴포넌트가 직접 `useShareScope`를 쓰되, App이 업로드 시 같은 값을 읽을 수 있도록 **App.vue에서도 같은 `useShareScope`를 사용**한다(컴포저블은 localStorage를 단일 출처로 공유). 따라서 여기서는 UI만 담당한다.

`<script setup>`에 추가:

```javascript
import { useShareScope } from '../composables/useShareScope'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { scope, setScope } = useShareScope()
```

`<template>`의 업로드 영역 상단(파일 선택 버튼 근처)에 토글을 추가:

```html
<div class="share-scope" role="radiogroup" :aria-label="t('upload.shareScope.label')">
  <span class="share-scope__label">{{ t('upload.shareScope.label') }}</span>
  <button
    type="button"
    role="radio"
    :aria-checked="scope === 'ip'"
    :class="['share-scope__btn', { 'is-active': scope === 'ip' }]"
    @click="setScope('ip')"
  >{{ t('upload.shareScope.ip') }}</button>
  <button
    type="button"
    role="radio"
    :aria-checked="scope === 'global'"
    :class="['share-scope__btn', { 'is-active': scope === 'global' }]"
    @click="setScope('global')"
  >{{ t('upload.shareScope.global') }}</button>
</div>
```

> 참고: `upload.shareScope` 경로는 Task 8에서 키를 넣은 네임스페이스와 일치시킨다.

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && npx vite build` (또는 `npm run build`)
Expected: 빌드 성공(템플릿/스크립트 문법 오류 없음).

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/FileUploadSection.vue
git commit -m "feat(frontend): 업로드 공유 대상 선택 UI 추가"
```

---

## Task 10: App.vue 배선 — 두 룸 연결 / 병합 로딩 / 스코프 업로드

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: import 및 컴포저블 추가**

`<script setup>` 상단 import에 추가:

```javascript
import { useShareScope } from './composables/useShareScope'
```

컴포저블 초기화 블록(`const roomManager = useRoomManager()` 부근)에 추가:

```javascript
const shareScope = useShareScope()
```

- [ ] **Step 2: connectToRoom — 두 룸 설정 + 병합 로딩**

`connectToRoom` 내부에서 `await socket.connect()` 의 반환값으로 룸을 설정하고, 단일 `loadFiles` 대신 병합 로더를 호출하도록 교체한다. 기존:

```javascript
    await socket.connect()
    roomManager.enterSharedRoom()
    fileManager.loadFiles(roomManager.currentRoomId.value, { limit: 10 })
```

교체:

```javascript
    const { globalRoomId, ipRoomId } = await socket.connect()
    roomManager.setRooms({ globalRoomId, ipRoomId })
    fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: 10 })
```

- [ ] **Step 3: onReconnected 콜백 갱신**

상단 `socket.onReconnected(...)` 콜백 내부의 룸 재설정/재로딩도 병합 기준으로 바꾼다. 기존 `roomManager.enterSharedRoom()` + `fileManager.loadFiles(roomManager.currentRoomId.value, ...)` 부분을 교체:

```javascript
  // socketService가 재연결 시 globalRoomId/ipRoomId를 갱신해 두므로 그대로 사용
  roomManager.setRooms({
    globalRoomId: socket.globalRoomId.value,
    ipRoomId: socket.ipRoomId.value
  })
  ...
  fileManager.clearFiles()
  textShare.clearAllTexts()
  fileManager.loadFilesFromRooms(roomManager.roomIds.value, { limit: 10 })
```

> `socket.globalRoomId`/`socket.ipRoomId` 노출은 Task 6에 따른다. useSocket이 노출하지 않으면 `socketService`를 직접 import 해 `socketService.globalRoomId.value`를 쓴다.

- [ ] **Step 4: setupSocketListeners — file-uploaded 시 병합 재로딩**

`setupSocketListeners`의 message 핸들러에서 `file-uploaded` 처리부의 단일 로딩을 병합 로딩으로 바꾼다. 기존:

```javascript
    if (message.type === 'file-uploaded') {
      notification.showInfo('새 파일이 업로드되었습니다!')
      if (roomManager.currentRoomId.value) {
        fileManager.loadFiles(roomManager.currentRoomId.value)
      }
    }
```

교체:

```javascript
    if (message.type === 'file-uploaded') {
      notification.showInfo('새 파일이 업로드되었습니다!')
      if (roomManager.roomIds.value.length > 0) {
        fileManager.loadFilesFromRooms(roomManager.roomIds.value)
      }
    }
```

- [ ] **Step 5: uploadFiles — 스코프별 roomId 업로드 + target publish**

`uploadFiles` 함수에서 가드와 업로드 대상 roomId, publish target을 스코프 기준으로 바꾼다.

함수 시작부 가드 교체:

```javascript
async function uploadFiles(files) {
  const targetRoomId = roomManager.roomIdForScope(shareScope.scope.value)
  if (!targetRoomId) return
```

(함수 내 다른 `if (!roomManager.currentRoomId.value) return` 가드들도 `if (!targetRoomId) return` 으로 교체.)

`fileManager.uploadFile(...)` 호출의 roomId 인자를 교체:

```javascript
      const result = await fileManager.uploadFile(
        targetRoomId,
        file,
        { onProgress: (percent) => { notification.updateUpload(uploadId, percent) } }
      )
```

`socket.publishMessage(...)` 호출을 target과 함께 교체:

```javascript
      socket.publishMessage({
        type: 'file-uploaded',
        fileName: result.fileName,
        url: result.url,
        roomId: targetRoomId
      }, shareScope.scope.value)
```

`fileManager.addFile({...})`에 roomId 태깅을 추가(병합 목록과 일관성 유지):

```javascript
      fileManager.addFile({
        name: result.fileName,
        url: result.url,
        size: result.size,
        created: result.created,
        roomId: targetRoomId
      })
```

- [ ] **Step 6: handlePaste / handleUploadFiles 가드 갱신**

`handlePaste`와 `handleUploadFiles` 시작부의 `if (!roomManager.currentRoomId.value) return` 가드를 두 룸 기준으로 교체:

```javascript
  if (roomManager.roomIds.value.length === 0) return
```

- [ ] **Step 7: 텍스트 공유 publish의 target 인자 확인**

`useTextShare` 또는 App에서 `socket.publishMessage`로 텍스트(`text-shared` 등)를 보내는 모든 호출에 두 번째 인자 target을 추가한다. 텍스트 공유는 파일과 동일한 스코프를 따르도록 `shareScope.scope.value`를 전달한다.

Run: `cd frontend && grep -rn "publishMessage" src/`
각 호출부에 target 인자가 빠진 곳이 없는지 확인하고 `shareScope.scope.value`(또는 텍스트 전용 스코프 정책상 'global')를 추가한다.

> 결정: 텍스트 공유도 파일과 동일하게 선택된 스코프를 따른다. (별도 UI 없이 현재 선택값 사용.)

- [ ] **Step 8: 빌드 + 테스트**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS + 빌드 성공. (RoomScreen.test.js 등 기존 테스트가 `currentRoomId`/`enterSharedRoom`을 참조해 깨지면, 해당 테스트를 새 API(`setRooms`/`roomIds`)에 맞게 갱신한다.)

- [ ] **Step 9: 커밋**

```bash
git add frontend/src/App.vue
git commit -m "feat(frontend): 이중 룸 연결·병합 로딩·스코프 업로드 배선"
```

---

## Task 11: 깨진 기존 프론트 테스트 정리

**Files:**
- Modify: `frontend/src/components/RoomScreen.test.js` 등 (Task 6/10에서 발견된 것)

- [ ] **Step 1: 전체 프론트 테스트 실행해 실패 목록 확보**

Run: `cd frontend && npx vitest run`
Expected: `useRoomManager`의 `enterSharedRoom`/`currentRoomId` 제거로 인한 실패가 있을 수 있음. 실패 테스트 목록을 기록.

- [ ] **Step 2: 실패 테스트를 새 API로 갱신**

각 실패 테스트에서 `roomManager.enterSharedRoom()` → `roomManager.setRooms({ globalRoomId: 'room-shared', ipRoomId: 'room-test' })`, `currentRoomId` → `globalRoomId`/`roomIds` 로 바꾼다. (테스트 의도를 유지하면서 API만 갱신.)

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `cd frontend && npx vitest run`
Expected: PASS — 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src
git commit -m "test(frontend): 이중 룸 API에 맞춰 기존 테스트 갱신"
```

---

## Task 12: 전체 검증 (백엔드 + 프론트)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 + 타입체크**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: 컴파일 에러 없음, 전체 테스트 PASS.

- [ ] **Step 2: 프론트 전체 테스트 + 빌드**

Run: `cd frontend && npx vitest run && npm run build`
Expected: 전체 테스트 PASS, 프로덕션 빌드 성공.

- [ ] **Step 3: 수동 동작 확인(로컬)**

1. `cd backend && npm run dev` 와 `cd frontend && npm run dev` 실행.
2. 같은 브라우저에서 두 탭 열기 → 같은 localhost IP → IP 룸 동일.
3. 한 탭에서 "같은 네트워크"로 파일 업로드 → 다른 탭에서 즉시 보임.
4. "전체 공유"로 업로드 → 동일하게 목록에 구분 없이 합쳐져 보임.
5. 새로고침 후에도 두 출처 파일이 한 목록에 병합되어 로드되는지 확인.

Expected: 업로드 스코프 토글이 동작하고, 조회 목록은 출처 구분 없이 병합된다.

- [ ] **Step 4: 최종 커밋(필요 시)**

```bash
git add -A
git commit -m "chore: IP 격리 이중 룸 공유 기능 검증 완료" --allow-empty
```

---

## 비고 / 남은 과제(범위 밖)

- REST 엔드포인트 인증 부재(글로벌 룸 ID는 알려져 있음)는 별도 보안 과제.
- 오리진 방화벽을 Cloudflare IP 대역으로 제한(코드 밖 인프라 설정) 권장 — `CF-Connecting-IP` 위조 방지.
- 온라인 사용자 수 표시는 글로벌 룸 기준을 유지(이중 룸으로 인한 카운트 변화는 UX 미세 이슈).
