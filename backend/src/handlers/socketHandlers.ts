import { Server } from 'socket.io';
import { ExtendedSocket, ErrorResponse, PublishResponse, PublishTarget, RoomTokensPayload, RerollResponse } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { parseDeviceInfo, sanitizeHints, DeviceInfo } from '../utils/deviceInfo';
import { assignIdentity, collectUsed, sanitizeIdentity, REROLL_COOLDOWN_MS } from '../utils/identity';
import { toSender } from '../utils/uploaderStore';
import { issueRoomTokens, getRoomTokenTtlSec } from '../utils/roomToken';
import { PairSessionManager, PairSession } from '../managers/PairSessionManager';
import { newGroupRoomId, isPrivateRoomId, isGroupRoomId } from '../utils/privateRoom';
import { issueTicket, verifyTicket, getPrivateInviteTtlSec } from '../utils/privateTicket';
import { TokenBucket } from '../utils/tokenBucket';
import { TextQueue, QueuedText, getTextQueue, toPublicText } from '../utils/textQueue';
import { getPushNotifier } from '../services/pushNotifier';
import { isValidPid } from '../services/pushStore';
import { setupCodeHandlers } from './codeHandlers';
import { buildSnapshot, bumpRev, dropRev, getRosterFullMax, parseFindQuery, findDevice, allowFind } from '../utils/roster';
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

// === 클라이언트 인스턴스 ID (페이지 로드마다 새로 만든 값, 탭끼리 공유 안 함) ===

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** clientId → 현재 소켓 ID. 같은 기기의 유령 소켓을 정리하는 데 쓴다 */
const clientSockets = new Map<string, string>();

/** 형식이 맞는 clientId만 돌려준다 (없거나 틀리면 undefined = 구버전 동작) */
export const parseClientId = (value: unknown): string | undefined =>
    typeof value === 'string' && CLIENT_ID_PATTERN.test(value) ? value : undefined;

/** 브라우저(localStorage)별 기기 ID. 서버는 다른 사람에게 보내지 않고, 같은 브라우저의 탭끼리 이름을 공유하는 데만 쓴다 */
export const parseDeviceId = parseClientId;

/** 같은 deviceId를 가진 자기 외 소켓 ID 집합 (같은 브라우저의 다른 탭) */
export const siblingSocketIds = (io: Server, deviceId: string | undefined, selfSocketId: string): Set<string> => {
    const ids = new Set<string>([selfSocketId]);
    if (!deviceId) return ids;
    for (const [id, s] of io.sockets.sockets) {
        if (id !== selfSocketId && (s.data as { deviceId?: string } | undefined)?.deviceId === deviceId) ids.add(id);
    }
    return ids;
};

const short = (v: string | undefined): string => (v ? v.slice(0, 6) : '-');
const shortRoom = (v: string | undefined): string => (v ? v.slice(0, 8) : '-');

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
/** 그룹 방 동시 접속 기기 상한 기본값 (env PRIVATE_GROUP_MAX_MEMBERS 로 조정) */
export const DEFAULT_GROUP_MAX_MEMBERS = 10;

