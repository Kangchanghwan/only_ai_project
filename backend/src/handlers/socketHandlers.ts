import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, JoinResponse, PublishResponse } from '../types';
import { RoomManager } from '../managers/RoomManager';
import { parseDevice } from '../utils/parseDevice';
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

        // 연결 시 자동으로 룸 생성 및 할당
        handleConnection(socket, io, roomManager);

        // 연결 종료 처리
        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager));

        // 메시지 발행 처리
        socket.on('publish', (msg: any, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, msg, ack)
        );

        // 룸 입장 처리
        socket.on('join', (roomNr: number, ack?: (error: Error | null, response?: JoinResponse) => void) =>
            handleJoinRoom(socket, io, roomManager, roomNr, ack)
        );

        // 에러 로깅
        socket.on('error', (error) => {
            logger.error(`Socket 에러 [${socket.id}]:`, error);
        });
    });
};

// === 개별 이벤트 핸들러 ===

/** 새 연결 처리: 자동으로 룸 생성 및 할당 */
const handleConnection = (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    try {
        // 룸 번호 생성
        const roomNr = roomManager.generateRoomNumber();
        socket.roomNr = roomNr;
        socket.roomId = roomManager.getRoomId(roomNr);

        // Socket.IO 룸에 입장 & 사용자 수 증가
        socket.join(socket.roomId);
        roomManager.addUserToRoom(socket.roomId);

        // UA 파싱 → 디바이스 정보 추가
        const userAgent = socket.handshake.headers['user-agent'];
        const device = parseDevice(userAgent, socket.id);
        roomManager.addDeviceToRoom(socket.roomId, device);

        // 클라이언트에게 룸 번호 알림
        socket.emit('registered', roomNr);

        // 룸 전체에 디바이스 목록 전송
        io.to(socket.roomId).emit('devices-updated', roomManager.getRoomDevices(socket.roomId));

        logger.log(`사용자 등록 [${socket.id}] → ${socket.roomId} (룸번호: ${roomNr})`);

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`연결 에러 [${socket.id}]: ${errMsg}`);

        socket.emit('error', createError('룸 생성 실패', 'ROOM_CREATION_ERROR'));
        socket.disconnect();
    }
};

/** 연결 종료 처리 */
const handleDisconnect = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    if (!socket.roomId) return;

    try {
        // 디바이스 제거
        roomManager.removeDeviceFromRoom(socket.roomId, socket.id);

        const remainingUsers = await roomManager.removeUserFromRoom(socket.roomId);

        // 남은 사용자들에게 퇴장 알림
        io.to(socket.roomId).emit('user-left', remainingUsers);

        // 남은 사용자들에게 디바이스 목록 전송
        if (remainingUsers > 0) {
            io.to(socket.roomId).emit('devices-updated', roomManager.getRoomDevices(socket.roomId));
        }

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

/** 기존 룸 입장 처리 */
const handleJoinRoom = async (
    socket: ExtendedSocket,
    io: Server,
    roomManager: RoomManager,
    roomNr: number,
    ack?: (error: Error | null, response?: JoinResponse) => void
) => {
    // 소켓이 초기화되지 않은 경우
    if (!socket.roomId) {
        const error = new Error('소켓이 초기화되지 않음');
        if (ack) ack(error);
        return;
    }

    try {
        // 룸 번호 유효성 검사 (100000 ~ 999999)
        if (typeof roomNr !== 'number' || !Number.isInteger(roomNr) || roomNr < 100000 || roomNr > 999999) {
            const error = new Error('잘못된 룸 번호 형식');
            if (ack) {
                ack(error);
            } else {
                socket.emit('error', createError('잘못된 룸 번호 형식', 'INVALID_ROOM_NUMBER'));
            }
            logger.log(`잘못된 룸 번호 [${socket.id}]: ${roomNr}`);
            return;
        }

        // 룸 존재 여부 확인
        if (!roomManager.roomExists(roomNr)) {
            socket.emit('room-not-found');
            if (ack) {
                ack(new Error('룸을 찾을 수 없음'));
            }
            logger.log(`존재하지 않는 룸 입장 시도 [${socket.id}]: ${roomNr}`);
            return;
        }

        const oldRoomId = socket.roomId;
        const newRoomId = roomManager.getRoomId(roomNr);

        // 이미 해당 룸에 있는 경우
        if (oldRoomId === newRoomId) {
            if (ack) {
                ack(null, {
                    success: true,
                    alreadyInRoom: true,
                    roomNr,
                    usersInRoom: roomManager.getRoomUserCount(newRoomId)
                });
            }
            return;
        }

        // 기존 룸에서 나가기 (디바이스 제거 포함)
        roomManager.removeDeviceFromRoom(oldRoomId, socket.id);
        socket.leave(oldRoomId);
        const remainingInOldRoom = await roomManager.removeUserFromRoom(oldRoomId);
        io.to(oldRoomId).emit('user-left', remainingInOldRoom);
        if (remainingInOldRoom > 0) {
            io.to(oldRoomId).emit('devices-updated', roomManager.getRoomDevices(oldRoomId));
        }

        // 새 룸에 입장
        socket.roomId = newRoomId;
        socket.roomNr = roomNr;
        socket.join(newRoomId);

        const usersInNewRoom = roomManager.addUserToRoom(newRoomId);

        // UA 파싱 → 디바이스 정보 추가
        const userAgent = socket.handshake.headers['user-agent'];
        const device = parseDevice(userAgent, socket.id);
        roomManager.addDeviceToRoom(newRoomId, device);

        // 새 룸의 모든 사용자에게 알림
        io.to(newRoomId).emit('subscribed', roomNr, usersInNewRoom);
        io.to(newRoomId).emit('devices-updated', roomManager.getRoomDevices(newRoomId));

        // 성공 응답
        if (ack) {
            ack(null, {
                success: true,
                roomNr,
                usersInRoom: usersInNewRoom
            });
        }

        logger.log(`룸 이동 [${socket.id}]: ${oldRoomId} → ${newRoomId} (인원: ${usersInNewRoom})`);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`입장 에러 [${socket.id}]: ${errMsg}`);

        if (ack) {
            ack(error instanceof Error ? error : new Error(errMsg));
        } else {
            socket.emit('error', createError('룸 입장 실패', 'JOIN_ERROR'));
        }
    }
};
