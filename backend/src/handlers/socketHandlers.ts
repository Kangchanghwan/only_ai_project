import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget, RoomTokensPayload, RerollResponse } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { parseDeviceInfo, sanitizeHints, DeviceInfo } from '../utils/deviceInfo';
import { assignIdentity, collectUsed, sanitizeIdentity, REROLL_COOLDOWN_MS } from '../utils/identity';
import { toSender } from '../utils/uploaderStore';
import { issueRoomTokens, getRoomTokenTtlSec } from '../utils/roomToken';
import { PairSessionManager, PairSession } from '../managers/PairSessionManager';
import { newPrivateRoomId, isPrivateRoomId } from '../utils/privateRoom';
import { issueTicket, verifyTicket } from '../utils/privateTicket';
import { TokenBucket } from '../utils/tokenBucket';
import { TextQueue, QueuedText, getTextQueue, toPublicText } from '../utils/textQueue';
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

/** 소켓이 들어가 있는 1:1 비공개 방 ID 목록 */
const getPrivateRooms = (socket: ExtendedSocket): string[] => socket.data.privateRooms ?? [];

/** 소켓이 속한 룸들(전체 + IP + 1:1 비공개)의 REST API용 룸 토큰 묶음 */
const buildRoomTokenPayload = (socket: ExtendedSocket): RoomTokensPayload => ({
    roomTokens: issueRoomTokens([socket.globalRoomId, socket.ipRoomId, ...getPrivateRooms(socket)]),
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

// === 1:1 연결 (비공개 방) ===

/** pair:signal data 최대 크기 (JSON 직렬화 기준, bytes) */
export const PAIR_SIGNAL_MAX_BYTES = 4 * 1024;
/** pair:* 이벤트 소켓당 토큰 버킷: 용량 / 초당 충전 */
export const PAIR_BUCKET_CAPACITY = 20;
export const PAIR_BUCKET_REFILL_PER_SEC = 5;
/** 만료 점검 주기 */
const PAIR_SWEEP_INTERVAL_MS = 1000;
/** pair:invite pk 최대 길이(문자) */
export const PAIR_PK_MAX_CHARS = 200;
/** 소켓당 비공개 방 최대 개수 / private:join 한 번에 받는 입장권 수 */
export const MAX_PRIVATE_ROOMS_PER_SOCKET = 10;
export const MAX_TICKETS_PER_JOIN = 10;

type Ack = ((res: Record<string, unknown>) => void) | undefined;

const pairBuckets = new WeakMap<object, TokenBucket>();

/** 토큰 버킷 확인. 초과면 ack로 RATE_LIMITED를 돌려주고 false */
const pairAllowed = (socket: ExtendedSocket, ack: Ack): boolean => {
    let bucket = pairBuckets.get(socket);
    if (!bucket) {
        bucket = new TokenBucket(PAIR_BUCKET_CAPACITY, PAIR_BUCKET_REFILL_PER_SEC);
        pairBuckets.set(socket, bucket);
    }
    if (bucket.tryConsume()) return true;
    if (typeof ack === 'function') ack({ ok: false, code: 'RATE_LIMITED' });
    return false;
};

const reply = (ack: Ack, res: Record<string, unknown>) => {
    if (typeof ack === 'function') ack(res);
};

const otherOf = (s: PairSession, socketId: string) => (s.initiator === socketId ? s.responder : s.initiator);

const endSession = (io: Server, s: PairSession, reason: string, targets: string[]) => {
    for (const id of targets) io.to(id).emit('pair:ended', { sessionId: s.id, reason });
};

const broadcastUsers = (io: Server, roomManager: RoomManager, roomId: string) => {
    io.to(roomId).emit('room-users', { roomId, devices: roomManager.getRoomUsers(roomId) });
};

/** 둘 다 확인된 세션의 비공개 방 생성. 멤버가 사라졌으면 세션을 끝내고 false */
const createPairRoom = (io: Server, roomManager: RoomManager, s: PairSession): boolean => {
    const members = [s.initiator, s.responder]
        .map((id) => ({ id, sock: io.sockets.sockets.get(id) as ExtendedSocket | undefined, info: roomManager.getUser(SHARED_ROOM_ID, id) }));
    if (members.some((m) => !m.sock || !m.info)) {
        endSession(io, s, 'peer-left', members.filter((m) => m.sock).map((m) => m.id));
        return false;
    }
    const roomId = newPrivateRoomId();
    for (const m of members) {
        m.sock!.join(roomId);
        roomManager.addUserToRoom(roomId, m.id, m.info!);
        m.sock!.data.privateRooms = [...getPrivateRooms(m.sock!), roomId];
    }
    const tokens = issueRoomTokens([roomId]);
    const ttl = getRoomTokenTtlSec();
    for (const m of members) {
        const peer = members.find((o) => o.id !== m.id)!.info;
        m.sock!.emit('pair:done', { sessionId: s.id, roomId, peer, roomToken: tokens[roomId], roomTokenTtlSec: ttl, ticket: issueTicket(roomId) });
    }
    broadcastUsers(io, roomManager, roomId);
    logger.log(`1:1 방 생성 ${roomId} [${s.initiator} + ${s.responder}]`);
    return true;
};

const setupPairHandlers = (socket: ExtendedSocket, io: Server, roomManager: RoomManager, pairs: PairSessionManager) => {
    socket.on('pair:invite', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const ip = (payload && typeof payload === 'object' ? payload : {}) as { to?: unknown; pk?: unknown };
            const to = ip.to;
            if (typeof to !== 'string' || to.length === 0 || to.length > 64) return reply(ack, { ok: false, code: 'TARGET_NOT_FOUND' });
            const pk = ip.pk;
            if (pk !== undefined && (typeof pk !== 'string' || pk.length > PAIR_PK_MAX_CHARS)) return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });

            const target = io.sockets.sockets.get(to) as ExtendedSocket | undefined;
            const targetConnected = !!target && !!roomManager.getUser(SHARED_ROOM_ID, to);
            const mine = new Set(getPrivateRooms(socket));
            const alreadyPaired = !!target && getPrivateRooms(target).some((r) => mine.has(r));

            const result = pairs.invite(socket.id, to, { targetConnected, alreadyPaired });
            if (!result.ok) return reply(ack, { ok: false, code: result.code });

            const { session } = result;
            const from = roomManager.getUser(SHARED_ROOM_ID, socket.id);
            target!.emit('pair:incoming', {
                sessionId: session.id,
                from,
                sameNetwork: !!socket.ipRoomId && socket.ipRoomId === target!.ipRoomId,
                expiresAt: session.expiresAt,
                ...(pk !== undefined ? { pk } : {}),
            });
            reply(ack, { ok: true, sessionId: session.id, expiresAt: session.expiresAt });
        } catch (error) {
            logger.error(`pair:invite 처리 에러 [${socket.id}]:`, error);
        }
    });

    socket.on('pair:respond', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const p = (payload && typeof payload === 'object' ? payload : {}) as { sessionId?: unknown; accept?: unknown; block?: unknown; same?: unknown };
            if (typeof p.sessionId !== 'string' || typeof p.accept !== 'boolean') return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });
            if (p.same !== undefined && typeof p.same !== 'boolean') return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });

            const s = pairs.respond(p.sessionId, socket.id, p.accept, p.block === true);
            if (!s) return reply(ack, { ok: false, code: 'SESSION_NOT_FOUND' });

            if (!p.accept) {
                endSession(io, s, 'declined', [s.initiator]);
                return reply(ack, { ok: true });
            }
            io.to(s.initiator).emit('pair:accepted', { sessionId: s.id, role: 'initiator', peer: roomManager.getUser(SHARED_ROOM_ID, s.responder) });
            io.to(s.responder).emit('pair:accepted', { sessionId: s.id, role: 'responder', peer: roomManager.getUser(SHARED_ROOM_ID, s.initiator) });
            // 수락 + 확인을 한 번에 (같아요). 요청자가 이미 확인했다면 여기서 방이 만들어진다
            if (p.same === true || s.confirms.get(socket.id) === true) {
                const r = pairs.confirm(s.id, socket.id, true);
                if (r.status === 'done') return reply(ack, createPairRoom(io, roomManager, r.session) ? { ok: true } : { ok: false, code: 'SESSION_NOT_FOUND' });
            }
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`pair:respond 처리 에러 [${socket.id}]:`, error);
        }
    });

    // 키 교환 중계: 수락된 세션의 두 멤버 사이에서만. 조건 위반은 조용히 버린다
    socket.on('pair:signal', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            if (!payload || typeof payload !== 'object') return;
            const { sessionId, data } = payload as { sessionId?: unknown; data?: unknown };
            if (typeof sessionId !== 'string' || data === undefined || data === null || typeof data !== 'object') return;
            const s = pairs.getForMember(sessionId, socket.id);
            if (!s || (s.state !== 'accepted' && s.state !== 'invited')) return;
            const serialized = JSON.stringify(data);
            if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > PAIR_SIGNAL_MAX_BYTES) return;
            io.to(otherOf(s, socket.id)).emit('pair:signal', { sessionId, data });
        } catch (error) {
            logger.error(`pair:signal 처리 에러 [${socket.id}]:`, error);
        }
    });

    socket.on('pair:confirm', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const p = (payload && typeof payload === 'object' ? payload : {}) as { sessionId?: unknown; same?: unknown };
            if (typeof p.sessionId !== 'string' || typeof p.same !== 'boolean') return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });

            const r = pairs.confirm(p.sessionId, socket.id, p.same);
            if (r.status === 'invalid') return reply(ack, { ok: false, code: 'SESSION_NOT_FOUND' });
            if (r.status === 'mismatch') {
                endSession(io, r.session, 'mismatch', [r.session.initiator, r.session.responder]);
                return reply(ack, { ok: true });
            }
            if (r.status === 'waiting') return reply(ack, { ok: true });

            // 둘 다 같음 → 방 생성, 두 소켓 입장
            reply(ack, createPairRoom(io, roomManager, r.session) ? { ok: true } : { ok: false, code: 'SESSION_NOT_FOUND' });
        } catch (error) {
            logger.error(`pair:confirm 처리 에러 [${socket.id}]:`, error);
        }
    });

    socket.on('pair:cancel', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const sessionId = payload && typeof payload === 'object' ? (payload as { sessionId?: unknown }).sessionId : undefined;
            if (typeof sessionId !== 'string') return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });
            const s = pairs.cancel(sessionId, socket.id);
            if (!s) return reply(ack, { ok: false, code: 'SESSION_NOT_FOUND' });
            endSession(io, s, 'cancelled', [otherOf(s, socket.id)]);
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`pair:cancel 처리 에러 [${socket.id}]:`, error);
        }
    });

    // 입장권으로 비공개 방 재입장 (새로고침/재접속 후). 무효 입장권은 invalid로 돌려준다
    socket.on('private:join', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const tickets = payload && typeof payload === 'object' ? (payload as { tickets?: unknown }).tickets : undefined;
            if (!Array.isArray(tickets) || tickets.length > MAX_TICKETS_PER_JOIN) return reply(ack, { ok: false, code: 'INVALID_PAYLOAD' });

            const info = roomManager.getUser(SHARED_ROOM_ID, socket.id);
            const rooms: Array<Record<string, unknown>> = [];
            const invalid: unknown[] = [];
            const seen = new Set<string>();
            for (const t of tickets) {
                const v = verifyTicket(t);
                if (!v.ok || !info) { invalid.push(t); continue; }
                if (seen.has(v.roomId)) continue;
                const current = getPrivateRooms(socket);
                if (!current.includes(v.roomId) && current.length >= MAX_PRIVATE_ROOMS_PER_SOCKET) { invalid.push(t); continue; }
                seen.add(v.roomId);
                socket.join(v.roomId);
                roomManager.addUserToRoom(v.roomId, socket.id, info);
                if (!current.includes(v.roomId)) socket.data.privateRooms = [...current, v.roomId];
                broadcastUsers(io, roomManager, v.roomId);
                rooms.push({
                    roomId: v.roomId,
                    ticket: issueTicket(v.roomId),
                    roomToken: issueRoomTokens([v.roomId])[v.roomId],
                    roomTokenTtlSec: getRoomTokenTtlSec(),
                    devices: roomManager.getRoomUsers(v.roomId),
                });
            }
            reply(ack, { ok: true, rooms, invalid });
        } catch (error) {
            logger.error(`private:join 처리 에러 [${socket.id}]:`, error);
        }
    });

    socket.on('private:leave', async (payload: unknown, ack?: Ack) => {
        try {
            const roomId = payload && typeof payload === 'object' ? (payload as { roomId?: unknown }).roomId : undefined;
            if (!isPrivateRoomId(roomId) || !getPrivateRooms(socket).includes(roomId)) return reply(ack, { ok: false, code: 'NOT_MEMBER' });
            socket.data.privateRooms = getPrivateRooms(socket).filter((r) => r !== roomId);
            socket.leave(roomId);
            await roomManager.removeUserFromRoom(roomId, socket.id);
            broadcastUsers(io, roomManager, roomId);
            io.to(roomId).emit('message', { type: 'private-left', roomId });
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`private:leave 처리 에러 [${socket.id}]:`, error);
        }
    });
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

