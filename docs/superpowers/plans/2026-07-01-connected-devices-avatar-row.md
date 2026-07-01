# ConnectedDevices Overlapping Avatar Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up real per-device presence data (IP-scoped room) end to end and restyle `ConnectedDevices.vue` from a flat icon row into an overlapping avatar row, per `DESIGN.md`'s presence-indicator direction.

**Architecture:** Backend parses the socket handshake User-Agent into `DeviceInfo` (deviceType/browser/os), stores it in a `Map<socketId, DeviceInfo>` per room (replacing the old numeric `userCount`), and broadcasts the IP-room roster via a new `room-users` Socket.IO event on join/leave. Frontend threads that roster through `socketService` → `useSocket` → `App.vue` → `RoomScreen.vue` → `AppHeader.vue` → `ConnectedDevices.vue`, which renders it as a capped (max 4 + "+N" badge), overlapping, animated avatar row.

**Tech Stack:** Node.js/TypeScript/Socket.IO 4.8 (backend), Vue 3 Composition API + Tailwind CSS 4 (frontend), Jest (backend tests), Vitest + Vue Test Utils (frontend tests).

**Spec:** `docs/superpowers/specs/2026-07-01-connected-devices-avatar-row-design.md`

---

## Task 1: Backend User-Agent parser (`deviceInfo.ts`)

**Files:**
- Create: `backend/src/utils/deviceInfo.ts`
- Test: `backend/src/__tests__/deviceInfo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/deviceInfo.test.ts`:

```ts
import { parseDeviceInfo } from '../utils/deviceInfo';

describe('parseDeviceInfo', () => {
    it('iPhone Safari를 모바일/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-1')).toEqual({
            socketId: 'sock-1',
            deviceType: 'mobile',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('iPad Safari를 태블릿/Safari/iOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        expect(parseDeviceInfo(ua, 'sock-2')).toEqual({
            socketId: 'sock-2',
            deviceType: 'tablet',
            browser: 'Safari',
            os: 'iOS'
        });
    });

    it('Android 폰 Chrome을 모바일/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-3')).toEqual({
            socketId: 'sock-3',
            deviceType: 'mobile',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Android 태블릿 Chrome을 태블릿/Chrome/Android로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-4')).toEqual({
            socketId: 'sock-4',
            deviceType: 'tablet',
            browser: 'Chrome',
            os: 'Android'
        });
    });

    it('Windows Chrome 데스크톱을 데스크톱/Chrome/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(parseDeviceInfo(ua, 'sock-5')).toEqual({
            socketId: 'sock-5',
            deviceType: 'desktop',
            browser: 'Chrome',
            os: 'Windows'
        });
    });

    it('Mac Firefox 데스크톱을 데스크톱/Firefox/macOS로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0';
        expect(parseDeviceInfo(ua, 'sock-6')).toEqual({
            socketId: 'sock-6',
            deviceType: 'desktop',
            browser: 'Firefox',
            os: 'macOS'
        });
    });

    it('Windows Edge 데스크톱을 데스크톱/Edge/Windows로 인식해야 함', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
        expect(parseDeviceInfo(ua, 'sock-7')).toEqual({
            socketId: 'sock-7',
            deviceType: 'desktop',
            browser: 'Edge',
            os: 'Windows'
        });
    });

    it('User-Agent가 없으면 desktop/Unknown/Unknown을 반환해야 함', () => {
        expect(parseDeviceInfo(undefined, 'sock-8')).toEqual({
            socketId: 'sock-8',
            deviceType: 'desktop',
            browser: 'Unknown',
            os: 'Unknown'
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npx jest src/__tests__/deviceInfo.test.ts`
Expected: FAIL — `Cannot find module '../utils/deviceInfo'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/utils/deviceInfo.ts`:

```ts
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
    socketId: string;
    deviceType: DeviceType;
    browser: string;
    os: string;
}

const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet|PlayBook/i;
const MOBILE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|Mobi/i;

function detectDeviceType(ua: string): DeviceType {
    if (TABLET_UA.test(ua)) return 'tablet';
    if (MOBILE_UA.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua: string): string {
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return 'Unknown';
}

function detectOs(ua: string): string {
    // iOS UA 문자열은 "like Mac OS X"를 포함하므로, macOS보다 먼저 검사해야 함
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
}

/** 소켓 핸드셰이크의 User-Agent를 가볍게 파싱해 기기 정보를 만든다 (외부 의존성 없음) */
export function parseDeviceInfo(userAgent: string | undefined, socketId: string): DeviceInfo {
    if (!userAgent) {
        return { socketId, deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' };
    }
    return {
        socketId,
        deviceType: detectDeviceType(userAgent),
        browser: detectBrowser(userAgent),
        os: detectOs(userAgent)
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `npx jest src/__tests__/deviceInfo.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/deviceInfo.ts backend/src/__tests__/deviceInfo.test.ts
git commit -m "feat(backend): add lightweight User-Agent device info parser"
```

---

## Task 2: RoomManager — replace `userCount` with a `users` Map

**Files:**
- Modify: `backend/src/types/index.ts`
- Modify: `backend/src/managers/RoomManager.ts`
- Modify: `backend/src/__tests__/RoomManager.test.ts`

- [ ] **Step 1: Update `RoomData` type**

In `backend/src/types/index.ts`, replace the `RoomData` interface and add `DeviceInfo` re-export. Full new top of file:

```ts
import { Socket } from 'socket.io';
import { DeviceInfo, DeviceType } from '../utils/deviceInfo';

