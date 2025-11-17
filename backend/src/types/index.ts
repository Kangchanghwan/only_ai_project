import { Socket } from 'socket.io';

// === 룸 관련 타입 ===

/** 룸 데이터 (사용자 수, 생성 시간 저장) */
export interface RoomData {
    userCount: number;
    createdAt: Date;
}

/** 룸 목록 (roomId를 키로 하는 객체) */
export interface Rooms {
    [roomId: string]: RoomData;
}

// === Socket 확장 타입 ===

/** Socket.IO 소켓에 룸 정보 추가 */
export interface ExtendedSocket extends Socket {
    roomNr?: number;   // 사용자용 6자리 룸 번호
    roomId?: string;   // 내부용 룸 ID (room-123456)
}

// === 응답 타입 ===

/** 에러 응답 구조 */
export interface ErrorResponse {
    message: string;
    code?: string;
    timestamp: string;
}

/** 룸 입장 응답 */
export interface JoinResponse {
    success: boolean;
    roomNr?: number;
    usersInRoom?: number;
    alreadyInRoom?: boolean;
}

/** 메시지 발행 응답 */
export interface PublishResponse {
    success: boolean;
}

// === Socket.IO 이벤트 타입 정의 ===

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
    join: (roomNr: number, callback?: (error: Error | null, response?: JoinResponse) => void) => void;
    publish: (message: any, callback?: (error: Error | null, response?: PublishResponse) => void) => void;
}

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
    registered: (roomNumber: number) => void;
    subscribed: (roomNumber: number, userCount: number) => void;
    'room-not-found': () => void;
    message: (msg: any) => void;
    'user-left': (userCount: number) => void;
    error: (error: ErrorResponse) => void;
}

/** 서버 간 이벤트 (Redis 어댑터용, 향후 확장) */
export interface InterServerEvents {
    ping: () => void;
}

/** 소켓에 저장되는 데이터 */
export interface SocketData {
    roomNr?: number;
    roomId?: string;
    userId?: string;
}