export const setupSocketHandlers = (io: Server, roomManager: RoomManager, textQueue: TextQueue = getTextQueue()) => {
    const pairs = new PairSessionManager();
    // 보관 텍스트 10분 만료 주기 정리 (목록 조회 때도 만료분을 거른다)
    textQueue.startSweeper();
    // 만료된 연결 세션 정리 (요청 60초 미응답, 수락 후 확인 2분)
    const sweeper = setInterval(() => {
        for (const s of pairs.expireDue()) endSession(io, s, 'expired', [s.initiator, s.responder]);
    }, PAIR_SWEEP_INTERVAL_MS);
    sweeper.unref();

    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        handleConnection(socket, io, roomManager);

        socket.on('disconnect', () => handleDisconnect(socket, io, roomManager, pairs));

        setupPairHandlers(socket, io, roomManager, pairs);

        socket.on('publish', (msg: any, target: PublishTarget, ack?: (error: Error | null, response?: PublishResponse) => void) =>
            handlePublish(socket, io, roomManager, textQueue, msg, target, ack)
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
            // 1:1 비공개 방 복구 (adapter가 소켓 룸은 복원, 서버 메모리 멤버십만 다시 채운다)
            for (const roomId of getPrivateRooms(socket)) {
                roomManager.addUserToRoom(roomId, socket.id, deviceInfo);
                broadcastUsers(io, roomManager, roomId);
            }
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
const handleDisconnect = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager, pairs: PairSessionManager) => {
    // 진행 중인 연결 세션 정리: 상대에게 peer-left
    for (const s of pairs.removeBySocket(socket.id)) endSession(io, s, 'peer-left', [otherOf(s, socket.id)]);

    // 비공개 방은 연결 복구를 위해 socket.data.privateRooms를 지우지 않는다 (서버 메모리 멤버십만 제거)
    for (const roomId of getPrivateRooms(socket)) {
        try {
            await roomManager.removeUserFromRoom(roomId, socket.id);
            broadcastUsers(io, roomManager, roomId);
        } catch (error) {
            logger.error(`퇴장 처리 에러 [${socket.id}] @ ${roomId}:`, error);
        }
    }

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

/**
 * text-shared 메시지를 방에 중계할 형태로 바꾼다.
 * - 보관했으면 보관 항목 그대로(잠긴 텍스트는 암호문 없이 salt만, 만료 시각 포함)
 * - 보관하지 않았으면 원래 메시지에서 잠금 확인값(vh)·삭제 키 해시(dh)만 뺀다
 */
export const relayTextShared = (stamped: unknown, queued: QueuedText | null): unknown => {
    if (queued) return toPublicText(queued);
    if (!stamped || typeof stamped !== 'object') return stamped;
    const m = stamped as Record<string, unknown>;
    if (!m.lock || typeof m.lock !== 'object') return stamped;
    const salt = (m.lock as { salt?: unknown }).salt;
    return { ...m, lock: typeof salt === 'string' ? { salt } : {} };
};

// === publish 속도 제한 (소켓당) ===

/**
 * text-shared: 연속 10개까지 바로 보내고, 그 뒤로는 3초에 1개(분당 20개)씩 충전.
 * 사람이 몇 개를 연달아 붙여넣는 것은 막히지 않고, 스크립트로 대기열을 밀어내는 것은 느려진다.
 */
export const TEXT_PUBLISH_BUCKET_CAPACITY = 10;
export const TEXT_PUBLISH_REFILL_PER_SEC = 1 / 3;
/**
 * 그 밖의 publish(파일 업로드·삭제 알림 등): 파일 수십 개를 한 번에 올리거나 지울 때 파일마다 하나씩 나가므로 넉넉히.
 */
export const PUBLISH_BUCKET_CAPACITY = 300;
export const PUBLISH_REFILL_PER_SEC = 50;

const textBuckets = new WeakMap<object, TokenBucket>();
const publishBuckets = new WeakMap<object, TokenBucket>();

const takeToken = (map: WeakMap<object, TokenBucket>, socket: object, capacity: number, refill: number): boolean => {
    let bucket = map.get(socket);
    if (!bucket) {
        bucket = new TokenBucket(capacity, refill);
        map.set(socket, bucket);
    }
    return bucket.tryConsume();
};

/** 메시지 발행 처리: target이 소켓이 속한 방인지 검증 후 해당 방에만 브로드캐스트 */
const handlePublish = (
    socket: ExtendedSocket,
    io: Server,
    roomManager: RoomManager,
    textQueue: TextQueue,
    msg: any,
    target: PublishTarget,
    ack?: (error: Error | null, response?: PublishResponse) => void
) => {
    const targetRoomId =
        target === 'global' ? socket.globalRoomId :
        target === 'ip' ? socket.ipRoomId :
        isPrivateRoomId(target) && getPrivateRooms(socket).includes(target) ? target :
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

        const isText = typeof msg === 'object' && msg.type === 'text-shared';
        const allowed = isText
            ? takeToken(textBuckets, socket, TEXT_PUBLISH_BUCKET_CAPACITY, TEXT_PUBLISH_REFILL_PER_SEC)
            : takeToken(publishBuckets, socket, PUBLISH_BUCKET_CAPACITY, PUBLISH_REFILL_PER_SEC);
        if (!allowed) {
            // 중계도 보관도 하지 않는다. 보낸 쪽만 안다
            if (ack) ack(null, { success: false, code: 'RATE_LIMITED' });
            else socket.emit('error', createError('너무 빠르게 보내고 있습니다', 'RATE_LIMITED'));
            return;
        }

        const device = roomManager.getUser(targetRoomId, socket.id);
        let outgoing = stampSender(msg, device);
        let response: PublishResponse = { success: true };
        if (isText) {
            // 1:1 방은 암호문, 공개 범위는 잠금 여부에 따라 평문 또는 암호문으로 보관한다
            const owner = { sid: socket.id, net: socket.ipRoomId ?? socket.id };
            const r = textQueue.offer(msg, targetRoomId, device ? toSender(device) : undefined, owner);
            outgoing = relayTextShared(outgoing, r.stored ? r.entry : null);
            if (r.stored) {
                response = { success: true, expiresAt: r.entry.expiresAt, ...(r.evictedOwn.length ? { evicted: r.evictedOwn } : {}) };
            } else if (r.reason === 'TOO_LARGE' || r.reason === 'FULL') {
                response = { success: true, notStored: r.reason };
            }
        }

        io.to(targetRoomId).emit('message', outgoing);

        if (ack) ack(null, response);

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