export type { DeviceInfo, DeviceType };

// === 룸 관련 타입 ===

/** 룸 데이터 (기기별 접속 정보, 생성 시간 저장) */
export interface RoomData {
    users: Map<string, DeviceInfo>;
    createdAt: Date;
    cleanupTimer?: ReturnType<typeof setTimeout>;
}
```

Leave the rest of the file (`Rooms`, `ExtendedSocket`, `ErrorResponse`, `PublishResponse`, `RegisteredPayload`, `PublishTarget`, `ClientToServerEvents`, `InterServerEvents`, `SocketData`) unchanged for now — `ServerToClientEvents` is updated in Task 3.

- [ ] **Step 2: Update the existing RoomManager tests to the new signature (write the failing tests first)**

Replace the full contents of `backend/src/__tests__/RoomManager.test.ts`:

```ts
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { StorageService } from '../services/StorageService';
import { DeviceInfo } from '../utils/deviceInfo';

const device = (socketId: string): DeviceInfo => ({
    socketId,
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'Windows'
});

describe('RoomManager - Storage Integration', () => {
    let roomManager: RoomManager;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
        jest.useFakeTimers();

        mockStorageService = {
            deleteRoomFiles: jest.fn()
        } as any;

        roomManager = new RoomManager(mockStorageService, 5000);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('getSharedRoomId', () => {
        it('고정 룸 ID를 반환해야 함', () => {
            expect(roomManager.getSharedRoomId()).toBe('room-shared');
            expect(SHARED_ROOM_ID).toBe('room-shared');
        });
    });

    describe('getConnectedUserCount', () => {
        it('IP 룸 인원과 무관하게 공유 룸 인원만 실제 접속자 수로 반환해야 함', () => {
            roomManager.addUserToRoom(SHARED_ROOM_ID, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(SHARED_ROOM_ID, 'sock-2', device('sock-2'));
            roomManager.addUserToRoom('room-ipA', 'sock-1', device('sock-1'));
            roomManager.addUserToRoom('room-ipB', 'sock-2', device('sock-2'));

            expect(roomManager.getTotalUsers()).toBe(4);
            expect(roomManager.getConnectedUserCount()).toBe(2);
        });
    });

    describe('getRoomUsers', () => {
        it('룸에 입장한 기기 정보 목록을 반환해야 함', () => {
            const roomId = 'room-ipA';
            const d1 = device('sock-1');
            const d2: DeviceInfo = { socketId: 'sock-2', deviceType: 'mobile', browser: 'Safari', os: 'iOS' };

            roomManager.addUserToRoom(roomId, 'sock-1', d1);
            roomManager.addUserToRoom(roomId, 'sock-2', d2);

            expect(roomManager.getRoomUsers(roomId)).toEqual([d1, d2]);
        });

        it('사용자가 나가면 목록에서 제거되어야 함', async () => {
            const roomId = 'room-ipA';
            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(roomId, 'sock-2', device('sock-2'));

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(roomManager.getRoomUsers(roomId)).toEqual([device('sock-2')]);
        });

        it('존재하지 않는 룸은 빈 배열을 반환해야 함', () => {
            expect(roomManager.getRoomUsers('room-nonexistent')).toEqual([]);
        });
    });

    describe('removeUserFromRoom - Delayed Cleanup', () => {
        it('마지막 사용자가 나가면 grace period 후 스토리지 파일을 삭제해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');
            expect(remainingUsers).toBe(0);

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(roomManager.getRoomData(roomId)).toBeDefined();

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledTimes(1);

            expect(roomManager.getRoomUserCount(roomId)).toBe(0);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('사용자가 남아있을 때는 삭제를 스케줄링하지 않아야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(roomId, 'sock-2', device('sock-2'));

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(1);

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });

        it('스토리지 삭제가 실패해도 방은 삭제되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: false,
                deletedCount: 0,
                error: 'Storage error'
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('존재하지 않는 방의 사용자를 제거하려고 하면 0을 반환해야 함', async () => {
            const roomId = 'room-nonexistent';

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(0);
        });

        it('재입장 시 삭제 타이머가 취소되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            jest.advanceTimersByTime(3000);
            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(roomManager.getRoomUserCount(roomId)).toBe(1);
        });
    });

    describe('cancelAllTimers', () => {
        it('모든 방의 삭제 타이머를 취소해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 0
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            roomManager.cancelAllTimers();

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `backend/`): `npx jest src/__tests__/RoomManager.test.ts`
Expected: FAIL — TypeScript compile errors (`Expected 3 arguments, but got 1`) since `RoomManager.ts` still has the old signatures.

- [ ] **Step 4: Update `RoomManager.ts` to the new Map-based implementation**

Replace the full contents of `backend/src/managers/RoomManager.ts`:

```ts
import { Rooms, RoomData } from '../types';
import { DeviceInfo } from '../utils/deviceInfo';
import { StorageService } from '../services/StorageService';
import logger from '../utils/logger';

/** 고정 룸 ID */
export const SHARED_ROOM_ID = 'room-shared';

/** 기본 grace period: 10분 (ms) */
const DEFAULT_GRACE_PERIOD_MS = 10 * 60 * 1000;

/**
 * 룸 관리 클래스
 * - 단일 공유 룸 관리
 * - 사용자 입장/퇴장 및 기기 정보 추적 (socketId → DeviceInfo)
 * - 빈 룸은 grace period 후 자동 삭제
 * - 통계 조회
 */
export class RoomManager {
    private rooms: Rooms = {};
    private storageService: StorageService;
    private gracePeriodMs: number;

    constructor(storageService?: StorageService, gracePeriodMs?: number) {
        this.storageService = storageService || new StorageService();
        this.gracePeriodMs = gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    }

    /** 공유 룸 ID 반환 */
    getSharedRoomId(): string {
        return SHARED_ROOM_ID;
    }

    /** 새 룸 생성 */
    createRoom(roomId: string): void {
        if (!this.rooms[roomId]) {
            this.rooms[roomId] = {
                users: new Map(),
                createdAt: new Date()
            };
        }
    }

    /** 룸에 사용자 추가 (룸이 없으면 자동 생성, 삭제 타이머 취소) */
    addUserToRoom(roomId: string, socketId: string, deviceInfo: DeviceInfo): number {
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }

        // 예약된 삭제 타이머가 있으면 취소 (재입장 시 삭제 중단)
        if (this.rooms[roomId].cleanupTimer) {
            clearTimeout(this.rooms[roomId].cleanupTimer);
            delete this.rooms[roomId].cleanupTimer;
            logger.info(`Cancelled cleanup timer for room ${roomId} (user rejoined)`);
        }

        this.rooms[roomId].users.set(socketId, deviceInfo);
        return this.rooms[roomId].users.size;
    }

    /** 룸에서 사용자 제거 (빈 룸은 grace period 후 자동 삭제) */
    async removeUserFromRoom(roomId: string, socketId: string): Promise<number> {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].users.delete(socketId);

        // 빈 룸: grace period 후 삭제 스케줄링
        if (this.rooms[roomId].users.size <= 0) {
            logger.info(`Room ${roomId} is empty. Scheduling cleanup in ${this.gracePeriodMs / 1000}s`);

            this.rooms[roomId].cleanupTimer = setTimeout(() => {
                this._cleanupRoom(roomId);
            }, this.gracePeriodMs);

            return 0;
        }

        return this.rooms[roomId].users.size;
    }

    /** 실제 룸 삭제 로직 (타이머 만료 후 실행) */
    private async _cleanupRoom(roomId: string): Promise<void> {
        // 타이머 만료 시점에 사용자가 재입장했으면 삭제하지 않음
        if (this.rooms[roomId] && this.rooms[roomId].users.size > 0) {
            return;
        }

        const result = await this.storageService.deleteRoomFiles(roomId);
        if (result.success) {
            logger.info(`Deleted ${result.deletedCount} files for room ${roomId}`);
        } else {
            logger.error(`Failed to delete files for room ${roomId}: ${result.error}`);
        }

        delete this.rooms[roomId];
    }

    /** 모든 방의 삭제 타이머 취소 (graceful shutdown용) */
    cancelAllTimers(): void {
        for (const roomId of Object.keys(this.rooms)) {
            if (this.rooms[roomId].cleanupTimer) {
                clearTimeout(this.rooms[roomId].cleanupTimer);
                delete this.rooms[roomId].cleanupTimer;
            }
        }
        logger.info('All cleanup timers cancelled');
    }

    /** 룸의 현재 사용자 수 조회 */
    getRoomUserCount(roomId: string): number {
        return this.rooms[roomId]?.users.size || 0;
    }

    /** 룸에 입장한 기기 정보 목록 조회 (입장 순서) */
    getRoomUsers(roomId: string): DeviceInfo[] {
        return this.rooms[roomId] ? Array.from(this.rooms[roomId].users.values()) : [];
    }

    /** 전체 룸 개수 조회 */
    getTotalRooms(): number {
        return Object.keys(this.rooms).length;
    }

    /** 전체 사용자 수 조회 */
    getTotalUsers(): number {
        return Object.values(this.rooms).reduce((sum, room) => sum + room.users.size, 0);
    }

    /** 실제 접속자 수 (모든 소켓이 공유 룸에 1회 입장하므로 공유 룸 인원 = 접속자 수) */
    getConnectedUserCount(): number {
        return this.getRoomUserCount(SHARED_ROOM_ID);
    }

    /** 특정 룸 데이터 조회 */
    getRoomData(roomId: string): RoomData | undefined {
        return this.rooms[roomId];
    }

    /** 전체 룸 데이터 조회 (디버깅/모니터링용) */
    getAllRooms(): Rooms {
        return { ...this.rooms };
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `backend/`): `npx jest src/__tests__/RoomManager.test.ts`
Expected: PASS (all tests, including 3 new `getRoomUsers` tests)

- [ ] **Step 6: Run the full backend test suite to check for other breakage**

Run (from `backend/`): `npx jest`
Expected: FAIL only in `src/__tests__/server.test.ts` and/or TypeScript compile errors in `socketHandlers.ts` (old `addUserToRoom(roomId)` / `removeUserFromRoom(roomId)` call sites) — this is expected and fixed in Task 4. No other files should fail.

- [ ] **Step 7: Commit**

```bash
git add backend/src/types/index.ts backend/src/managers/RoomManager.ts backend/src/__tests__/RoomManager.test.ts
git commit -m "refactor(backend): track per-socket device info in RoomManager instead of a raw count"
```

---

## Task 3: Add `room-users` event type

**Files:**
- Modify: `backend/src/types/index.ts`

- [ ] **Step 1: Add the event to `ServerToClientEvents`**

In `backend/src/types/index.ts`, find:

```ts
/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (payload: RegisteredPayload) => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    error: (error: ErrorResponse) => void;
}
```

Replace with:

```ts
/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (payload: RegisteredPayload) => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    /** IP 격리 룸("우리 네트워크")의 접속 기기 목록이 바뀔 때마다 전체 목록을 브로드캐스트 */
    'room-users': (devices: DeviceInfo[]) => void;
    error: (error: ErrorResponse) => void;
}
```

- [ ] **Step 2: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: same pre-existing errors as end of Task 2 (unfixed `socketHandlers.ts` call sites) — no *new* errors introduced by this type addition itself. If `tsc` reports an error inside `types/index.ts` about `DeviceInfo`, verify the `import type { DeviceInfo, DeviceType } from '../utils/deviceInfo'; export type { DeviceInfo, DeviceType };` lines from Task 2 Step 1 are present.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/index.ts
git commit -m "feat(backend): add room-users Socket.IO event type"
```

---

## Task 4: Broadcast device roster from socketHandlers

**Files:**
- Modify: `backend/src/handlers/socketHandlers.ts`

- [ ] **Step 1: Update imports and `setupSocketHandlers`**

In `backend/src/handlers/socketHandlers.ts`, update the top imports:

```ts
import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { parseDeviceInfo } from '../utils/deviceInfo';
import logger from '../utils/logger';
```

Update the call to `handleConnection` inside `setupSocketHandlers` to pass `io`:

```ts
export const setupSocketHandlers = (io: Server, roomManager: RoomManager) => {
    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        handleConnection(socket, io, roomManager);

        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager));

        socket.on('publish', (msg: any, target: PublishTarget, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, msg, target, ack)
        );

        socket.on('error', (error) => {
            logger.error(`Socket 에러 [${socket.id}]:`, error);
        });
    });
};
```

- [ ] **Step 2: Update `handleConnection`**

Replace the `handleConnection` function:

```ts
/** 새 연결 처리: 전체 공유 룸 + IP 격리 룸 양쪽에 입장 */
const handleConnection = (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    try {
        const deviceInfo = parseDeviceInfo(socket.handshake.headers['user-agent'], socket.id);

        // connectionStateRecovery로 복구된 연결
        if (socket.recovered && socket.data.globalRoomId && socket.data.ipRoomId) {
            const recoveredGlobalRoomId = socket.data.globalRoomId;
            const recoveredIpRoomId = socket.data.ipRoomId;
            socket.globalRoomId = recoveredGlobalRoomId;
            socket.ipRoomId = recoveredIpRoomId;
            roomManager.addUserToRoom(recoveredGlobalRoomId, socket.id, deviceInfo);
            roomManager.addUserToRoom(recoveredIpRoomId, socket.id, deviceInfo);
            io.to(recoveredIpRoomId).emit('room-users', roomManager.getRoomUsers(recoveredIpRoomId));
            logger.log(`연결 복구 [${socket.id}] → ${recoveredGlobalRoomId} / ${recoveredIpRoomId}`);
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
        roomManager.addUserToRoom(globalRoomId, socket.id, deviceInfo);
        roomManager.addUserToRoom(ipRoomId, socket.id, deviceInfo);

        socket.emit('registered', { globalRoomId, ipRoomId });
        io.to(ipRoomId).emit('room-users', roomManager.getRoomUsers(ipRoomId));

        logger.log(`사용자 등록 [${socket.id}] → ${globalRoomId} / ${ipRoomId}`);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`연결 에러 [${socket.id}]: ${errMsg}`);

        socket.emit('error', createError('룸 입장 실패', 'ROOM_JOIN_ERROR'));
        socket.disconnect();
    }
};
```

- [ ] **Step 3: Update `handleDisconnect`**

Replace the `handleDisconnect` function:

```ts
/** 연결 종료 처리: 두 방 모두에서 사용자 제거 */
const handleDisconnect = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    const rooms = [socket.globalRoomId, socket.ipRoomId].filter((r): r is string => !!r);
    if (rooms.length === 0) return;

    for (const roomId of rooms) {
        try {
            const remainingUsers = await roomManager.removeUserFromRoom(roomId, socket.id);
            io.to(roomId).emit('user-left', remainingUsers);

            if (roomId === socket.ipRoomId) {
                io.to(roomId).emit('room-users', roomManager.getRoomUsers(roomId));
            }

            logger.log(`사용자 퇴장 [${socket.id}] ← ${roomId} (남은 인원: ${remainingUsers})`);
        } catch (error) {
            logger.error(`퇴장 처리 에러 [${socket.id}] @ ${roomId}:`, error);
        }
    }
};
```

`handlePublish` and `resolveIpRoomId` stay unchanged.

- [ ] **Step 4: Type-check and run the full backend suite**

Run (from `backend/`): `npx tsc --noEmit && npx jest`
Expected: PASS — all suites green (`deviceInfo.test.ts`, `RoomManager.test.ts`, `r2Service.test.ts`, `StorageService.test.ts`, `clientIp.test.ts`, and the pre-existing `server.test.ts` — Task 5 adds new cases to `server.test.ts` but the existing ones must already pass here).

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/socketHandlers.ts
git commit -m "feat(backend): parse device info on connect and broadcast IP-room roster"
```

---

## Task 5: Integration tests for `room-users` broadcast

**Files:**
- Modify: `backend/src/__tests__/server.test.ts`

- [ ] **Step 1: Write the failing integration tests**

In `backend/src/__tests__/server.test.ts`, add a new `describe` block right after `describe('3. Disconnect Handling', ...)`, before the final closing `});` of the outer `describe('Socket.IO Server - Single Shared Room', ...)`:

```ts
  describe('4. Device Roster (room-users)', () => {
    test('같은 IP로 접속한 두 소켓은 room-users로 서로를 포함한 목록을 받는다', (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.77',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.77',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1',
        },
      });
      clients.push(a, b);

      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };

      let aLen = 0;
      let bLen = 0;

      a.on('room-users', (devices: unknown[]) => {
        aLen = devices.length;
        if (aLen === 2 && bLen === 2) finish();
      });
      b.on('room-users', (devices: unknown[]) => {
        bLen = devices.length;
        if (aLen === 2 && bLen === 2) finish();
      });
    });

    test('한 명이 disconnect하면 남은 클라이언트는 room-users로 길이 1인 목록을 받는다', (done) => {
      const a = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.88',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const b = connect(`http://localhost:${serverPort}`, {
        transports: ['polling'],
        extraHeaders: {
          'x-forwarded-for': '198.51.100.88',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clients.push(a, b);

      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };

      let registered = 0;
      let sawInitialPair = false;

      const onReg = () => {
        registered++;
        if (registered === 2) {
          setTimeout(() => b.disconnect(), 50);
        }
      };
      a.on('registered', onReg);
      b.on('registered', onReg);

      a.on('room-users', (devices: unknown[]) => {
        if (devices.length === 2) {
          sawInitialPair = true;
          return;
        }
        if (sawInitialPair && devices.length === 1) {
          finish();
        }
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npx jest src/__tests__/server.test.ts -t "Device Roster"`
Expected: FAIL — if Task 4 wasn't done yet this would time out (no `room-users` event ever emitted). Since Task 4 is already implemented at this point in the plan, this should actually PASS already; if it fails, re-check Task 4's `handleConnection`/`handleDisconnect` changes before proceeding.

- [ ] **Step 3: Run test to verify it passes**

Run (from `backend/`): `npx jest src/__tests__/server.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 4: Run the full backend suite one more time**

Run (from `backend/`): `npx jest`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/server.test.ts
git commit -m "test(backend): cover room-users roster broadcast on join and disconnect"
```

---

## Task 6: `socketService.js` — track `ipRoomDevices`

**Files:**
- Modify: `frontend/src/services/socketService.js`
- Modify: `frontend/src/services/socketService.test.js`

- [ ] **Step 1: Write the failing test additions**

In `frontend/src/services/socketService.test.js`, update the `초기화` describe block to add one assertion, and the `disconnect 메서드를 호출할 수 있어야 한다` test to add one assertion:

```js
  describe('초기화', () => {
    it('초기 상태는 연결되지 않은 상태여야 한다', () => {
      expect(socketService.isConnected.value).toBe(false)
      expect(socketService.globalRoomId.value).toBeNull()
      expect(socketService.ipRoomId.value).toBeNull()
      expect(socketService.usersInRoom.value).toBe(0)
      expect(socketService.ipRoomDevices.value).toEqual([])
    })

    it('서버 URL이 올바르게 설정되어야 한다', () => {
      expect(socketService.serverUrl).toBeDefined()
    })
  })

  describe('연결 관리', () => {
    it('disconnect 메서드를 호출할 수 있어야 한다', () => {
      // disconnect는 에러 없이 호출될 수 있어야 함
      expect(() => socketService.disconnect()).not.toThrow()

      // 초기 상태 검증
      expect(socketService.isConnected.value).toBe(false)
      expect(socketService.globalRoomId.value).toBeNull()
      expect(socketService.ipRoomId.value).toBeNull()
      expect(socketService.usersInRoom.value).toBe(0)
      expect(socketService.ipRoomDevices.value).toEqual([])
    })
```

(Only the two `expect(socketService.ipRoomDevices.value).toEqual([])` lines are new; everything else in those two tests stays as-is.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/services/socketService.test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'value')`

- [ ] **Step 3: Add `ipRoomDevices` to `socketService.js`**

In `frontend/src/services/socketService.js`, in the constructor, right after `this.usersInRoom = ref(0)`:

```js
    this.usersInRoom = ref(0)
    this.ipRoomDevices = ref([])
    this.connectionError = ref(null)
```

Inside `connect()`, right after the line `this.socket.on('registered', handleRegistered)` at the end of the method, add a listener for the new event:

```js
      // 자동 룸 입장 이벤트 리스너 등록
      this.socket.on('registered', handleRegistered)

      // IP 격리 룸("우리 네트워크")의 접속 기기 목록 갱신
      this.socket.on('room-users', (devices) => {
        this.ipRoomDevices.value = devices
      })
    })
  }
```

(This replaces the previous closing `})\n  }` at the end of `connect()` — just make sure the new `this.socket.on('room-users', ...)` line sits between the existing last listener registration and the two closing braces of the `connect()` method.)

In `disconnect()`, inside the `if (this.socket) { ... }` block, right after `this.usersInRoom.value = 0`:

```js
      this.isConnected.value = false
      this.usersInRoom.value = 0
      this.ipRoomDevices.value = []
      this.connectionError.value = null
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npx vitest run src/services/socketService.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/socketService.js frontend/src/services/socketService.test.js
git commit -m "feat(frontend): track IP-room device roster in socketService"
```

---

## Task 7: Expose `ipRoomDevices` from `useSocket`

**Files:**
- Modify: `frontend/src/composables/useSocket.js`

- [ ] **Step 1: Add to the returned object**

In `frontend/src/composables/useSocket.js`, update the `return` statement:

```js
  return {
    isConnected: readonly(socketService.isConnected),
    isOnline: readonly(socketService.isOnline),
    usersInRoom: readonly(socketService.usersInRoom),
    ipRoomDevices: readonly(socketService.ipRoomDevices),
    globalRoomId: readonly(socketService.globalRoomId),
    ipRoomId: readonly(socketService.ipRoomId),

    connect: socketService.connect.bind(socketService),
    disconnect: socketService.disconnect.bind(socketService),
    destroy: socketService.destroy.bind(socketService),
    publishMessage: socketService.publishMessage.bind(socketService),

    onMessage,
    onUserLeft,
    onReconnected,
  }
```

No dedicated test file exists for `useSocket.js` today (it's a thin wrapper covered indirectly through `socketService.test.js` and component tests) — no new test added here.

- [ ] **Step 2: Sanity-check the frontend test suite still passes**

Run (from `frontend/`): `npx vitest run`
Expected: PASS (all existing suites; nothing consumes `ipRoomDevices` yet so nothing new should fail)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useSocket.js
git commit -m "feat(frontend): expose ipRoomDevices from useSocket"
```

---

## Task 8: Thread `devices` through App.vue → RoomScreen.vue → AppHeader.vue

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/components/RoomScreen.vue`
- Modify: `frontend/src/components/RoomScreen.test.js`
- Modify: `frontend/src/components/AppHeader.vue`
- Modify: `frontend/src/components/AppHeader.test.js`

- [ ] **Step 1: Write the failing RoomScreen test**

In `frontend/src/components/RoomScreen.test.js`, update the `AppHeader` stub to accept `devices`, and add `devices: []` to `defaultProps`:

```js
const stubs = {
  AppHeader: {
    name: 'AppHeader',
    template: '<div class="app-header-stub"><slot /></div>',
    props: ['userCount', 'isConnecting', 'devices']
  },
```

```js
  const defaultProps = {
    roomId: 'room-shared',
    files: [],
    texts: [],
    isLoading: false,
    userCount: 1,
    isConnecting: false,
    devices: []
  }
```

Then add a new test at the end of the `Props 변경` describe block:

```js
    it('devices props가 AppHeader에 전달되어야 한다', () => {
      const devices = [
        { socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }
      ]
      const wrapper = mount(RoomScreen, {
        props: { ...defaultProps, devices },
        global: { stubs }
      })

      const appHeader = wrapper.findComponent({ name: 'AppHeader' })
      expect(appHeader.props('devices')).toEqual(devices)
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/components/RoomScreen.test.js`
Expected: FAIL — `expect(appHeader.props('devices')).toEqual(devices)` receives `undefined`

- [ ] **Step 3: Add `devices` prop to `RoomScreen.vue` and forward it**

In `frontend/src/components/RoomScreen.vue`, add to `defineProps`:

```js
const props = defineProps({
  roomId: {
    type: String,
    default: null
  },
  files: {
    type: Array,
    default: () => []
  },
  texts: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  userCount: {
    type: Number,
    default: 1
  },
  devices: {
    type: Array,
    default: () => []
  },
  isConnecting: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  }
})
```

Update the `<AppHeader>` usage in the template:

```html
    <AppHeader
      :user-count="userCount"
      :is-connecting="isConnecting"
      :devices="devices"
    />
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npx vitest run src/components/RoomScreen.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Write the failing AppHeader test**

In `frontend/src/components/AppHeader.test.js`, add a new test after the existing "앱 타이틀은..." test:

```js
  it('devices prop이 전달되면 ConnectedDevices가 렌더링된다', async () => {
    const devices = [
      { socketId: 'a', deviceType: 'desktop', browser: 'Chrome', os: 'Windows' }
    ]
    const wrapper = mount(AppHeader, { props: { devices }, global: { stubs } })
    await flushPromises()

    const connectedDevices = wrapper.findComponent({ name: 'ConnectedDevices' })
    expect(connectedDevices.exists()).toBe(true)
    expect(connectedDevices.props('devices')).toEqual(devices)
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/components/AppHeader.test.js`
Expected: FAIL — `ConnectedDevices` component not found (`connectedDevices.exists()` is `false`)

- [ ] **Step 7: Wire `ConnectedDevices` into `AppHeader.vue`**

In `frontend/src/components/AppHeader.vue`, add the import:

```js
import ConnectedDevices from './ConnectedDevices.vue'
```

Add `devices` to `defineProps`:

```js
const props = defineProps({
  userCount: {
    type: Number,
    default: 1
  },
  isConnecting: {
    type: Boolean,
    default: false
  },
  devices: {
    type: Array,
    default: () => []
  }
})
```

Update the header's left-side div in the template:

```html
    <div class="flex items-center gap-3 text-2xl">
      <span class="text-4xl" aria-hidden="true">📋</span>
      <h1 class="font-display font-bold text-2xl m-0">{{ t('app.title') }}</h1>
      <ConnectedDevices :devices="devices" />
    </div>
```

- [ ] **Step 8: Run test to verify it passes**

Run (from `frontend/`): `npx vitest run src/components/AppHeader.test.js`
Expected: PASS (all tests) — note this depends on Task 9's `ConnectedDevices.vue` restyle being in place enough to mount cleanly; if Task 9 hasn't landed yet, run Task 9 first, or temporarily verify with the pre-existing `ConnectedDevices.vue` (it already mounts fine as `<script setup>` with a `devices` prop).

- [ ] **Step 9: Wire `devices` from `App.vue`**

In `frontend/src/App.vue`, find the `<RoomScreen>` usage and add `:devices` next to `:user-count`:

```html
    <RoomScreen
      v-else
      :is-connecting="isConnecting"
      :room-id="roomManager.globalRoomId.value"
      :files="fileManager.files.value"
      :texts="textShare.sharedTexts.value"
      :is-loading="fileManager.isLoading.value || isConnecting"
      :user-count="socket.usersInRoom.value"
      :devices="socket.ipRoomDevices.value"
      :has-more="fileManager.hasMore.value"
```

- [ ] **Step 10: Run the full frontend suite**

Run (from `frontend/`): `npx vitest run`
Expected: PASS (all suites)

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.vue frontend/src/components/RoomScreen.vue frontend/src/components/RoomScreen.test.js frontend/src/components/AppHeader.vue frontend/src/components/AppHeader.test.js
git commit -m "feat(frontend): thread IP-room device roster from App.vue down to AppHeader"
```

---

## Task 9: Restyle `ConnectedDevices.vue` as an overlapping avatar row

**Files:**
- Modify: `frontend/src/components/ConnectedDevices.vue`
- Create: `frontend/src/components/ConnectedDevices.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ConnectedDevices.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import ConnectedDevices from './ConnectedDevices.vue'

function makeDevice(socketId, overrides = {}) {
  return {
    socketId,
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'Windows',
    ...overrides
  }
}

describe('ConnectedDevices.vue', () => {
  it('devices가 비어있으면 아무것도 렌더링하지 않는다', () => {
    const wrapper = mount(ConnectedDevices, { props: { devices: [] } })
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
  })

  it('devices가 5개 이하이면 모두 아바타로 렌더링하고 오버플로우 배지는 없다', () => {
    const devices = [makeDevice('a'), makeDevice('b'), makeDevice('c')]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const avatars = wrapper.findAll('[title]')
    expect(avatars).toHaveLength(3)
    expect(wrapper.text()).not.toContain('+')
  })

  it('두 번째 아바타부터 겹침을 위한 음수 마진 클래스를 가진다', () => {
    const devices = [makeDevice('a'), makeDevice('b')]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const avatars = wrapper.findAll('[title]')
    expect(avatars[0].classes()).not.toContain('-ml-2')
    expect(avatars[1].classes()).toContain('-ml-2')
  })

  it('devices가 5개를 초과하면 4개만 아바타로 표시하고 나머지는 +N 배지로 요약한다', () => {
    const devices = [
      makeDevice('a'), makeDevice('b'), makeDevice('c'),
      makeDevice('d'), makeDevice('e'), makeDevice('f'), makeDevice('g')
    ]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    // 4개 아바타 + 1개 오버플로우 배지 = title 속성을 가진 요소 5개
    const avatars = wrapper.findAll('[title]')
    expect(avatars).toHaveLength(5)
    expect(wrapper.text()).toContain('+3')
  })

  it('오버플로우 배지의 title은 초과된 기기들의 라벨을 포함한다', () => {
    const devices = [
      makeDevice('a'), makeDevice('b'), makeDevice('c'), makeDevice('d'),
      makeDevice('e', { browser: 'Safari', os: 'iOS' })
    ]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    const badge = wrapper.findAll('[title]').at(-1)
    expect(badge.attributes('title')).toBe('Safari · iOS')
  })

  it('기기 타입에 맞는 아이콘을 렌더링한다', () => {
    const devices = [makeDevice('a', { deviceType: 'mobile' })]
    const wrapper = mount(ConnectedDevices, { props: { devices } })

    expect(wrapper.text()).toContain('📱')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/components/ConnectedDevices.test.js`
Expected: FAIL — the "겹침을 위한 음수 마진" and "오버플로우" tests fail because the current template renders every device the same way with no overflow handling and no `-ml-2` class.

- [ ] **Step 3: Rewrite `ConnectedDevices.vue`**

Replace the full contents of `frontend/src/components/ConnectedDevices.vue`:

```vue
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const MAX_VISIBLE = 4

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  }
})

function getDeviceIcon(deviceType) {
  switch (deviceType) {
    case 'mobile':
      return '📱'
    case 'tablet':
      return '📟'
    default:
      return '💻'
  }
}

function getDeviceLabel(device) {
  return `${device.browser} · ${device.os}`
}

const visibleDevices = computed(() => props.devices.slice(0, MAX_VISIBLE))
const overflowCount = computed(() => Math.max(props.devices.length - MAX_VISIBLE, 0))
const overflowLabel = computed(() =>
  props.devices.slice(MAX_VISIBLE).map((device) => getDeviceLabel(device)).join(', ')
)

function avatarStyle(index) {
  return { zIndex: props.devices.length - index }
}
</script>

<template>
  <div
    v-if="devices.length > 0"
    class="flex items-center"
    role="group"
    :aria-label="t('room.connectedDevices')"
  >
    <TransitionGroup name="avatar-enter" tag="div" class="flex items-center">
      <span
        v-for="(device, index) in visibleDevices"
        :key="device.socketId"
        :title="getDeviceLabel(device)"
        :style="avatarStyle(index)"
        :class="{ '-ml-2': index > 0 }"
        class="relative inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-primary/10 text-base cursor-default hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
      >
        {{ getDeviceIcon(device.deviceType) }}
      </span>
      <span
        v-if="overflowCount > 0"
        key="overflow"
        :title="overflowLabel"
        class="relative -ml-2 inline-flex items-center justify-center w-8 h-8 rounded-full ring-2 ring-background bg-border text-text-secondary text-xs font-semibold cursor-default hover:z-20! hover:-translate-y-0.5 hover:scale-105 transition-transform duration-150"
      >
        +{{ overflowCount }}
      </span>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.avatar-enter-enter-active {
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}

.avatar-enter-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.avatar-enter-leave-active {
  transition: opacity 150ms ease-in;
  position: absolute;
}

.avatar-enter-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .avatar-enter-enter-active,
  .avatar-enter-leave-active {
    transition: none;
  }
}
</style>
```

Note the `hover:z-20!` (trailing `!`) syntax — this project uses **Tailwind CSS v4**, where the important modifier is a suffix on the utility, not a `v3`-style leading `!z-20`. The inline `:style="avatarStyle(index)"` sets a base `z-index` with higher specificity than a plain class, so overriding it on hover requires the `!important`-generating suffix.

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npx vitest run src/components/ConnectedDevices.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Run the full frontend suite**

Run (from `frontend/`): `npx vitest run`
Expected: PASS (all suites, including `AppHeader.test.js` from Task 8 Step 8)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ConnectedDevices.vue frontend/src/components/ConnectedDevices.test.js
git commit -m "feat(frontend): restyle ConnectedDevices as an overlapping avatar row"
```

---

## Task 10: Manual verification

**Files:** none (manual QA pass only)

- [ ] **Step 1: Start both dev servers**

Run (from repo root, two terminals or backgrounded): `cd backend && npm run dev` and `cd frontend && npm run dev`

- [ ] **Step 2: Open the app in two browser tabs/windows on the same machine (same public IP)**

Navigate both to `http://localhost:5173`. Confirm:
- Each tab shows an overlapping avatar row next to the app title in the header.
- Opening a third tab adds a third avatar; closing a tab removes its avatar from the other tabs within ~1s.
- Hovering an avatar lifts it slightly and shows a tooltip with browser · OS.
- Avatar fades/scales in on join.

- [ ] **Step 3: Test the overflow badge**

Open 6+ tabs (or throttle-test by temporarily lowering `MAX_VISIBLE` to `2` locally, verifying the `+N` badge appears and shows the right count, then reverting the temporary change — do not commit the temporary change).

- [ ] **Step 4: Confirm no regression in the existing user-count flow**

Check that the existing "N명이 룸에 있습니다" notification (driven by `usersInRoom`/`user-left`, unrelated to this feature) still fires normally when a tab disconnects.

- [ ] **Step 5: No commit for this task** (manual QA only; report findings back to the user)
