import { Server } from 'socket.io';
import { ExtendedSocket } from '../types';
import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { extractClientIp } from '../utils/clientIp';
import { isGroupRoomId } from '../utils/privateRoom';
import { TokenBucket } from '../utils/tokenBucket';
import logger from '../utils/logger';
import {
    CodeRegistry,
    CodeSession,
    isRoute,
    getCodeTtlSec,
    APPROVED_TTL_MS,
    SESSION_TTL_MS,
    MAX_SESSIONS_PER_HOST,
} from '../services/codeRegistry';

/**
 * 그림 코드 입장 (SPAKE2는 클라이언트끼리, 서버는 route 조회와 메시지 중계만).
 * 서버는 route(앞 2개)만 알고, 신호 내용은 해석하지 않는다.
 * 로그에는 route·sessionId·신호 내용을 남기지 않고 열림/닫힘 횟수만 남긴다.
 */

/** code:signal data 최대 크기 (JSON 직렬화 기준, bytes) — pair:signal과 같은 수준 */
export const CODE_SIGNAL_MAX_BYTES = 4 * 1024;
/** code:* 이벤트 소켓당 토큰 버킷 (pair:*와 같은 수치) */
export const CODE_BUCKET_CAPACITY = 20;
export const CODE_BUCKET_REFILL_PER_SEC = 5;
const SWEEP_INTERVAL_MS = 1000;

type Ack = ((res: Record<string, unknown>) => void) | undefined;

const buckets = new WeakMap<object, TokenBucket>();

const allowed = (socket: ExtendedSocket, ack: Ack): boolean => {
    let bucket = buckets.get(socket);
    if (!bucket) {
        bucket = new TokenBucket(CODE_BUCKET_CAPACITY, CODE_BUCKET_REFILL_PER_SEC);
        buckets.set(socket, bucket);
    }
    if (bucket.tryConsume()) return true;
    reply(ack, { ok: false, error: 'RATE_LIMITED', code: 'RATE_LIMITED' });
    return false;
};

const reply = (ack: Ack, res: Record<string, unknown>) => {
    if (typeof ack === 'function') ack(res);
};

const asObject = (payload: unknown): Record<string, unknown> =>
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

/**
 * 실패 제한 키: 소켓 id(5회) / IP(기본 30회, 교실처럼 한 IP를 여럿이 쓰는 경우를 위해 따로 높게).
 * 소켓 등록에는 믿을 만한 기기 고유 id가 없다(identity는 클라이언트가 저장한 이름표, pid는 선택 값이라 둘 다 꾸밀 수 있다).
 * 그래서 소켓 카운터는 소켓 id 기준이고, 재접속으로 소켓만 바꾸는 시도는 IP 한도가 막는다.
 */
const failKeys = (socket: ExtendedSocket, joinerId: string): { socketKey: string; ipKey?: string; all: string[] } => {
    const socketKey = `s:${joinerId}`;
    const ip = extractClientIp(socket.handshake);
    const ipKey = ip ? `i:${ip}` : undefined;
    return { socketKey, ipKey, all: ipKey ? [socketKey, ipKey] : [socketKey] };
};

/** 활성 코드 레지스트리는 서버(io)당 하나 */
const registries = new WeakMap<Server, CodeRegistry>();
const swept = new WeakSet<Server>();

export const getCodeRegistry = (io: Server): CodeRegistry => {
    let r = registries.get(io);
    if (!r) {
        r = new CodeRegistry();
        registries.set(io, r);
    }
    return r;
};

const emitEnd = (io: Server, socketId: string, sessionId: string, reason: string, extra: Record<string, unknown> = {}) => {
    io.to(socketId).emit('code:end', { sessionId, reason, ...extra });
};

