/**
 * @file push.ts
 * @description 도착 알림(Web Push) 구독 API. 메서드는 GET/POST만 쓴다(CORS 허용 목록 때문).
 *
 * - GET  /api/push/key          → { key }  (VAPID 공개키. 서버에 키가 없으면 404 PUSH_DISABLED)
 * - POST /api/push/subscribe    → 구독 등록·갱신
 * - POST /api/push/unsubscribe  → 구독 삭제 (pid와 endpoint가 모두 맞을 때만)
 *
 * 클라이언트는 방 ID를 주장할 수 없다. 같은 네트워크 방은 요청 IP에서 서버가 계산하고,
 * 비공개 방은 서명이 맞는 입장권으로만 묶는다.
 */
import type { Express, Request, Response } from 'express';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { verifyTicket } from '../utils/privateTicket';
import { TokenBucket } from '../utils/tokenBucket';
import { getPushStore, PushStore, isValidPid, isAllowedPushEndpoint, isValidPushKeys, toPushLang, PUSH_MAX_PRV_PER_SUB } from '../services/pushStore';
import { isPushEnabled } from '../services/pushNotifier';

/** IP당 분당 30회 (연속 30회, 이후 2초에 1회 충전) */
const BUCKET_CAPACITY = 30;
const BUCKET_REFILL_PER_SEC = 0.5;
const MAX_BUCKETS = 10000;

export interface PushRouteDeps {
    store?: PushStore;
    now?: () => number;
    enabled?: () => boolean;
}

export const registerPushRoutes = (app: Express, deps: PushRouteDeps = {}): void => {
    const store = deps.store ?? getPushStore();
    const now = deps.now ?? Date.now;
    const enabled = deps.enabled ?? (() => isPushEnabled());
    const buckets = new Map<string, TokenBucket>();

    const disabled = (res: Response): void => { res.status(404).json({ error: 'PUSH_DISABLED' }); };

    const limited = (req: Request): boolean => {
        const ip = extractClientIp({ headers: req.headers, address: req.socket.remoteAddress }) ?? 'unknown';
        let bucket = buckets.get(ip);
        if (!bucket) {
            if (buckets.size >= MAX_BUCKETS) buckets.clear();
            bucket = new TokenBucket(BUCKET_CAPACITY, BUCKET_REFILL_PER_SEC, now);
            buckets.set(ip, bucket);
        }
        return !bucket.tryConsume();
    };

    app.get('/api/push/key', (_req: Request, res: Response) => {
        if (!enabled()) { disabled(res); return; }
        res.json({ key: process.env.VAPID_PUBLIC_KEY });
    });

    app.post('/api/push/subscribe', (req: Request, res: Response) => {
        if (!enabled()) { disabled(res); return; }
        if (limited(req)) { res.status(429).json({ error: 'RATE_LIMITED' }); return; }

        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
        const sub = (body.subscription && typeof body.subscription === 'object' ? body.subscription : {}) as Record<string, unknown>;
        if (!isValidPid(body.pid)) { res.status(400).json({ error: 'BAD_PID' }); return; }
        // SSRF 방지: 허용된 푸시 서비스의 https 주소만
        if (!isAllowedPushEndpoint(sub.endpoint)) { res.status(400).json({ error: 'BAD_ENDPOINT' }); return; }
        if (!isValidPushKeys(sub.keys)) { res.status(400).json({ error: 'BAD_KEYS' }); return; }

        // 같은 네트워크 방은 요청 IP로만 정한다
        const ip = extractClientIp({ headers: req.headers, address: req.socket.remoteAddress });
        const secret = process.env.ROOM_ID_SECRET || 'dev-insecure-secret';
        const ipRoomId = ip ? deriveIpRoomId(ip, secret) : null;

        // 비공개 방은 서명이 맞는 입장권만
        const rawTickets = Array.isArray(body.tickets) ? body.tickets.slice(0, PUSH_MAX_PRV_PER_SUB) : [];
        const nowSec = Math.floor(now() / 1000);
        const seen = new Set<string>();
        const tickets: Array<{ roomId: string; exp: number }> = [];
        for (const raw of rawTickets) {
            const v = verifyTicket(raw, nowSec);
            if (!v.ok || seen.has(v.roomId)) continue;
            seen.add(v.roomId);
            tickets.push({ roomId: v.roomId, exp: v.exp * 1000 });
        }

        const result = store.subscribe({
            pid: body.pid,
            endpoint: sub.endpoint,
            keys: sub.keys,
            lang: toPushLang(body.lang),
            ipRoomId,
            tickets,
        });
        if (!result.ok) { res.status(503).json({ error: result.code }); return; }
        res.json({ ok: true, ip: ipRoomId !== null, prv: result.prv });
    });

    app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
        if (!enabled()) { disabled(res); return; }
        if (limited(req)) { res.status(429).json({ error: 'RATE_LIMITED' }); return; }
        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
        if (isValidPid(body.pid) && typeof body.endpoint === 'string') store.unsubscribe(body.pid, body.endpoint);
        res.json({ ok: true });
    });
};
