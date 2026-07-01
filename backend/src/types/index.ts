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

/** registered 이벤트 페이로드 (두 룸 ID) */
export interface RegisteredPayload {
    globalRoomId: string;
    ipRoomId: string;
}

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

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (payload: RegisteredPayload) => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    /** IP 격리 룸("우리 네트워크")의 접속 기기 목록이 바뀔 때마다 전체 목록을 브로드캐스트 */
    'room-users': (devices: DeviceInfo[]) => void;
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
}