export const setupCodeHandlers = (socket: ExtendedSocket, io: Server, roomManager: RoomManager) => {
    const reg = getCodeRegistry(io);

    if (!swept.has(io)) {
        swept.add(io);
        const timer = setInterval(() => {
            for (const s of reg.sweep()) {
                emitEnd(io, s.hostId, s.id, 'timeout');
                emitEnd(io, s.joinerId, s.id, 'timeout');
            }
        }, SWEEP_INTERVAL_MS);
        timer.unref();
    }

    /** 내가 호스트/들어오는 쪽인 세션만 돌려준다 */
    const asHost = (sessionId: unknown): CodeSession | undefined => {
        const s = reg.getSession(sessionId);
        return s && s.hostId === socket.id ? s : undefined;
    };
    const asMember = (sessionId: unknown): CodeSession | undefined => {
        const s = reg.getSession(sessionId);
        return s && (s.hostId === socket.id || s.joinerId === socket.id) ? s : undefined;
    };

    const registered = (ack: Ack): boolean => {
        if (socket.globalRoomId) return true;
        reply(ack, { ok: false, error: 'NOT_REGISTERED' });
        return false;
    };

    socket.on('code:open', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack) || !registered(ack)) return;
            const p = asObject(payload);
            const roomId = p.roomId;
            const route = p.route;
            if (!isRoute(route)) return reply(ack, { ok: false, error: 'INVALID_PAYLOAD' });
            const mine: string[] = socket.data.privateRooms ?? [];
            if (!isGroupRoomId(roomId) || !mine.includes(roomId)) return reply(ack, { ok: false, error: 'NOT_ALLOWED' });
            const res = reg.open(socket.id, roomId, route);
            if (!res.ok) return reply(ack, { ok: false, error: res.error });
            logger.log(`그림 코드 열림 (활성 ${reg.activeCodeCount}개)`);
            reply(ack, { ok: true, expiresAt: res.expiresAt, ttlSec: getCodeTtlSec() });
        } catch (error) {
            logger.error(`code:open 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:close', (_payload?: unknown, maybeAck?: Ack) => {
        try {
            const ack = typeof _payload === 'function' ? (_payload as Ack) : maybeAck;
            if (!allowed(socket, ack)) return;
            if (reg.close(socket.id)) logger.log(`그림 코드 닫힘 (활성 ${reg.activeCodeCount}개)`);
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:close 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:join', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack) || !registered(ack)) return;
            const route = asObject(payload).route;
            if (!isRoute(route)) return reply(ack, { ok: false, error: 'INVALID_PAYLOAD' });

            const keys = failKeys(socket, socket.id);
            const wait = reg.lockedFor(keys.all);
            if (wait > 0) return reply(ack, { ok: false, error: 'WAIT', retryAfterSec: wait });
            if (reg.hasSessionAsJoiner(socket.id)) return reply(ack, { ok: false, error: 'BUSY' });

            const code = reg.find(route);
            const host = code ? (io.sockets.sockets.get(code.hostId) as ExtendedSocket | undefined) : undefined;
            if (!code || !host) {
                const f = reg.recordFail(keys.socketKey, keys.ipKey);
                return reply(ack, {
                    ok: false,
                    error: 'NOT_FOUND',
                    ...(f.warn ? { warn: true } : {}),
                    ...(f.retryAfterSec > 0 ? { retryAfterSec: f.retryAfterSec } : {}),
                });
            }
            if (code.hostId === socket.id) return reply(ack, { ok: false, error: 'NOT_ALLOWED' });
            if (reg.sessionCountForHost(code.hostId) >= MAX_SESSIONS_PER_HOST) return reply(ack, { ok: false, error: 'BUSY' });

            const s = reg.createSession(code.hostId, socket.id);
            io.to(code.hostId).emit('code:incoming', { sessionId: s.id });
            reply(ack, { ok: true, sessionId: s.id });
        } catch (error) {
            logger.error(`code:join 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:signal', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack)) return;
            const p = asObject(payload);
            const s = asMember(p.sessionId);
            if (!s) return reply(ack, { ok: false, error: 'NOT_FOUND' }); // 세션 멤버가 아니면 중계하지 않는다
            const serialized = JSON.stringify(p.data);
            if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > CODE_SIGNAL_MAX_BYTES) return reply(ack, { ok: false, error: 'TOO_LARGE' });
            const isHost = s.hostId === socket.id;
            const to = isHost ? s.joinerId : s.hostId;
            if (isHost) {
                // 승인 전에는 SPAKE2 메시지만 오간다. 승인된 세션은 호스트의 신호 1회 전달 뒤 종료
                io.to(to).emit('code:signal', { sessionId: s.id, data: p.data });
                if (s.state === 'approved') reg.removeSession(s.id);
            } else {
                // 들어오는 쪽은 승인 전에만 보낼 수 있다
                if (s.state === 'approved') return reply(ack, { ok: false, error: 'NOT_ALLOWED' });
                io.to(to).emit('code:signal', { sessionId: s.id, data: p.data });
            }
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:signal 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:confirmed', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack)) return;
            const s = asHost(asObject(payload).sessionId);
            if (!s || s.state !== 'open') return reply(ack, { ok: false, error: 'NOT_FOUND' });
            const from = roomManager.getUser(SHARED_ROOM_ID, s.joinerId);
            reg.setState(s, 'confirmed', SESSION_TTL_MS);
            io.to(s.hostId).emit('code:request', { sessionId: s.id, from: from ?? null });
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:confirmed 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:fail', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack)) return;
            const s = asHost(asObject(payload).sessionId);
            if (!s || s.state !== 'open') return reply(ack, { ok: false, error: 'NOT_FOUND' });
            reg.removeSession(s.id);
            const joiner = io.sockets.sockets.get(s.joinerId) as ExtendedSocket | undefined;
            const fk = joiner ? failKeys(joiner, s.joinerId) : { socketKey: `s:${s.joinerId}`, ipKey: undefined };
            const f = reg.recordFail(fk.socketKey, fk.ipKey);
            emitEnd(io, s.joinerId, s.id, 'wrong', {
                ...(f.warn ? { warn: true } : {}),
                ...(f.retryAfterSec > 0 ? { retryAfterSec: f.retryAfterSec } : {}),
            });
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:fail 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:decide', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack)) return;
            const p = asObject(payload);
            const s = asHost(p.sessionId);
            if (!s || s.state !== 'confirmed' || typeof p.accept !== 'boolean') return reply(ack, { ok: false, error: 'NOT_FOUND' });
            if (!p.accept) {
                reg.removeSession(s.id);
                emitEnd(io, s.joinerId, s.id, 'declined');
            } else {
                reg.setState(s, 'approved', APPROVED_TTL_MS);
            }
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:decide 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('code:cancel', (payload: unknown, ack?: Ack) => {
        try {
            if (!allowed(socket, ack)) return;
            const s = asMember(asObject(payload).sessionId);
            if (!s) return reply(ack, { ok: false, error: 'NOT_FOUND' });
            reg.removeSession(s.id);
            emitEnd(io, s.hostId === socket.id ? s.joinerId : s.hostId, s.id, 'cancelled');
            reply(ack, { ok: true });
        } catch (error) {
            logger.error(`code:cancel 처리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });

    socket.on('disconnect', () => {
        try {
            const had = reg.close(socket.id);
            if (had) logger.log(`그림 코드 닫힘 (활성 ${reg.activeCodeCount}개)`);
            for (const s of reg.removeBySocket(socket.id)) {
                emitEnd(io, s.hostId === socket.id ? s.joinerId : s.hostId, s.id, 'gone');
            }
        } catch (error) {
            logger.error(`code 정리 에러 [${socket.id}]`, error instanceof Error ? error.message : '');
        }
    });
};