const getGroupMaxMembers = (): number => {
    const parsed = parseInt(process.env.PRIVATE_GROUP_MAX_MEMBERS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GROUP_MAX_MEMBERS;
};

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

// === 명단 증분 전송 (ip 방·전체 공유 방) ===

/** auth.roster === 2 로 접속한 소켓 (그 밖은 legacy: 전체 명단을 그대로 받는다) */
const legacySockets = new Set<string>();

const roomSocketIds = (io: Server, roomId: string): string[] => [...(io.sockets.adapter.rooms.get(roomId) ?? [])];

const emitFull = (io: Server, roomManager: RoomManager, roomId: string, id: string) => {
    io.to(id).emit('room-users', buildSnapshot(roomId, roomManager.getRoomUsers(roomId), id));
};

/** 방 소켓을 legacy / v2(본인 제외)로 나눈다. 같은 메시지는 묶어서 한 번만 직렬화한다 */
const splitTargets = (io: Server, roomId: string, exceptId?: string) => {
    const legacy: string[] = [];
    const v2: string[] = [];
    for (const id of roomSocketIds(io, roomId)) {
        if (legacySockets.has(id)) legacy.push(id);
        else if (id !== exceptId) v2.push(id);
    }
    return { legacy, v2 };
};
const emitLegacyFull = (io: Server, roomManager: RoomManager, roomId: string, ids: string[]) => {
    if (ids.length) io.to(ids).emit('room-users', { roomId, devices: roomManager.getRoomUsers(roomId) });
};
/** 전체 공유 방이 기준 인원을 넘었는지 (delta에 실어 클라이언트가 잘린 모드로 바꾸게 한다) */
const isTruncated = (roomId: string, total: number) => roomId === SHARED_ROOM_ID && total > getRosterFullMax();

/** 기기가 들어왔다 (신규·복구): 본인에게 스냅샷, 다른 v2에 add, legacy에 전체 */
const rosterJoined = (io: Server, roomManager: RoomManager, roomId: string, joinerId: string) => {
    const rev = bumpRev(roomId);
    const total = roomManager.getRoomUserCount(roomId);
    const device = roomManager.getUser(roomId, joinerId);
    const { legacy, v2 } = splitTargets(io, roomId, joinerId);
    if (!legacySockets.has(joinerId)) emitFull(io, roomManager, roomId, joinerId);
    else legacy.push(joinerId);
    if (v2.length) io.to(v2).emit('room-delta', { roomId, rev, total, truncated: isTruncated(roomId, total), op: 'add', device });
    emitLegacyFull(io, roomManager, roomId, legacy);
};

/** 기기가 나갔다 (이미 방 명단에서 뺀 뒤 호출) */
const rosterLeft = (io: Server, roomManager: RoomManager, roomId: string, socketId: string) => {
    const rev = bumpRev(roomId);
    const total = roomManager.getRoomUserCount(roomId);
    // 기준 인원 바로 위에서 기준으로 내려왔다: 최근 기기만 가진 v2에게 각자 전체 스냅샷
    const crossed = roomId === SHARED_ROOM_ID && total === getRosterFullMax();
    const { legacy, v2 } = splitTargets(io, roomId, socketId);
    if (crossed) for (const id of v2) emitFull(io, roomManager, roomId, id);
    else if (v2.length) io.to(v2).emit('room-delta', { roomId, rev, total, truncated: isTruncated(roomId, total), op: 'remove', socketId });
    emitLegacyFull(io, roomManager, roomId, legacy);
    if (total === 0) dropRev(roomId);
};

/** 이름이 바뀌었다 */
const rosterUpdated = (io: Server, roomManager: RoomManager, roomId: string, socketId: string) => {
    const rev = bumpRev(roomId);
    const total = roomManager.getRoomUserCount(roomId);
    const device = roomManager.getUser(roomId, socketId);
    const { legacy, v2 } = splitTargets(io, roomId);
    if (v2.length) io.to(v2).emit('room-delta', { roomId, rev, total, truncated: isTruncated(roomId, total), op: 'update', device });
    emitLegacyFull(io, roomManager, roomId, legacy);
};

/** room-snapshot / devices:find 이벤트 등록 */
const setupRosterHandlers = (socket: ExtendedSocket, roomManager: RoomManager) => {
    const finds: number[] = [];
    socket.on('room-snapshot', (payload: unknown, ack?: Ack) => {
        const roomId = (payload as { roomId?: unknown } | null)?.roomId;
        if (typeof ack !== 'function') return;
        if (typeof roomId !== 'string' || (roomId !== socket.globalRoomId && roomId !== socket.ipRoomId)) {
            ack({ ok: false });
            return;
        }
        ack({ ok: true, snapshot: buildSnapshot(roomId, roomManager.getRoomUsers(roomId), socket.id) });
    });
    socket.on('devices:find', (payload: unknown, ack?: Ack) => {
        if (typeof ack !== 'function') return;
        const q = parseFindQuery(payload);
        if (!q) { ack({ ok: false, code: 'INVALID' }); return; }
        if (!allowFind(finds)) { ack({ ok: false, code: 'RATE_LIMITED' }); return; }
        const device = findDevice(roomManager.getRoomUsers(SHARED_ROOM_ID), q, socket.id);
        ack(device ? { ok: true, device } : { ok: false, code: 'NOT_FOUND' });
    });
};

/** 둘 다 확인된 세션의 비공개 방 생성. 멤버가 사라졌으면 세션을 끝내고 false */
const createPairRoom = (io: Server, roomManager: RoomManager, s: PairSession): boolean => {
    const members = [s.initiator, s.responder]
        .map((id) => ({ id, sock: io.sockets.sockets.get(id) as ExtendedSocket | undefined, info: roomManager.getUser(SHARED_ROOM_ID, id) }));
    if (members.some((m) => !m.sock || !m.info)) {
        endSession(io, s, 'peer-left', members.filter((m) => m.sock).map((m) => m.id));
        return false;
    }
    const roomId = newGroupRoomId();
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
    logger.log(`방 생성(연결) ${roomId} [${s.initiator} + ${s.responder}]`);
    return true;
};

/** 소켓을 비공개 방(1:1·그룹 공통)에 넣고 서버 메모리 멤버십·소켓 룸·room-users를 갱신한다 */
const enterPrivateRoom = (socket: ExtendedSocket, io: Server, roomManager: RoomManager, roomId: string, info: DeviceInfo) => {
    const current = getPrivateRooms(socket);
    socket.join(roomId);
    roomManager.addUserToRoom(roomId, socket.id, info);
    if (!current.includes(roomId)) socket.data.privateRooms = [...current, roomId];
    broadcastUsers(io, roomManager, roomId);
    return {
        roomId,
        ticket: issueTicket(roomId),
        roomToken: issueRoomTokens([roomId])[roomId],
        roomTokenTtlSec: getRoomTokenTtlSec(),
        devices: roomManager.getRoomUsers(roomId),
    };
};

/** 그림 코드로 승인된 소켓을 그룹 방에 바로 넣는다. 정원·방 수 제한에 걸리면 null (클라이언트가 private:join으로 이어 간다) */
const admitToGroupRoom = (joiner: ExtendedSocket, io: Server, roomManager: RoomManager, roomId: string): Record<string, unknown> | null => {
    const info = roomManager.getUser(SHARED_ROOM_ID, joiner.id);
    if (!info || !isGroupRoomId(roomId)) return null;
    const current = getPrivateRooms(joiner);
    if (!current.includes(roomId)) {
        if (current.length >= MAX_PRIVATE_ROOMS_PER_SOCKET) return null;
        if (roomManager.getRoomUserCount(roomId) >= getGroupMaxMembers()) return null;
    }
    return enterPrivateRoom(joiner, io, roomManager, roomId, info);
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
            // 예전 1:1 방(prv-)은 같이 쓰면 막는다. 새 방(prv-g-)은 접속 중인 멤버가 정확히 두 기기뿐일 때만 막는다
            const mine = new Set(getPrivateRooms(socket));
            const alreadyPaired = !!target && getPrivateRooms(target).some((r) => mine.has(r)
                && (!isGroupRoomId(r) || roomManager.getRoomUserCount(r) === 2));

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
            const full: string[] = [];
            const seen = new Set<string>();
            for (const t of tickets) {
                const v = verifyTicket(t);
                if (!v.ok || !info) { invalid.push(t); continue; }
                if (seen.has(v.roomId)) continue;
                const current = getPrivateRooms(socket);
                if (!current.includes(v.roomId) && current.length >= MAX_PRIVATE_ROOMS_PER_SOCKET) { invalid.push(t); continue; }
                seen.add(v.roomId);
                // 그룹 방 상한: 이미 멤버인 소켓(재접속 복구 등)은 막지 않는다. 가득 찬 방은 invalid가 아니라 full로 알린다
                if (isGroupRoomId(v.roomId) && !current.includes(v.roomId) && roomManager.getRoomUserCount(v.roomId) >= getGroupMaxMembers()) {
                    full.push(v.roomId);
                    continue;
                }
                rooms.push(enterPrivateRoom(socket, io, roomManager, v.roomId, info));
            }
            reply(ack, { ok: true, rooms, invalid, full });
        } catch (error) {
            logger.error(`private:join 처리 에러 [${socket.id}]:`, error);
        }
    });

    // 그룹 방 만들기: 방 ID는 서버가 만들고 만든 소켓이 첫 멤버가 된다
    socket.on('private:create', (payloadOrAck?: unknown, maybeAck?: Ack) => {
        const ack: Ack = typeof payloadOrAck === 'function' ? (payloadOrAck as Ack) : maybeAck;
        try {
            if (!pairAllowed(socket, ack)) return;
            const info = roomManager.getUser(SHARED_ROOM_ID, socket.id);
            if (!info) return reply(ack, { ok: false, error: 'NOT_REGISTERED' });
            if (getPrivateRooms(socket).length >= MAX_PRIVATE_ROOMS_PER_SOCKET) return reply(ack, { ok: false, error: 'TOO_MANY_ROOMS' });
            const room = enterPrivateRoom(socket, io, roomManager, newGroupRoomId(), info);
            logger.log(`그룹 방 생성 ${room.roomId} [${socket.id}]`);
            reply(ack, { ok: true, ...room });
        } catch (error) {
            logger.error(`private:create 처리 에러 [${socket.id}]:`, error);
        }
    });

    // 초대 입장권 발급: 그룹 방의 멤버만 (짧은 만료). 입장권 값은 로그에 남기지 않는다
    socket.on('private:invite', (payload: unknown, ack?: Ack) => {
        try {
            if (!pairAllowed(socket, ack)) return;
            const roomId = payload && typeof payload === 'object' ? (payload as { roomId?: unknown }).roomId : undefined;
            if (!isGroupRoomId(roomId) || !getPrivateRooms(socket).includes(roomId)) return reply(ack, { ok: false, error: 'NOT_ALLOWED' });
            const ttl = getPrivateInviteTtlSec();
            const nowSec = Math.floor(Date.now() / 1000);
            reply(ack, { ok: true, ticket: issueTicket(roomId, nowSec, ttl), expiresAt: (nowSec + ttl) * 1000 });
        } catch (error) {
            logger.error(`private:invite 처리 에러 [${socket.id}]:`, error);
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
    socketId: string | ReadonlySet<string>,
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
        const next = allocateIdentity(roomManager, rooms, siblingSocketIds(io, socket.data.deviceId, socket.id), null, current);
        socket.data.lastRerollAt = now;
        socket.data.identity = next;
        for (const roomId of rooms) {
            const device = roomManager.getUser(roomId, socket.id);
            if (device) device.identity = next;
            rosterUpdated(io, roomManager, roomId, socket.id);
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
    // 도착 알림: 접속 중인 기기(pid)를 푸시 대상에서 빼기 위해 소켓 목록을 본다
    getPushNotifier().attachIo(io);
    // 만료된 연결 세션 정리 (요청 60초 미응답, 수락 후 확인 2분)
    const sweeper = setInterval(() => {
        for (const s of pairs.expireDue()) endSession(io, s, 'expired', [s.initiator, s.responder]);
    }, PAIR_SWEEP_INTERVAL_MS);
    sweeper.unref();

    io.on('connection', (socket: ExtendedSocket) => {
        logger.log(`새 연결: ${socket.id}`);

        const connectedAt = Date.now();
        const clientId = parseClientId((socket.handshake.auth as Record<string, unknown> | undefined)?.clientId);
        if (clientId) {
            const oldId = clientSockets.get(clientId);
            if (oldId && oldId !== socket.id) {
                const old = io.sockets.sockets.get(oldId);
                if (old) {
                    logger.info(`[conn] replaced ${short(oldId)} -> ${short(socket.id)} client=${short(clientId)}`);
                    // 옛 소켓의 정상 disconnect 처리가 자기 항목만 지우고 room-users를 알린다
                    old.disconnect(true);
                }
            }
            clientSockets.set(clientId, socket.id);
        }
        logger.info(
            `[conn] connect ${socket.recovered ? 'recovered' : 'fresh'} transport=${socket.conn?.transport?.name ?? '-'} sid=${short(socket.id)} client=${short(clientId)}`
        );

        if ((socket.handshake.auth as Record<string, unknown> | undefined)?.roster !== 2) legacySockets.add(socket.id);
        // 복구된 연결은 유예 중이던 퇴장을 취소하고, 새 소켓으로 붙은 같은 기기는 옛 항목을 먼저 정리한다
        if (socket.recovered) cancelAway(socket.id);
        if (clientId && awayByClient.has(clientId)) {
            void flushAwayForClient(clientId).then(() => { if (socket.connected) handleConnection(socket, io, roomManager); });
        } else {
            handleConnection(socket, io, roomManager);
        }

        socket.on('disconnect', (reason: string) => {
            legacySockets.delete(socket.id);
            if (clientId && clientSockets.get(clientId) === socket.id) clientSockets.delete(clientId);
            logger.info(`[conn] disconnect sid=${short(socket.id)} reason=${reason} secs=${Math.round((Date.now() - connectedAt) / 1000)}`);
            handleDisconnect(socket, io, roomManager, pairs, reason, clientId);
        });

        setupPairHandlers(socket, io, roomManager, pairs);
        setupCodeHandlers(socket, io, roomManager, (joiner, roomId) => admitToGroupRoom(joiner, io, roomManager, roomId));
        setupRosterHandlers(socket, roomManager);

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

        // 도착 알림 기기 ID 묶기 (형식이 틀리면 조용히 무시)
        socket.on('push:bind', (payload: unknown) => {
            const pid = (payload as { pid?: unknown } | null)?.pid;
            if (isValidPid(pid)) socket.data.pushId = pid;
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
        // 같은 브라우저의 다른 탭과는 같은 이름을 쓴다 (탭을 열 때마다 이름이 바뀌지 않게)
        socket.data.deviceId = parseDeviceId(handshakeAuth.deviceId);
        const selfIds = siblingSocketIds(io, socket.data.deviceId, socket.id);

        // connectionStateRecovery로 복구된 연결
        if (socket.recovered && socket.data.globalRoomId && socket.data.ipRoomId) {
            const recoveredGlobalRoomId = socket.data.globalRoomId;
            const oldIpRoomId = socket.data.ipRoomId;
            const recoveredIpRoomId = resolveIpRoomId(socket);
            const ipChanged = recoveredIpRoomId !== oldIpRoomId;
            socket.globalRoomId = recoveredGlobalRoomId;
            socket.ipRoomId = recoveredIpRoomId;
            deviceInfo.identity = allocateIdentity(roomManager, [recoveredGlobalRoomId, recoveredIpRoomId], selfIds, preferred);
            socket.data.identity = deviceInfo.identity;
            if (ipChanged) {
                // IP가 바뀐 채 복구됐다: 옛 IP 룸에서 빼고 새 IP 룸으로 옮긴다
                socket.leave(oldIpRoomId);
                void roomManager.removeUserFromRoom(oldIpRoomId, socket.id).then(() => rosterLeft(io, roomManager, oldIpRoomId, socket.id));
                socket.join(recoveredIpRoomId);
                socket.data.ipRoomId = recoveredIpRoomId;
                logger.info(`[conn] recovery room move sid=${short(socket.id)} ${shortRoom(oldIpRoomId)} -> ${shortRoom(recoveredIpRoomId)}`);
            }
            roomManager.addUserToRoom(recoveredGlobalRoomId, socket.id, deviceInfo);
            roomManager.addUserToRoom(recoveredIpRoomId, socket.id, deviceInfo);
            rosterJoined(io, roomManager, recoveredIpRoomId, socket.id);
            rosterJoined(io, roomManager, recoveredGlobalRoomId, socket.id);
            // 1:1 비공개 방 복구 (adapter가 소켓 룸은 복원, 서버 메모리 멤버십만 다시 채운다)
            for (const roomId of getPrivateRooms(socket)) {
                roomManager.addUserToRoom(roomId, socket.id, deviceInfo);
                broadcastUsers(io, roomManager, roomId);
            }
            if (ipChanged) {
                socket.emit('registered', { globalRoomId: recoveredGlobalRoomId, ipRoomId: recoveredIpRoomId, identity: deviceInfo.identity, ...buildRoomTokenPayload(socket) });
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
        deviceInfo.identity = allocateIdentity(roomManager, [globalRoomId, ipRoomId], selfIds, preferred);
        socket.data.identity = deviceInfo.identity;
        roomManager.addUserToRoom(globalRoomId, socket.id, deviceInfo);
        roomManager.addUserToRoom(ipRoomId, socket.id, deviceInfo);

        socket.emit('registered', { globalRoomId, ipRoomId, identity: deviceInfo.identity, ...buildRoomTokenPayload(socket) });
        rosterJoined(io, roomManager, ipRoomId, socket.id);
        rosterJoined(io, roomManager, globalRoomId, socket.id);

        logger.log(`사용자 등록 [${socket.id}] → ${globalRoomId} / ${ipRoomId}`);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '알 수 없는 에러';
        logger.error(`연결 에러 [${socket.id}]: ${errMsg}`);

        socket.emit('error', createError('룸 입장 실패', 'ROOM_JOIN_ERROR'));
        socket.disconnect();
    }
};

// === 연결이 잠깐 끊긴 기기: 유예 시간 동안 '자리 비움'으로 남긴다 ===

/** 이 이유로 끊기면 (네트워크 전환·화면 꺼짐·앱 백그라운드) 바로 빼지 않고 유예한다. 명시적 나가기·서버 종료는 바로 뺀다 */
export const AWAY_DISCONNECT_REASONS: ReadonlySet<string> = new Set(['transport close', 'ping timeout', 'transport error']);

/** 자리 비움 유예 시간 (ms). AWAY_GRACE_SEC=0 이면 끈다. 기본 60초 */
export const getAwayGraceMs = (): number => {
    const parsed = parseInt(process.env.AWAY_GRACE_SEC ?? '', 10);
    return (Number.isFinite(parsed) && parsed >= 0 ? parsed : 60) * 1000;
};

interface PendingAway {
    timer: ReturnType<typeof setTimeout>;
    finalize: () => Promise<void>;
    clientId?: string;
}
/** 소켓 ID → 유예 중인 퇴장 */
const pendingAway = new Map<string, PendingAway>();
/** clientId → 유예 중인 소켓 ID (같은 기기가 새 소켓으로 붙으면 옛 항목을 바로 정리한다) */
const awayByClient = new Map<string, string>();

const clearPendingAway = (socketId: string): PendingAway | undefined => {
    const p = pendingAway.get(socketId);
    if (!p) return undefined;
    clearTimeout(p.timer);
    pendingAway.delete(socketId);
    if (p.clientId && awayByClient.get(p.clientId) === socketId) awayByClient.delete(p.clientId);
    return p;
};

/** 연결이 복구돼 같은 소켓 ID로 돌아왔다: 유예 중이던 퇴장을 취소한다 */
const cancelAway = (socketId: string) => { clearPendingAway(socketId); };

/** 같은 기기(clientId)가 새 소켓으로 붙었다: 유예 중이던 옛 소켓을 지금 정리한다 (이름표 충돌·유령 방지) */
const flushAwayForClient = async (clientId: string | undefined) => {
    if (!clientId) return;
    const oldId = awayByClient.get(clientId);
    if (!oldId) return;
    const p = clearPendingAway(oldId);
    if (p) await p.finalize();
};

/** 소켓이 속한 모든 방(전체·IP·비공개)에서 제거하고 알린다 */
const removeFromAllRooms = async (socket: ExtendedSocket, io: Server, roomManager: RoomManager, privateRooms: string[]) => {
    // 비공개 방은 연결 복구를 위해 socket.data.privateRooms를 지우지 않는다 (서버 메모리 멤버십만 제거)
    for (const roomId of privateRooms) {
        try {
            await roomManager.removeUserFromRoom(roomId, socket.id);
            broadcastUsers(io, roomManager, roomId);
        } catch (error) {
            logger.error(`퇴장 처리 에러 [${socket.id}] @ ${roomId}:`, error);
        }
    }

    const rooms = [socket.globalRoomId, socket.ipRoomId].filter((r): r is string => !!r);
    for (const roomId of rooms) {
        try {
            const remainingUsers = await roomManager.removeUserFromRoom(roomId, socket.id);
            io.to(roomId).emit('user-left', remainingUsers);
            rosterLeft(io, roomManager, roomId, socket.id);

            logger.log(`사용자 퇴장 [${socket.id}] ← ${roomId} (남은 인원: ${remainingUsers})`);
        } catch (error) {
            logger.error(`퇴장 처리 에러 [${socket.id}] @ ${roomId}:`, error);
        }
    }
};

/** 기기를 '자리 비움'으로 표시하고 방마다 알린다 (명단에는 남는다) */
const markAway = (socket: ExtendedSocket, io: Server, roomManager: RoomManager, privateRooms: string[]) => {
    for (const roomId of [socket.globalRoomId, socket.ipRoomId, ...privateRooms]) {
        if (!roomId) continue;
        const device = roomManager.getUser(roomId, socket.id);
        if (device) device.away = true;
    }
    for (const roomId of [socket.ipRoomId, socket.globalRoomId]) {
        if (roomId && roomManager.getUser(roomId, socket.id)) rosterUpdated(io, roomManager, roomId, socket.id);
    }
    for (const roomId of privateRooms) broadcastUsers(io, roomManager, roomId);
};

/** 연결 종료 처리: 두 방 모두에서 사용자 제거 (네트워크성 끊김은 유예 뒤에 제거) */
const handleDisconnect = async (
    socket: ExtendedSocket,
    io: Server,
    roomManager: RoomManager,
    pairs: PairSessionManager,
    reason?: string,
    clientId?: string
) => {
    // 진행 중인 연결 세션 정리: 상대에게 peer-left
    for (const s of pairs.removeBySocket(socket.id)) endSession(io, s, 'peer-left', [otherOf(s, socket.id)]);

    const privateRooms = [...getPrivateRooms(socket)];
    const graceMs = getAwayGraceMs();
    if (graceMs > 0 && reason && AWAY_DISCONNECT_REASONS.has(reason) && socket.globalRoomId) {
        const finalize = async () => { await removeFromAllRooms(socket, io, roomManager, privateRooms); };
        const timer = setTimeout(() => {
            const p = clearPendingAway(socket.id);
            if (p) void p.finalize();
        }, graceMs);
        timer.unref?.();
        pendingAway.set(socket.id, { timer, finalize, clientId });
        if (clientId) awayByClient.set(clientId, socket.id);
        markAway(socket, io, roomManager, privateRooms);
        return;
    }
    await removeFromAllRooms(socket, io, roomManager, privateRooms);
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

        // 도착 알림(Web Push): 전체 공유 방은 보내지 않는다. 실패해도 공유에는 영향 없음
        if (target !== 'global') {
            const kind = isText ? 'text' : msg?.type === 'file-uploaded' ? 'file' : null;
            if (kind) getPushNotifier().notifyArrival({ roomId: targetRoomId, scope: target === 'ip' ? 'ip' : 'prv', kind, senderSocketId: socket.id });
        }

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
