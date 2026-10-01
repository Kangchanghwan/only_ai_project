import { createHmac } from 'crypto';
import type { Request } from 'express';
import { extractClientIp, normalizeIp } from './clientIp';

/**
 * IP당 일일 업로드 총량 제한 (메모리 저장, 서버 재시작 시 초기화).
 * 키 = `${KST 날짜}:${HMAC(정규화된 IP)}` — raw IP는 보관하지 않는다.
 */
const GB = 1024 * 1024 * 1024;

export const getDailyQuotaBytes = (): number => {
    const parsed = Number(process.env.DAILY_UPLOAD_QUOTA_GB);
    return (Number.isFinite(parsed) && parsed > 0 ? parsed : 20) * GB;
};

/** KST(UTC+9) 기준 YYYY-MM-DD */
export const kstDate = (now: number = Date.now()): string =>
    new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);

const usage = new Map<string, number>();

export const quotaKeyForIp = (ip: string | null, now: number = Date.now()): string => {
    const secret = process.env.ROOM_ID_SECRET || 'dev-insecure-secret';
    const digest = createHmac('sha256', secret).update(ip ? normalizeIp(ip) : 'unknown').digest('hex').slice(0, 16);
    return `${kstDate(now)}:${digest}`;
};

export const quotaKeyFromRequest = (req: Request): string =>
    quotaKeyForIp(extractClientIp({ headers: req.headers, address: req.socket?.remoteAddress }));

export type QuotaResult = { ok: true; remaining: number } | { ok: false; remaining: number };

/** 오늘 날짜가 아닌 키를 정리한다 */
const prune = (today: string): void => {
    for (const key of usage.keys()) {
        if (!key.startsWith(`${today}:`)) usage.delete(key);
    }
};

/** 한도 내이면 bytes를 예약(합산)하고 ok, 아니면 변경 없이 남은 용량과 함께 실패를 돌려준다 */
export function reserveDailyQuota(key: string, bytes: number, now: number = Date.now()): QuotaResult {
    prune(kstDate(now));
    const limit = getDailyQuotaBytes();
    const used = usage.get(key) ?? 0;
    if (used + bytes > limit) {
        return { ok: false, remaining: Math.max(0, limit - used) };
    }
    usage.set(key, used + bytes);
    return { ok: true, remaining: limit - used - bytes };
}

/** 예약분을 되돌린다 (abort/실패 시) */
export function releaseDailyQuota(key: string, bytes: number): void {
    const used = usage.get(key);
    if (used === undefined || bytes <= 0) return;
    usage.set(key, Math.max(0, used - bytes));
}

/** 테스트용 초기화 */
export const resetDailyQuota = (): void => usage.clear();

export const dailyQuotaFailureBody = (remaining: number) => ({
    error: '오늘의 업로드 한도를 초과했습니다. 내일 다시 시도해 주세요',
    code: 'DAILY_QUOTA_EXCEEDED',
    remainingBytes: remaining,
});
