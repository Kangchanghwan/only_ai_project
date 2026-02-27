import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import logger from '../utils/logger';

// === 유틸리티 함수 ===

/** 타임스탬프가 포함된 에러 응답 생성 */
const createError = (message: string, code?: string): ErrorResponse => ({
    message,
    code,
    timestamp: new Date().toISOString()
});

// === 메인 핸들러 설정 ===

/**
 * Socket.IO 이벤트 핸들러 등록
 * @param io - Socket.IO 서버 인스턴스
 * @param roomManager - 룸 관리자 인스턴스
 */
export const setupSocketHandlers = (io: Server, roomManager: RoomManager) => {
    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        // 연결 시 자동으로 공유 룸에 입장
        handleConnection(socket, roomManager);

        // 연결 종료 처리
        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager));

        // 메시지 발행 처리
        socket.on('publish', (msg: any, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, msg, ack)
        );

        // 에러 로깅
        socket.on('error', (error) => {
            logger.error(`Socket 에러 [${socket.id}]:`, error);
        });
    });
};

// === 개별 이벤트 핸들러 ===

/** 새 연결 처리: 자동으로 공유 룸에 입장 */
const handleConnection = (socket: ExtendedSocket, roomManager: RoomManager) => {
    try {
        // connectionStateRecovery로 복구된 연결
        if (socket.recovered && socket.data.roomId) {
            const restoredRoomId = socket.data.roomId;
            socket.roomId = restoredRoomId;
            roomManager.addUserToRoom(restoredRoomId);
            logger.log(`연결 복구 [${socket.id}] → ${restoredRoomId}`);
            return;
        }

        // 신규 연결: 고정 공유 룸에 입장
        const roomId = SHARED_ROOM_ID;
        socket.roomId = roomId;

        // socket.data에 저장 (connectionStateRecovery 복원용)
        socket.data.roomId = roomId;

        // Socket.IO 룸에 입장 & 사용자 수 증가
        socket.join(roomId);
        roomManager.addUserToRoom(roomId);

        // 클라이언트에게 룸 ID 알림
        socket.emit('registered', roomId);

        logger.log(`사용자 등록 [${socket.id}] → ${roomId}`);

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`연결 에러 [${socket.id}]: ${errMsg}`);

        socket.emit('error', createError('룸 입장 실패', 'ROOM_JOIN_ERROR'));
        socket.disconnect();
    }
};

/** 연결 종료 처리 */
const handleDisconnect = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    if (!socket.roomId) return;

    try {
        const remainingUsers = await roomManager.removeUserFromRoom(socket.roomId);

        // 남은 사용자들에게 퇴장 알림
        io.to(socket.roomId).emit('user-left', remainingUsers);

        logger.log(`사용자 퇴장 [${socket.id}] ← ${socket.roomId} (남은 인원: ${remainingUsers})`);
    } catch (error) {
        logger.error(`퇴장 처리 에러 [${socket.id}]:`, error);
    }
};

/** 메시지 발행 처리 */
const handlePublish = (
    socket: ExtendedSocket,
    io: Server,
    msg: any,
    ack?: (error: Error | null, response?: PublishResponse) => void
) => {
    // 룸에 속하지 않은 경우
    if (!socket.roomId) {
        const error = new Error('룸에 속하지 않음');
        if (ack) {
            ack(error);
        } else {
            socket.emit('error', createError('룸에 속하지 않음', 'NOT_IN_ROOM'));
        }
        return;
    }

    try {
        // 메시지 유효성 검사
        if (msg === undefined || msg === null) {
            if (ack) {
                ack(new Error('유효하지 않은 메시지'));
            }
            return;
        }

        // 룸의 모든 사용자에게 메시지 전송 (발신자 포함)
        io.to(socket.roomId).emit('message', msg);

        // 성공 응답
        if (ack) {
            ack(null, { success: true });
        }

        logger.log(`메시지 발행 [${socket.id}] @ ${socket.roomId}`);
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
