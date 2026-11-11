/**
 * @file pushStore.ts
 * @description 도착 알림(Web Push) 구독 저장소.
 *
 * 메모리 Map이 기준이고, 잠금(비공개) R2 버킷 `_push/<pid>.json`에 따라 써 두었다가 부팅 때 되살린다
 * (textQueueStore.ts와 같은 패턴). 구독에는 알림을 받을 방이 묶인다.
 *  - 같은 네트워크 방: "가장 최근 방 하나"만. subscribe가 올 때마다 요청 IP에서 구한 방으로 교체한다.
 *    마지막 방문 후 7일이 지나면 무효.
 *  - 비공개 방: 입장권 만료 시각까지 유효, 구독당 최대 10개.
 * 유효한 묶음이 하나도 없는 구독은 정리 때 지운다.
 *
 * 비공개 버킷에는 1일 수명 주기가 걸려 있다. 그래서 12시간마다 전체 레코드를 다시 써서 살려 둔다.
 * 서버가 하루 넘게 꺼져 있으면 레코드가 사라지지만, 클라이언트가 다음 방문에 다시 등록하므로 자가 복구된다.
 */
import { getR2Service, R2Service } from './r2Service';
import logger from '../utils/logger';

/** 푸시 서비스로 인정하는 호스트 접미사 (SSRF 방지: 서버가 임의의 주소로 요청을 보내지 않게 한다) */
export const PUSH_ENDPOINT_HOST_SUFFIXES = [
    'fcm.googleapis.com',
    'push.services.mozilla.com',
    'notify.windows.com',
    'push.apple.com',
] as const;
export const PUSH_ENDPOINT_MAX_LENGTH = 1000;
export const PUSH_P256DH_MAX_LENGTH = 200;
export const PUSH_AUTH_MAX_LENGTH = 100;
export const PUSH_PREFIX = '_push/';
export const PUSH_MAX_TOTAL = 5000;
export const PUSH_MAX_PRV_PER_SUB = 10;
export const PUSH_MAX_TARGETS_PER_ROOM = 20;
export const PUSH_IP_VALID_MS = 7 * 24 * 60 * 60 * 1000;
export const PUSH_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
export const PUSH_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** 변경이 없을 때 R2에 다시 쓰는 최소 간격 (subscribe는 앱을 열 때마다 온다) */
const PERSIST_MIN_INTERVAL_MS = 60 * 60 * 1000;

const PID_RE = /^[0-9a-f]{32}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export const isValidPid = (pid: unknown): pid is string => typeof pid === 'string' && PID_RE.test(pid);

/** 푸시 endpoint가 허용 목록의 https 주소인지. new URL()로 파싱한 hostname만 비교한다 */
export const isAllowedPushEndpoint = (endpoint: unknown): endpoint is string => {
    if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const host = url.hostname.toLowerCase();
    return PUSH_ENDPOINT_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
};

export const isValidPushKeys = (keys: unknown): keys is { p256dh: string; auth: string } => {
    if (!keys || typeof keys !== 'object') return false;
    const { p256dh, auth } = keys as Record<string, unknown>;
    return typeof p256dh === 'string' && p256dh.length > 0 && p256dh.length <= PUSH_P256DH_MAX_LENGTH && B64URL_RE.test(p256dh)
        && typeof auth === 'string' && auth.length > 0 && auth.length <= PUSH_AUTH_MAX_LENGTH && B64URL_RE.test(auth);
};

export type PushLang = 'ko' | 'en';
export const toPushLang = (lang: unknown): PushLang => (typeof lang === 'string' && /^ko\b/i.test(lang) ? 'ko' : 'en');

export interface PushRecord {
    pid: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    lang: PushLang;
    /** 가장 최근에 본 같은 네트워크 방. 없으면 null */
    ipRoomId: string | null;
    ipSeenAt: number;
    /** 비공개 방 묶음. exp는 입장권 만료 시각(ms) */
    prv: Array<{ roomId: string; exp: number }>;
    createdAt: number;
    updatedAt: number;
}

export interface PushPersistence {
    put(record: PushRecord): Promise<void>;
    remove(pid: string): Promise<void>;
    loadAll(): Promise<unknown[]>;
}

export interface SubscribeInput {
    pid: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    lang: PushLang;
    ipRoomId: string | null;
    /** verifyTicket를 통과한 입장권 (exp는 ms) */
    tickets: Array<{ roomId: string; exp: number }>;
}

export type SubscribeResult = { ok: true; prv: number } | { ok: false; code: 'PUSH_FULL' };

