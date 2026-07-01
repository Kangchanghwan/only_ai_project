import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { parseDeviceInfo } from '../utils/deviceInfo';
import logger from '../utils/logger';

// === 유틸리티 함수 ===

/** 타임스탬프가 포함된 에러 응답 생성 */
const createError = (message: string, code?: string): ErrorResponse => ({
    message,
    code,
    timestamp: new Date().toISOString()
});

/** 소켓 핸드셰이크로부터 격리 IP 룸 ID 도출 (실패 시 소켓별 단독 격리 룸) */
const resolveIpRoomId = (socket: ExtendedSocket): string => {
    const secret = process.env.ROOM_ID_SECRET || 'dev-insecure-secret';
    const ip = extractClientIp(socket.handshake);
    if (!ip) {
        const soloRoom = `room-unknown-${socket.id}`;
        logger.error(`IP 추출 실패 [${socket.id}] → ${soloRoom} (단독 격리)`);
        return soloRoom;
    }
    return deriveIpRoomId(ip, secret);
};

// === 메인 핸들러 설정 ===

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

// === 개별 이벤트 핸들러 ===

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
