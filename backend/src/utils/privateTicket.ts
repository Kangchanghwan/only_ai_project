import { createHmac, timingSafeEqual } from 'crypto';
import { isPrivateRoomId } from './privateRoom';

/**
 * 1:1 비공개 방 입장권 (무상태). 서버는 멤버 목록을 저장하지 않고 서명만 검증한다.
 * 형식: pv1.<roomId>.<만료 unix초>.<HMAC-SHA256 base64url>
 */
const PREFIX = 'pv1';
const DEFAULT_TTL_SEC = 30 * 24 * 60 * 60;

export type TicketCheck =
    | { ok: true; roomId: string; exp: number }
    | { ok: false; reason: 'malformed' | 'expired' | 'invalid' };

const getSecret = (): string =>
    process.env.PRIVATE_ROOM_SECRET || process.env.ROOM_TOKEN_SECRET || process.env.ROOM_ID_SECRET || 'dev-insecure-secret';

export const getPrivateTicketTtlSec = (): number => {
    const parsed = parseInt(process.env.PRIVATE_TICKET_TTL_SEC || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SEC;
};

const sign = (roomId: string, exp: number): string =>
    createHmac('sha256', getSecret()).update(`private-ticket:v1:${roomId}:${exp}`).digest('base64url');

export const issueTicket = (roomId: string, nowSec: number = Math.floor(Date.now() / 1000)): string => {
    const exp = nowSec + getPrivateTicketTtlSec();
    return `${PREFIX}.${roomId}.${exp}.${sign(roomId, exp)}`;
};

export const verifyTicket = (ticket: unknown, nowSec: number = Math.floor(Date.now() / 1000)): TicketCheck => {
    if (typeof ticket !== 'string' || ticket.length > 200) return { ok: false, reason: 'malformed' };
    const parts = ticket.split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX || !isPrivateRoomId(parts[1]) || !/^\d{1,12}$/.test(parts[2]) || !parts[3]) {
        return { ok: false, reason: 'malformed' };
    }
    const roomId = parts[1];
    const exp = Number(parts[2]);
    const expected = Buffer.from(sign(roomId, exp));
    const actual = Buffer.from(parts[3]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'invalid' };
    if (nowSec >= exp) return { ok: false, reason: 'expired' };
    return { ok: true, roomId, exp };
};