/** 저장된(또는 R2에서 읽은) 값을 검증해 레코드로. 형식이 어긋나면 null */
export const parsePushRecord = (raw: unknown): PushRecord | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isValidPid(r.pid) || !isAllowedPushEndpoint(r.endpoint) || !isValidPushKeys(r.keys)) return null;
    const prv = Array.isArray(r.prv)
        ? r.prv
            .filter((p): p is { roomId: string; exp: number } =>
                !!p && typeof (p as { roomId?: unknown }).roomId === 'string' && Number.isFinite((p as { exp?: unknown }).exp))
            .slice(0, PUSH_MAX_PRV_PER_SUB)
            .map((p) => ({ roomId: p.roomId, exp: p.exp }))
        : [];
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    return {
        pid: r.pid,
        endpoint: r.endpoint,
        keys: { p256dh: r.keys.p256dh, auth: r.keys.auth },
        lang: toPushLang(r.lang),
        ipRoomId: typeof r.ipRoomId === 'string' ? r.ipRoomId : null,
        ipSeenAt: num(r.ipSeenAt, 0),
        prv,
        createdAt: num(r.createdAt, 0),
        updatedAt: num(r.updatedAt, 0),
    };
};

export class PushStore {
    private records = new Map<string, PushRecord>();
    private byEndpoint = new Map<string, string>();
    private lastPersistAt = new Map<string, number>();
    private persistence: PushPersistence | null = null;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private now: () => number = Date.now,
        private readonly maxTotal: number = PUSH_MAX_TOTAL,
    ) {}

    setPersistence(p: PushPersistence | null): void { this.persistence = p; }
    setClock(now: () => number): void { this.now = now; }
    size(): number { return this.records.size; }
    get(pid: string): PushRecord | undefined { return this.records.get(pid); }

    /** 테스트용: 전부 비운다 */
    reset(): void {
        this.stop();
        this.records.clear();
        this.byEndpoint.clear();
        this.lastPersistAt.clear();
    }

    private ipValid(r: PushRecord, t: number): boolean {
        return r.ipRoomId !== null && t - r.ipSeenAt < PUSH_IP_VALID_MS;
    }
    private prvValid(r: PushRecord, t: number): Array<{ roomId: string; exp: number }> {
        return r.prv.filter((p) => p.exp > t);
    }
    private hasAnyBinding(r: PushRecord, t: number): boolean {
        return this.ipValid(r, t) || this.prvValid(r, t).length > 0;
    }

    private persist(record: PushRecord): void {
        const p = this.persistence;
        if (!p) return;
        this.lastPersistAt.set(record.pid, this.now());
        p.put(record).catch((error) => {
            // 엔드포인트·키는 남기지 않는다
            logger.error(`[Push] 구독 저장 실패 (${record.pid.slice(0, 6)}):`, error instanceof Error ? error.message : 'error');
        });
    }

    private drop(pid: string): boolean {
        const r = this.records.get(pid);
        if (!r) return false;
        this.records.delete(pid);
        if (this.byEndpoint.get(r.endpoint) === pid) this.byEndpoint.delete(r.endpoint);
        this.lastPersistAt.delete(pid);
        this.persistence?.remove(pid).catch((error) => {
            logger.error(`[Push] 구독 삭제 실패 (${pid.slice(0, 6)}):`, error instanceof Error ? error.message : 'error');
        });
        return true;
    }

    /** 구독을 만들거나 갱신한다. 같은 네트워크 방은 이번 요청의 방 하나로 교체된다 */
    subscribe(input: SubscribeInput): SubscribeResult {
        const t = this.now();
        const existing = this.records.get(input.pid);
        if (!existing && this.records.size >= this.maxTotal) {
            this.sweep();
            if (this.records.size >= this.maxTotal) return { ok: false, code: 'PUSH_FULL' };
        }
        // 같은 endpoint를 다른 pid로 다시 등록하면(저장소 초기화 등) 옛 레코드는 지운다
        const owner = this.byEndpoint.get(input.endpoint);
        if (owner && owner !== input.pid) this.drop(owner);
        if (existing && existing.endpoint !== input.endpoint && this.byEndpoint.get(existing.endpoint) === input.pid) {
            this.byEndpoint.delete(existing.endpoint);
        }

        const prv = input.tickets
            .filter((x) => x.exp > t)
            .slice(0, PUSH_MAX_PRV_PER_SUB)
            .map((x) => ({ roomId: x.roomId, exp: x.exp }));

        const next: PushRecord = {
            pid: input.pid,
            endpoint: input.endpoint,
            keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
            lang: input.lang,
            ipRoomId: input.ipRoomId ?? existing?.ipRoomId ?? null,
            ipSeenAt: input.ipRoomId ? t : existing?.ipSeenAt ?? 0,
            prv,
            createdAt: existing?.createdAt ?? t,
            updatedAt: t,
        };
        this.records.set(next.pid, next);
        this.byEndpoint.set(next.endpoint, next.pid);

        const changed = !existing
            || existing.endpoint !== next.endpoint
            || existing.keys.p256dh !== next.keys.p256dh
            || existing.keys.auth !== next.keys.auth
            || existing.lang !== next.lang
            || existing.ipRoomId !== next.ipRoomId
            || JSON.stringify(existing.prv) !== JSON.stringify(next.prv);
        if (changed || t - (this.lastPersistAt.get(next.pid) ?? 0) >= PERSIST_MIN_INTERVAL_MS) this.persist(next);
        return { ok: true, prv: prv.length };
    }

    /** pid와 endpoint가 모두 일치할 때만 지운다 */
    unsubscribe(pid: string, endpoint: string): boolean {
        const r = this.records.get(pid);
        if (!r || r.endpoint !== endpoint) return false;
        return this.drop(pid);
    }

    /** 푸시 서비스가 404/410으로 돌려준 구독 삭제 */
    removeByPid(pid: string): boolean { return this.drop(pid); }

    /** 이 방의 알림을 받을 구독들 (방당 상한 적용) */
    targetsFor(roomId: string, scope: 'ip' | 'prv'): PushRecord[] {
        const t = this.now();
        const out: PushRecord[] = [];
        for (const r of this.records.values()) {
            const match = scope === 'ip'
                ? r.ipRoomId === roomId && this.ipValid(r, t)
                : r.prv.some((p) => p.roomId === roomId && p.exp > t);
            if (!match) continue;
            out.push(r);
            if (out.length >= PUSH_MAX_TARGETS_PER_ROOM) break;
        }
        return out;
    }

    /** 만료된 묶음을 걷어내고, 유효한 묶음이 없는 구독을 지운다. 지운 수 반환 */
    sweep(): number {
        const t = this.now();
        let removed = 0;
        for (const r of [...this.records.values()]) {
            if (!this.hasAnyBinding(r, t)) {
                this.drop(r.pid);
                removed++;
                continue;
            }
            if (!this.ipValid(r, t) && r.ipRoomId !== null) r.ipRoomId = null;
            r.prv = this.prvValid(r, t);
        }
        return removed;
    }

    /** 모든 레코드를 R2에 다시 쓴다 (1일 수명 주기 대비) */
    async refreshAll(): Promise<number> {
        const p = this.persistence;
        if (!p) return 0;
        const t = this.now();
        let n = 0;
        for (const r of [...this.records.values()]) {
            if (!this.hasAnyBinding(r, t)) continue;
            try {
                await p.put(r);
                this.lastPersistAt.set(r.pid, t);
                n++;
            } catch (error) {
                logger.error(`[Push] 재기록 실패 (${r.pid.slice(0, 6)}):`, error instanceof Error ? error.message : 'error');
            }
        }
        return n;
    }

    /** 부팅 때 R2에서 읽어 되살린다. 검증을 통과한 것만 */
    async hydrate(): Promise<number> {
        const p = this.persistence;
        if (!p) return 0;
        const t = this.now();
        let n = 0;
        for (const raw of await p.loadAll()) {
            if (this.records.size >= this.maxTotal) break;
            const rec = parsePushRecord(raw);
            if (!rec || !this.hasAnyBinding(rec, t)) continue;
            this.records.set(rec.pid, rec);
            this.byEndpoint.set(rec.endpoint, rec.pid);
            this.lastPersistAt.set(rec.pid, t);
            n++;
        }
        return n;
    }

    /** 1시간마다 정리, 12시간마다 재기록 */
    start(): void {
        if (!this.sweepTimer) {
            this.sweepTimer = setInterval(() => { this.sweep(); }, PUSH_SWEEP_INTERVAL_MS);
            this.sweepTimer.unref?.();
        }
        if (!this.refreshTimer) {
            this.refreshTimer = setInterval(() => { void this.refreshAll(); }, PUSH_REFRESH_INTERVAL_MS);
            this.refreshTimer.unref?.();
        }
    }

    stop(): void {
        if (this.sweepTimer) clearInterval(this.sweepTimer);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.sweepTimer = null;
        this.refreshTimer = null;
    }
}

