import { createHmac } from 'crypto';

/** socket.handshake의 일부만 사용하는 최소 인터페이스 */
interface HandshakeLike {
    headers: Record<string, string | string[] | undefined>;
    address?: string;
}

const firstHeader = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
};

/**
 * 신뢰하는 프록시(Cloudflare)가 넣어주는 헤더에서 실제 공인 IP를 추출한다.
 * 우선순위: CF-Connecting-IP → X-Forwarded-For 첫 IP → handshake.address
 */
export const extractClientIp = (handshake: HandshakeLike): string | null => {
    const cf = firstHeader(handshake.headers['cf-connecting-ip']);
    if (cf && cf.trim()) return cf.trim();

    const xff = firstHeader(handshake.headers['x-forwarded-for']);
    if (xff && xff.trim()) {
        const first = xff.split(',')[0].trim();
        if (first) return first;
    }

    const addr = handshake.address?.trim();
    return addr ? addr : null;
};

/**
 * 그룹핑 키로 IP를 정규화한다.
 * - IPv4(및 IPv4-mapped IPv6): 전체 주소
 * - IPv6: /64 프리픽스(앞 4 hextet)로 묶음
 */
export const normalizeIp = (ip: string): string => {
    // IPv6 zone id 제거 (예: fe80::1%eth0 → fe80::1)
    ip = ip.split('%')[0];

    // IPv4-mapped IPv6 (::ffff:a.b.c.d) → IPv4
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return mapped[1];

    // IPv4
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;

    // IPv6: 앞 4개 hextet(= /64)만 사용
    if (ip.includes(':')) {
        const full = expandIpv6(ip);
        return full.slice(0, 4).join(':');
    }

    return ip;
};

/**
 * IPv6를 8개 hextet 배열로 확장하고 각 hextet의 선행 0을 정규화한다.
 * 압축(::)·비압축 표기가 동일한 정규형으로 수렴하도록 hextet을 숫자로 파싱해 다시 렌더링한다.
 */
const expandIpv6 = (ip: string): string[] => {
    const [head, tail = ''] = ip.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    const middle = missing > 0 ? new Array(missing).fill('0') : [];
    return [...headParts, ...middle, ...tailParts].map(h => {
        const parsed = parseInt(h || '0', 16);
        return (Number.isNaN(parsed) ? 0 : parsed).toString(16);
    });
};

/**
 * 공인 IP로부터 불투명한 격리 룸 ID를 만든다.
 * HMAC(secret) 으로 raw IP 노출과 추측을 막는다.
 */
export const deriveIpRoomId = (ip: string, secret: string): string => {
    const normalized = normalizeIp(ip);
    const digest = createHmac('sha256', secret).update(normalized).digest('hex');
    return `room-${digest.slice(0, 12)}`;
};
