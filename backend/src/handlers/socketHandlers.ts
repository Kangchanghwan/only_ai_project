import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget, RoomTokensPayload, RerollResponse } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { parseDeviceInfo, sanitizeHints, DeviceInfo } from '../utils/deviceInfo';
import { assignIdentity, collectUsed, sanitizeIdentity, REROLL_COOLDOWN_MS } from '../utils/identity';
import { toSender } from '../utils/uploaderStore';
import { issueRoomTokens, getRoomTokenTtlSec } from '../utils/roomToken';
import { TokenBucket } from '../utils/tokenBucket';
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

/** 소켓이 속한 룸들(전체 + IP)의 REST API용 룸 토큰 묶음 */
const buildRoomTokenPayload = (socket: ExtendedSocket): RoomTokensPayload => ({
    roomTokens: issueRoomTokens([socket.globalRoomId, socket.ipRoomId]),
    roomTokenTtlSec: getRoomTokenTtlSec(),
});

// === P2P 시그널링 (연결 사전 점검 전용, 파일 데이터는 절대 중계하지 않음) ===

/** p2p:signal data 최대 크기 (JSON 직렬화 기준, bytes) */
export const P2P_SIGNAL_MAX_BYTES = 16 * 1024;
/** 소켓당 버스트 허용량 / 초당 충전량 */
export const P2P_SIGNAL_BUCKET_CAPACITY = 40;
export const P2P_SIGNAL_REFILL_PER_SEC = 20;

const p2pBuckets = new WeakMap<object, TokenBucket>();

/**
 * p2p:signal 중계. 보낸 소켓과 대상 소켓이 같은 IP 룸일 때만 {from, data}를 대상에게 전달한다.
 * 조건 위반·과다 요청은 조용히 버린다 (앱 흐름에 영향 없음).
 */
export const handleP2pSignal = (socket: ExtendedSocket, io: Server, payload: unknown) => {
    try {
        if (!payload || typeof payload !== 'object') return;
        const { to, data } = payload as { to?: unknown; data?: unknown };
        if (typeof to !== 'string' || to.length === 0 || to.length > 64 || data === undefined) return;

        let bucket = p2pBuckets.get(socket);
        if (!bucket) {
            bucket = new TokenBucket(P2P_SIGNAL_BUCKET_CAPACITY, P2P_SIGNAL_REFILL_PER_SEC);
            p2pBuckets.set(socket, bucket);
        }
        if (!bucket.tryConsume()) return;

        const serialized = JSON.stringify(data);
        if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > P2P_SIGNAL_MAX_BYTES) return;

        const ipRoomId = socket.ipRoomId;
        if (!ipRoomId || to === socket.id) return;
        const target = io.sockets.sockets.get(to) as ExtendedSocket | undefined;
        // 전역 룸(room-shared) 대상은 금지: 같은 IP 룸에 실제로 속한 소켓에만 전달
        if (!target || target.ipRoomId !== ipRoomId || !target.rooms.has(ipRoomId)) return;

        target.emit('p2p:signal', { from: socket.id, data });
    } catch (error) {
        logger.error(`p2p:signal 처리 에러 [${socket.id}]:`, error);
    }
};

// === 정체성 / 보낸 사람 ===

/** 소켓이 속한 방들에서 겹치지 않는 정체성을 할당한다 */
const allocateIdentity = (
    roomManager: RoomManager,
    roomIds: string[],
    socketId: string,
    preferred: ReturnType<typeof sanitizeIdentity>,
    avoid?: DeviceInfo['identity']
) => {
    const used = collectUsed(roomIds.map((r) => roomManager.getRoomUsers(r)), socketId);
    return assignIdentity(used, preferred, { avoid });
};

/**
 * publish 메시지에 서버가 보낸 사람 정보를 붙인다. 클라이언트가 보낸 sender 필드는
 * 무조건 버리고 덮어쓴다(위조 방지). 객체가 아닌 메시지는 그대로 둔다.
 */
export const stampSender = (msg: unknown, device: DeviceInfo | undefined) => {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return msg;
    const { sender: _ignored, ...rest } = msg as Record<string, unknown>;
    return device ? { ...rest, sender: toSender(device) } : rest;
};

/** identity:reroll — 쿨다운 확인 후 새 조합을 할당하고 두 방에 목록을 다시 알린다 */
const handleIdentityReroll = (
    socket: ExtendedSocket,
    io: Server,
    roomManager: RoomManager,
    ack?: (res: RerollResponse) => void
) => {
    try {
        const rooms = [socket.globalRoomId, socket.ipRoomId].filter((r): r is string => !!r);
        if (rooms.length === 0) return;

        const now = Date.now();
        const last = socket.data.lastRerollAt ?? 0;
        if (now - last < REROLL_COOLDOWN_MS) {
            if (typeof ack === 'function') ack({ ok: false, error: 'cooldown', retryAfterMs: REROLL_COOLDOWN_MS - (now - last) });
            return;
        }

        const current = roomManager.getUser(rooms[0], socket.id)?.identity;
        const next = allocateIdentity(roomManager, rooms, socket.id, null, current);
        socket.data.lastRerollAt = now;
        socket.data.identity = next;
        for (const roomId of rooms) {
            const device = roomManager.getUser(roomId, socket.id);
            if (device) device.identity = next;
            io.to(roomId).emit('room-users', { roomId, devices: roomManager.getRoomUsers(roomId) });
        }
        socket.emit('identity', { identity: next });
        if (typeof ack === 'function') ack({ ok: true, identity: next });
    } catch (error) {
        logger.error(`identity:reroll 처리 에러 [${socket.id}]:`, error);
    }
};

