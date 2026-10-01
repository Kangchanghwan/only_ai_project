import { Socket } from 'socket.io';
import { DeviceInfo, DeviceType, Identity, ClientHints } from '../utils/deviceInfo';

export type { DeviceInfo, DeviceType, Identity };

// === 룸 관련 타입 ===

/** 룸 데이터 (기기별 접속 정보, 생성 시간 저장) */
export interface RoomData {
    users: Map<string, DeviceInfo>;
    createdAt: Date;
    cleanupTimer?: ReturnType<typeof setTimeout>;
}

/** 룸 목록 (roomId를 키로 하는 객체) */
export interface Rooms {
    [roomId: string]: RoomData;
}

// === Socket 확장 타입 ===

/** Socket.IO 소켓에 룸 정보 추가 */
export interface ExtendedSocket extends Socket {
    globalRoomId?: string;   // 전체 공유 룸 (room-shared)
    ipRoomId?: string;       // 같은 공인 IP 격리 룸 (room-<iphash>)
}

// === 응답 타입 ===

/** 에러 응답 구조 */
export interface ErrorResponse {
    message: string;
    code?: string;
    timestamp: string;
}

/** 메시지 발행 응답 */
export interface PublishResponse {
    success: boolean;
}

// === Socket.IO 이벤트 타입 정의 ===

/** REST API 룸 인증용 토큰 묶음 (roomId → token, 유효 시간 초) */
export interface RoomTokensPayload {
    roomTokens: Record<string, string>;
    roomTokenTtlSec: number;
}

/** registered 이벤트 페이로드 (두 룸 ID + 룸 토큰) */
export interface RegisteredPayload extends RoomTokensPayload {
    globalRoomId: string;
    ipRoomId: string;
    /** 서버가 이 기기에 할당(또는 보장)한 정체성 — 클라이언트가 저장해 다음 접속에 보낸다 */
    identity?: Identity;
}

/** identity:reroll 응답 */
export type RerollResponse =
    | { ok: true; identity: Identity }
    | { ok: false; error: 'cooldown'; retryAfterMs: number };

/** publish 메시지 공유 대상 */
export type PublishTarget = 'global' | 'ip';

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
    publish: (
        message: any,
        target: PublishTarget,
        callback?: (error: Error | null, response?: PublishResponse) => void
    ) => void;
    /** 룸 토큰 재발급 요청 */
    'room-tokens': (callback: (payload: RoomTokensPayload) => void) => void;
    /** P2P 연결 사전 점검 시그널링 (같은 IP 룸 소켓에게만 중계) */
    'p2p:signal': (payload: { to: string; data: unknown }) => void;
    /** 이름표(동물+형용사) 다시 뽑기. 소켓당 3초 쿨다운 */
    'identity:reroll': (callback?: (res: RerollResponse) => void) => void;
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (payload: RegisteredPayload) => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    /** 룸(ip 또는 global)의 접속 기기 목록이 바뀔 때마다 해당 룸의 전체 목록을 브로드캐스트 */
    'room-users': (payload: { roomId: string; devices: DeviceInfo[] }) => void;
    'p2p:signal': (payload: { from: string; data: unknown }) => void;
    /** 이 기기의 정체성이 (재)할당됐을 때 */
    identity: (payload: { identity: Identity }) => void;
    error: (error: ErrorResponse) => void;
}

/** 서버 간 이벤트 (Redis 어댑터용, 향후 확장) */
export interface InterServerEvents {
    ping: () => void;
}

/** 소켓에 저장되는 데이터 */
export interface SocketData {
    globalRoomId?: string;
    ipRoomId?: string;
    userId?: string;
    /** 접속 시 sanitize된 클라이언트 힌트 (연결 복구 때 재사용) */
    hints?: ClientHints;
    /** 마지막으로 할당된 정체성 */
    identity?: Identity;
    /** 마지막 다시 뽑기 시각 (epoch ms) */
    lastRerollAt?: number;
}
