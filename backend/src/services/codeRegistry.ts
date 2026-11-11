import { randomBytes } from 'crypto';

/**
 * 그림 코드 레지스트리 (메모리 전용).
 * - 활성 코드: route(그림 앞 2개) → 호스트 소켓
 * - 코드 세션: 들어오려는 기기 ↔ 호스트 사이의 한 번의 시도
 * - 실패 제한: 소켓 id / IP 각각의 틀린 횟수
 * route·sessionId는 로그에 남기지 않는다 (이 파일은 로그를 쓰지 않는다).
 */

export const PICTURE_COUNT = 24;
export const MAX_ACTIVE_CODES = 500;
export const MAX_SESSIONS_PER_HOST = 20;
export const SESSION_TTL_MS = 90 * 1000;
export const APPROVED_TTL_MS = 30 * 1000;
export const FAIL_RESET_MS = 10 * 60 * 1000;

const envInt = (name: string, fallback: number): number => {
    const n = parseInt(process.env[name] || '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const getCodeTtlSec = (): number => envInt('CODE_TTL_SEC', 300);
export const getCodeMaxFails = (): number => envInt('CODE_MAX_FAILS', 5);
export const getCodeLockSec = (): number => envInt('CODE_LOCK_SEC', 180);
/** 이 횟수부터 응답에 warn:true */
export const getCodeWarnFails = (): number => Math.min(3, getCodeMaxFails());

export const isRoute = (v: unknown): v is [number, number] =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n < PICTURE_COUNT);

const routeKey = (route: [number, number]): string => `${route[0]}-${route[1]}`;

export interface ActiveCode {
    hostId: string;
    roomId: string;
    expiresAt: number;
}

export type CodeSessionState = 'open' | 'confirmed' | 'approved';

export interface CodeSession {
    id: string;
    hostId: string;
    joinerId: string;
    state: CodeSessionState;
    expiresAt: number;
}

export type OpenResult = { ok: true; expiresAt: number } | { ok: false; error: 'ROUTE_TAKEN' | 'BUSY' };

interface FailEntry {
    count: number;
    first: number;
    lockedUntil: number;
}

export class CodeRegistry {
    private codes = new Map<string, ActiveCode>();
    private hostCode = new Map<string, string>();
    private sessions = new Map<string, CodeSession>();
    private joinerSession = new Map<string, string>();
    private fails = new Map<string, FailEntry>();

    constructor(private readonly now: () => number = Date.now) {}

    get activeCodeCount(): number {
        return this.codes.size;
    }

    // === 코드 ===

    open(hostId: string, roomId: string, route: [number, number]): OpenResult {
        const key = routeKey(route);
        const t = this.now();
        const existing = this.codes.get(key);
        if (existing && existing.expiresAt > t && existing.hostId !== hostId) return { ok: false, error: 'ROUTE_TAKEN' };
        if (existing && existing.expiresAt > t && existing.hostId === hostId) return { ok: false, error: 'ROUTE_TAKEN' };
        const mine = this.hostCode.get(hostId);
        if (!mine && this.codes.size >= MAX_ACTIVE_CODES) {
            this.sweep();
            if (this.codes.size >= MAX_ACTIVE_CODES) return { ok: false, error: 'BUSY' };
        }
        if (mine) this.codes.delete(mine);
        const expiresAt = t + getCodeTtlSec() * 1000;
        this.codes.set(key, { hostId, roomId, expiresAt });
        this.hostCode.set(hostId, key);
        return { ok: true, expiresAt };
    }

    /** 호스트의 코드 해제. 있었으면 true */
    close(hostId: string): boolean {
        const key = this.hostCode.get(hostId);
        if (!key) return false;
        this.hostCode.delete(hostId);
        this.codes.delete(key);
        return true;
    }

    /** 만료되지 않은 활성 코드 조회 */
    find(route: [number, number]): ActiveCode | undefined {
        const c = this.codes.get(routeKey(route));
        if (!c) return undefined;
        if (c.expiresAt <= this.now()) return undefined;
        return c;
    }

    // === 세션 ===

    sessionCountForHost(hostId: string): number {
        let n = 0;
        for (const s of this.sessions.values()) if (s.hostId === hostId) n++;
        return n;
    }

    hasSessionAsJoiner(joinerId: string): boolean {
        return this.joinerSession.has(joinerId);
    }

    createSession(hostId: string, joinerId: string): CodeSession {
        const s: CodeSession = {
            id: randomBytes(12).toString('hex'),
            hostId,
            joinerId,
            state: 'open',
            expiresAt: this.now() + SESSION_TTL_MS,
        };
        this.sessions.set(s.id, s);
        this.joinerSession.set(joinerId, s.id);
        return s;
    }

    getSession(id: unknown): CodeSession | undefined {
        if (typeof id !== 'string') return undefined;
        const s = this.sessions.get(id);
        if (!s) return undefined;
        if (s.expiresAt <= this.now()) return undefined;
        return s;
    }

    /** 세션 상태 변경 + 만료 갱신 */
    setState(s: CodeSession, state: CodeSessionState, ttlMs: number): void {
        s.state = state;
        s.expiresAt = this.now() + ttlMs;
    }

    removeSession(id: string): CodeSession | undefined {
        const s = this.sessions.get(id);
        if (!s) return undefined;
        this.sessions.delete(id);
        if (this.joinerSession.get(s.joinerId) === id) this.joinerSession.delete(s.joinerId);
        return s;
    }

    /** 소켓이 끝나면 그 소켓의 코드와 세션을 모두 정리하고 끝난 세션을 돌려준다 */
    removeBySocket(socketId: string): CodeSession[] {
        this.close(socketId);
        const removed: CodeSession[] = [];
        for (const s of [...this.sessions.values()]) {
            if (s.hostId === socketId || s.joinerId === socketId) {
                this.removeSession(s.id);
                removed.push(s);
            }
        }
        return removed;
    }

    /** 만료된 코드를 지우고 만료된 세션을 돌려준다 */
    sweep(): CodeSession[] {
        const t = this.now();
        for (const [key, c] of [...this.codes.entries()]) {
            if (c.expiresAt <= t) {
                this.codes.delete(key);
                if (this.hostCode.get(c.hostId) === key) this.hostCode.delete(c.hostId);
            }
        }
        const expired: CodeSession[] = [];
        for (const s of [...this.sessions.values()]) {
            if (s.expiresAt <= t) {
                this.removeSession(s.id);
                expired.push(s);
            }
        }
        for (const [k, f] of [...this.fails.entries()]) {
            if (f.lockedUntil <= t && t - f.first >= FAIL_RESET_MS) this.fails.delete(k);
        }
        return expired;
    }

    // === 실패 제한 ===

    private failEntry(key: string): FailEntry | undefined {
        const f = this.fails.get(key);
        if (!f) return undefined;
        const t = this.now();
        if (f.lockedUntil <= t && t - f.first >= FAIL_RESET_MS) {
            this.fails.delete(key);
            return undefined;
        }
        return f;
    }

    /** 잠겨 있으면 남은 초(올림), 아니면 0. keys = [소켓 키, IP 키] */
    lockedFor(keys: string[]): number {
        const t = this.now();
        let wait = 0;
        for (const k of keys) {
            const f = this.failEntry(k);
            if (f && f.lockedUntil > t) wait = Math.max(wait, Math.ceil((f.lockedUntil - t) / 1000));
        }
        return wait;
    }

    /** 틀린 시도 1회 기록. 키 중 가장 큰 횟수 기준으로 warn 여부와 잠금 남은 초를 돌려준다 */
    recordFail(keys: string[]): { count: number; warn: boolean; retryAfterSec: number } {
        const t = this.now();
        let max = 0;
        for (const k of keys) {
            let f = this.failEntry(k);
            if (!f) {
                f = { count: 0, first: t, lockedUntil: 0 };
                this.fails.set(k, f);
            }
            f.count += 1;
            if (f.count >= getCodeMaxFails() && f.lockedUntil <= t) f.lockedUntil = t + getCodeLockSec() * 1000;
            max = Math.max(max, f.count);
        }
        return { count: max, warn: max >= getCodeWarnFails(), retryAfterSec: this.lockedFor(keys) };
    }
}