// === 메인 핸들러 설정 ===

export const setupSocketHandlers = (io: Server, roomManager: RoomManager) => {
    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        handleConnection(socket, io, roomManager);

        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager));

        socket.on('publish', (msg: any, target: PublishTarget, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, roomManager, msg, target, ack)
        );

        // 이름표 다시 뽑기 (소켓당 3초 쿨다운)
        socket.on('identity:reroll', (ack?: (res: RerollResponse) => void) =>
            handleIdentityReroll(socket, io, roomManager, ack)
        );

        // 룸 토큰 재발급: 만료 전에 클라이언트가 요청한다. 연결 시 정해진 룸에 대해서만 발급하므로
        // 네트워크를 옮겨 재연결되면 이전 IP 룸 토큰은 더 이상 받을 수 없다.
        socket.on('room-tokens', (ack?: (payload: RoomTokensPayload) => void) => {
            if (typeof ack !== 'function') return;
            ack(buildRoomTokenPayload(socket));
        });

        // P2P 연결 사전 점검용 시그널링 중계 (구버전 클라이언트는 이 이벤트를 쓰지 않음)
        socket.on('p2p:signal', (payload: unknown) => handleP2pSignal(socket, io, payload));

        socket.on('error', (error) => {
            logger.error(`Socket 에러 [${socket.id}]:`, error);
        });
    });
};

// === 개별 이벤트 핸들러 ===

/** 새 연결 처리: 전체 공유 룸 + IP 격리 룸 양쪽에 입장 */
const handleConnection = (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    try {
        const handshakeAuth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
        // 복구된 연결은 처음 받은 힌트·정체성을 재사용한다
        const hints = socket.recovered && socket.data.hints ? socket.data.hints : sanitizeHints(handshakeAuth.hints);
        const preferred = socket.recovered && socket.data.identity ? socket.data.identity : sanitizeIdentity(handshakeAuth.identity);
        const deviceInfo = parseDeviceInfo(socket.handshake.headers['user-agent'], socket.id, hints);
        socket.data.hints = hints;

        // connectionStateRecovery로 복구된 연결
        if (socket.recovered && socket.data.globalRoomId && socket.data.ipRoomId) {
            const recoveredGlobalRoomId = socket.data.globalRoomId;
            const recoveredIpRoomId = socket.data.ipRoomId;
            socket.globalRoomId = recoveredGlobalRoomId;
            socket.ipRoomId = recoveredIpRoomId;
            deviceInfo.identity = allocateIdentity(roomManager, [recoveredGlobalRoomId, recoveredIpRoomId], socket.id, preferred);
            socket.data.identity = deviceInfo.identity;
            roomManager.addUserToRoom(recoveredGlobalRoomId, socket.id, deviceInfo);
            roomManager.addUserToRoom(recoveredIpRoomId, socket.id, deviceInfo);
            io.to(recoveredIpRoomId).emit('room-users', { roomId: recoveredIpRoomId, devices: roomManager.getRoomUsers(recoveredIpRoomId) });
            io.to(recoveredGlobalRoomId).emit('room-users', { roomId: recoveredGlobalRoomId, devices: roomManager.getRoomUsers(recoveredGlobalRoomId) });
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
        deviceInfo.identity = allocateIdentity(roomManager, [globalRoomId, ipRoomId], socket.id, preferred);
        socket.data.identity = deviceInfo.identity;
        roomManager.addUserToRoom(globalRoomId, socket.id, deviceInfo);
        roomManager.addUserToRoom(ipRoomId, socket.id, deviceInfo);

        socket.emit('registered', { globalRoomId, ipRoomId, identity: deviceInfo.identity, ...buildRoomTokenPayload(socket) });
        io.to(ipRoomId).emit('room-users', { roomId: ipRoomId, devices: roomManager.getRoomUsers(ipRoomId) });
        io.to(globalRoomId).emit('room-users', { roomId: globalRoomId, devices: roomManager.getRoomUsers(globalRoomId) });

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
            io.to(roomId).emit('room-users', { roomId, devices: roomManager.getRoomUsers(roomId) });

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
    roomManager: RoomManager,
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

        io.to(targetRoomId).emit('message', stampSender(msg, roomManager.getUser(targetRoomId, socket.id)));

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
