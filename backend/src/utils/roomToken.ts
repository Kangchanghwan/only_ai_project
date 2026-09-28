import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 룸 토큰: "이 소켓 연결이 실제로 그 룸에 들어가 있다"는 것을 REST API에 증명하는 서명 값.
 *
 * roomId만 알면 누구나 파일 목록 조회·업로드·삭제를 할 수 있던 문제를 막는다.
 * roomId는 공유 링크(QR, 다운로드 URL)에 그대로 실리므로 비밀이 아니다.
 * 토큰은 소켓 등록(registered) 시에만 발급되고 URL에는 절대 실리지 않는다.
 *
 * 형식: v1.<만료 unix초>.<HMAC-SHA256 base64url>
 */

/** 클라이언트가 토큰을 실어 보내는 HTTP 헤더 (소문자: Express req.get은 대소문자 무관) */
export const ROOM_TOKEN_HEADER = 'x-room-token';

const VERSION = 'v1';

/** 기본 유효 시간: 2시간. 만료 전에 클라이언트가 소켓으로 재발급받는다 */
const DEFAULT_TTL_SEC = 2 * 60 * 60;

/** 검증 결과 */
export type RoomTokenCheck = 'valid' | 'missing' | 'malformed' | 'expired' | 'invalid';

const getSecret = (): string =>
    process.env.ROOM_TOKEN_SECRET || process.env.ROOM_ID_SECRET || 'dev-insecure-secret';

/** 토큰 유효 시간(초). ROOM_TOKEN_TTL_SEC 로 조정 가능 */
export const getRoomTokenTtlSec = (): number => {
    const parsed = parseInt(process.env.ROOM_TOKEN_TTL_SEC || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SEC;
};

/** roomId와 만료 시각에 대한 서명 (IP 룸 ID 도출과 키가 섞이지 않도록 접두사로 도메인 분리) */
const sign = (roomId: string, exp: number, secret: string): string =>
    createHmac('sha256', secret).update(`room-token:${VERSION}:${roomId}:${exp}`).digest('base64url');

/** 룸 토큰 발급 */
export const issueRoomToken = (
    roomId: string,
    now: number = Date.now(),
    ttlSec: number = getRoomTokenTtlSec(),
    secret: string = getSecret()
): string => {
    const exp = Math.floor(now / 1000) + ttlSec;
    return `${VERSION}.${exp}.${sign(roomId, exp, secret)}`;
};

/** 여러 룸의 토큰을 한 번에 발급 (roomId → token) */
export const issueRoomTokens = (roomIds: Array<string | undefined>, now: number = Date.now()): Record<string, string> => {
    const tokens: Record<string, string> = {};
    for (const roomId of roomIds) {
        if (roomId) tokens[roomId] = issueRoomToken(roomId, now);
    }
    return tokens;
};

/** 룸 토큰 검증 (상수 시간 비교) */
export const verifyRoomToken = (
    roomId: string,
    token: string | undefined | null,
    now: number = Date.now(),
    secret: string = getSecret()
): RoomTokenCheck => {
    if (!token) return 'missing';

    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== VERSION || !/^\d+$/.test(parts[1]) || !parts[2]) {
        return 'malformed';
    }

    const exp = Number(parts[1]);
    const expected = Buffer.from(sign(roomId, exp, secret));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return 'invalid';
    }

    if (Math.floor(now / 1000) >= exp) return 'expired';

    return 'valid';
};