let singleton: PushStore | null = null;
export const getPushStore = (): PushStore => (singleton ??= new PushStore());

export const pushKey = (pid: string): string => `${PUSH_PREFIX}${pid}.json`;

/** 잠금 버킷이 설정돼 있을 때만 R2 서비스. 공개 버킷에는 절대 쓰지 않는다 */
const lockedR2 = (): R2Service | null => {
    try {
        const r2 = getR2Service();
        return r2.isLockedEnabled() ? r2 : null;
    } catch {
        return null; // R2 환경 변수 없음 (테스트·로컬): 메모리만 쓴다
    }
};

/** 비공개 버킷 `_push/<pid>.json`. 잠금 버킷이 없으면 아무것도 하지 않는다 */
export const r2PushPersistence: PushPersistence = {
    async put(record) {
        await lockedR2()?.putLockedJson(pushKey(record.pid), record);
    },
    async remove(pid) {
        await lockedR2()?.deleteLockedKeys([pushKey(pid)]);
    },
    async loadAll() {
        const r2 = lockedR2();
        if (!r2) return [];
        const keys = (await r2.listLockedKeys(PUSH_PREFIX)).slice(0, PUSH_MAX_TOTAL * 2);
        const out: unknown[] = [];
        for (const key of keys) {
            const value = await r2.getLockedJson(key).catch(() => null);
            if (value) out.push(value);
        }
        return out;
    },
};
