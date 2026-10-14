/**
 * 잠금 파일 비밀번호 시도 제한 (서버 메모리).
 *
 * 같은 비밀번호로 잠근 묶음(vh)마다 틀린 횟수를 센다. 파일별로 세면 같은 비밀번호로 잠근 파일 N개에서
 * N배의 기회가 생기므로 vh 기준으로 묶는다.
 * - 전체: 30회, IP(일일 키)당: 5회. 둘 중 먼저 바닥나는 쪽이 남은 횟수다.
 * - 서버 재시작 시 초기화된다(알려진 한계, 규격 문서에 기록).
 */

export const UNLOCK_MAX_TOTAL = 30;
export const UNLOCK_MAX_PER_IP = 5;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20000;

interface Entry {
    total: number;
    perIp: Map<string, number>;
    at: number;
}

const entries = new Map<string, Entry>();

const prune = (now: number): void => {
    for (const [vh, e] of entries) if (now - e.at > ENTRY_TTL_MS) entries.delete(vh);
    while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
    }
};

/** 남은 시도 횟수 */
export function unlockRemaining(vh: string, ipKey: string, now: number = Date.now()): number {
    const e = entries.get(vh);
    if (!e || now - e.at > ENTRY_TTL_MS) return Math.min(UNLOCK_MAX_TOTAL, UNLOCK_MAX_PER_IP);
    const ip = e.perIp.get(ipKey) ?? 0;
    return Math.max(0, Math.min(UNLOCK_MAX_TOTAL - e.total, UNLOCK_MAX_PER_IP - ip));
}

/** 틀린 시도를 기록하고 남은 횟수를 돌려준다 */
export function recordUnlockFailure(vh: string, ipKey: string, now: number = Date.now()): number {
    prune(now);
    let e = entries.get(vh);
    if (!e || now - e.at > ENTRY_TTL_MS) {
        e = { total: 0, perIp: new Map(), at: now };
        entries.set(vh, e);
    }
    e.total += 1;
    e.perIp.set(ipKey, (e.perIp.get(ipKey) ?? 0) + 1);
    return unlockRemaining(vh, ipKey, now);
}

/** 테스트용 */
export function resetUnlockLimiter(): void {
    entries.clear();
}
