import { isPrivateRoomId } from './privateRoom';
import type { Sender } from './uploaderStore';
import logger from './logger';

/**
 * 텍스트 대기열: 받는 기기가 그 순간 없어도 10분 동안 방별로 보관했다가, 늦게 들어오거나
 * 새로고침한 기기가 목록(GET /api/texts/:roomId)으로 받아 가게 한다.
 *
 * 서버는 암호문만 보관한다. 평문 content가 실린 메시지는 절대 보관하지 않는다.
 * - 1:1 비공개 방: 방 키로 암호화한 enc를 보관한다 (방 멤버만 방 토큰을 받는다).
 * - 같은 네트워크·전체 공유: 그 범위의 비밀번호 잠금으로 암호화한 텍스트만 보관한다.
 *   암호문은 비밀번호 확인값(verifier)을 맞힌 기기에만 준다(잠긴 파일과 같은 시도 제한).
 *   목록·실시간 중계에는 salt만 실어 오프라인 대입 공격 재료를 넘기지 않는다.
 *
 * 메모리가 기준이고, 서버 재시작에 대비해 비공개(잠금) 버킷 `_texts/<roomId>/<textId>.json`에 따라 쓴다.
 * 만료는 서버가 강제한다: 목록·조회 때 만료분을 걸러 지우고, 주기 정리(sweep)로도 지운다.
 */

/** 보관 기간: 10분 */
export const TEXT_QUEUE_TTL_MS = 10 * 60 * 1000;
/** 방별 보관 개수 상한. 넘으면 그 방의 가장 오래된 것부터 밀어낸다 */
export const TEXT_QUEUE_MAX_PER_ROOM = 20;
/** 암호문(base64url) 길이 상한 ≈ 96KiB. 넘으면 보관하지 않고 실시간 전달만 한다 */
export const TEXT_QUEUE_MAX_CT_CHARS = 128 * 1024;
/** 서버 전체 보관 상한(개수·암호문 글자 수). 넘으면 새 텍스트는 보관하지 않는다 */
export const TEXT_QUEUE_MAX_TOTAL = 2000;
export const TEXT_QUEUE_MAX_TOTAL_CHARS = 32 * 1024 * 1024;
/** 주기 정리 간격 */
const SWEEP_INTERVAL_MS = 60 * 1000;

const B64URL = /^[A-Za-z0-9_-]+$/;
const b64Len = (bytes: number): number => Math.ceil((bytes * 4) / 3);
const isB64Exact = (v: unknown, bytes: number): v is string => typeof v === 'string' && v.length === b64Len(bytes) && B64URL.test(v);
const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** 클라이언트가 만드는 textId (`${Date.now()}-${random}`). 객체 키에 들어가므로 문자를 제한한다 */
export const isTextId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
/** 객체 키에 들어가므로 하위 경로(`/`)를 막는다 */
export const isQueueRoomId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(v);

/** AES-GCM 텍스트 암호문 {v:1, iv(12B), ct(태그 16B + 평문)} */
export interface TextCipher {
    v: 1;
    iv: string;
    ct: string;
}

/** 범위 잠금 정보. vh·dh는 서버만 보고 클라이언트에 돌려주지 않는다 */
export interface TextLock {
    salt: string;
    vh: string;
    dh?: string;
}

export interface QueuedText {
    roomId: string;
    textId: string;
    timestamp: number;
    expiresAt: number;
    enc: TextCipher;
    lock?: TextLock;
    sender?: Sender;
}

/** 클라이언트에 보여 주는 형태 (text-shared 메시지와 같은 모양). 잠긴 텍스트는 enc 없이 salt만 */
export type PublicQueuedText = {
    type: 'text-shared';
    roomId: string;
    textId: string;
    timestamp: number;
    expiresAt: number;
    sender?: Sender;
} & ({ locked: true; lock: { salt: string } } | { enc: TextCipher });

export const isTextCipher = (v: unknown): v is TextCipher => {
    if (!v || typeof v !== 'object') return false;
    const e = v as Partial<TextCipher>;
    return e.v === 1 &&
        isB64Exact(e.iv, 12) &&
        typeof e.ct === 'string' && e.ct.length >= b64Len(16 + 1) && e.ct.length <= TEXT_QUEUE_MAX_CT_CHARS && B64URL.test(e.ct);
};

const readLock = (v: unknown): TextLock | null => {
    if (!v || typeof v !== 'object') return null;
    const l = v as { v?: unknown; salt?: unknown; vh?: unknown; dh?: unknown };
    if (l.v !== undefined && l.v !== 1) return null;
    if (!isB64Exact(l.salt, 16) || !isHex64(l.vh)) return null;
    if (l.dh !== undefined && !isHex64(l.dh)) return null;
    return { salt: l.salt, vh: l.vh, ...(l.dh ? { dh: l.dh as string } : {}) };
};

/**
 * publish 메시지에서 보관할 항목을 만든다. 보관 대상이 아니면 null.
 * 평문 content가 있으면(값이 무엇이든) 보관하지 않는다.
 */
export function queuedTextFromMessage(msg: unknown, roomId: string, now: number, sender?: Sender): QueuedText | null {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
    const m = msg as Record<string, unknown>;
    if (m.type !== 'text-shared') return null;
    if ('content' in m) return null;
    if (!isTextId(m.textId) || !isTextCipher(m.enc) || !isQueueRoomId(roomId)) return null;
    // 메시지의 roomId가 실제 발행 대상과 다르면 보관하지 않는다
    if (m.roomId !== undefined && m.roomId !== roomId) return null;
    let lock: TextLock | undefined;
    if (!isPrivateRoomId(roomId)) {
        // 같은 네트워크·전체 공유는 범위 잠금으로 암호화한 텍스트만
        if (m.locked !== true) return null;
        const l = readLock(m.lock);
        if (!l) return null;
        lock = l;
    }
    const { v, iv, ct } = m.enc as TextCipher;
    return {
        roomId,
        textId: m.textId,
        timestamp: typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : now,
        expiresAt: now + TEXT_QUEUE_TTL_MS,
        enc: { v, iv, ct },
        ...(lock ? { lock } : {}),
        ...(sender ? { sender } : {}),
    };
}

/** 저장소에서 읽은 항목 검증 (형식이 틀리면 null) */
export function readStoredText(raw: unknown): QueuedText | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<QueuedText>;
    if (!isQueueRoomId(r.roomId) || !isTextId(r.textId) || !isTextCipher(r.enc)) return null;
    if (typeof r.timestamp !== 'number' || typeof r.expiresAt !== 'number') return null;
    const lock = r.lock === undefined ? undefined : readLock(r.lock);
    if (lock === null) return null;
    if (!isPrivateRoomId(r.roomId) && !lock) return null;
    return {
        roomId: r.roomId,
        textId: r.textId,
        timestamp: r.timestamp,
        expiresAt: r.expiresAt,
        enc: { v: 1, iv: r.enc.iv, ct: r.enc.ct },
        ...(lock ? { lock } : {}),
        ...(r.sender && typeof r.sender === 'object' ? { sender: r.sender } : {}),
    };
}

/** 클라이언트에 보낼 형태. 잠긴 텍스트는 암호문·vh·dh를 빼고 salt만 */
export function toPublicText(e: QueuedText): PublicQueuedText {
    const base = {
        type: 'text-shared' as const,
        roomId: e.roomId,
        textId: e.textId,
        timestamp: e.timestamp,
        expiresAt: e.expiresAt,
        ...(e.sender ? { sender: e.sender } : {}),
    };
    return e.lock ? { ...base, locked: true, lock: { salt: e.lock.salt } } : { ...base, enc: e.enc };
}

/** 영구 저장소 (서버 재시작 대비). 실패해도 메모리 동작은 계속된다 */
export interface TextQueueStore {
    put(entry: QueuedText): Promise<void>;
    remove(roomId: string, textIds: string[]): Promise<void>;
    loadAll(): Promise<unknown[]>;
}

export type AddResult = { ok: true; entry: QueuedText } | { ok: false; reason: 'DUPLICATE' | 'FULL' };

export class TextQueue {
    private rooms = new Map<string, QueuedText[]>();
    private totalChars = 0;
    private total = 0;
    private now: () => number;
    private store: TextQueueStore | null;
    private sweeper: ReturnType<typeof setInterval> | null = null;

    constructor(opts: { now?: () => number; store?: TextQueueStore | null } = {}) {
        this.now = opts.now ?? Date.now;
        this.store = opts.store ?? null;
    }

    /** 테스트용 시계 주입 */
    setClock(now: () => number): void {
        this.now = now;
    }

    setStore(store: TextQueueStore | null): void {
        this.store = store;
    }

    clock(): number {
        return this.now();
    }

    private persist(fn: (s: TextQueueStore) => Promise<void>): void {
        if (!this.store) return;
        fn(this.store).catch((error) => logger.error('[TextQueue] 저장소 오류:', error instanceof Error ? error.message : error));
    }

    /** 메모리에 넣는다 (저장소에는 쓰지 않음). 방별 상한을 넘으면 가장 오래된 것을 밀어낸다 */
    private insert(entry: QueuedText): AddResult & { evicted?: string[] } {
        const list = this.rooms.get(entry.roomId) ?? [];
        if (list.some((e) => e.textId === entry.textId)) return { ok: false, reason: 'DUPLICATE' };
        const chars = entry.enc.ct.length;
        if (this.total >= TEXT_QUEUE_MAX_TOTAL || this.totalChars + chars > TEXT_QUEUE_MAX_TOTAL_CHARS) {
            return { ok: false, reason: 'FULL' };
        }
        list.push(entry);
        list.sort((a, b) => a.expiresAt - b.expiresAt);
        const evicted: string[] = [];
        while (list.length > TEXT_QUEUE_MAX_PER_ROOM) {
            const old = list.shift()!;
            this.account(old, -1);
            evicted.push(old.textId);
        }
        this.rooms.set(entry.roomId, list);
        this.account(entry, 1);
        return { ok: true, entry, evicted };
    }

    private account(e: QueuedText, sign: 1 | -1): void {
        this.total += sign;
        this.totalChars += sign * e.enc.ct.length;
    }

    /** 새 텍스트 보관 */
    add(entry: QueuedText): AddResult {
        this.purgeExpired(entry.roomId);
        const r = this.insert(entry);
        if (!r.ok) return r;
        this.persist((s) => s.put(entry));
        if (r.evicted && r.evicted.length > 0) {
            const ids = r.evicted;
            this.persist((s) => s.remove(entry.roomId, ids));
        }
        return { ok: true, entry };
    }

    /** publish 메시지가 보관 대상이면 보관하고 항목을 돌려준다 */
    offer(msg: unknown, roomId: string, sender?: Sender): QueuedText | null {
        const entry = queuedTextFromMessage(msg, roomId, this.now(), sender);
        if (!entry) return null;
        const r = this.add(entry);
        return r.ok ? r.entry : null;
    }

    /** 방의 만료분을 지운다 */
    private purgeExpired(roomId: string): void {
        const list = this.rooms.get(roomId);
        if (!list) return;
        const now = this.now();
        const expired = list.filter((e) => e.expiresAt <= now);
        if (expired.length === 0) return;
        this.drop(roomId, expired.map((e) => e.textId));
    }

    /** 메모리·저장소에서 지운다. 실제로 지운 textId 목록 */
    private drop(roomId: string, textIds: string[]): string[] {
        const list = this.rooms.get(roomId);
        if (!list || textIds.length === 0) return [];
        const target = new Set(textIds);
        const removed: string[] = [];
        const kept = list.filter((e) => {
            if (!target.has(e.textId)) return true;
            this.account(e, -1);
            removed.push(e.textId);
            return false;
        });
        if (kept.length > 0) this.rooms.set(roomId, kept);
        else this.rooms.delete(roomId);
        if (removed.length > 0) this.persist((s) => s.remove(roomId, removed));
        return removed;
    }

    /** 방의 보관 중 텍스트 (만료분은 지우고 오래된 순) */
    list(roomId: string): QueuedText[] {
        this.purgeExpired(roomId);
        return [...(this.rooms.get(roomId) ?? [])];
    }

    get(roomId: string, textId: string): QueuedText | undefined {
        return this.list(roomId).find((e) => e.textId === textId);
    }

    remove(roomId: string, textIds: string[]): string[] {
        return this.drop(roomId, textIds);
    }

    /** 모든 방의 만료분 정리. 지운 개수 */
    sweep(): number {
        let n = 0;
        const now = this.now();
        for (const [roomId, list] of [...this.rooms]) {
            const expired = list.filter((e) => e.expiresAt <= now).map((e) => e.textId);
            n += this.drop(roomId, expired).length;
        }
        return n;
    }

    startSweeper(): void {
        if (this.sweeper) return;
        this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
        this.sweeper.unref();
    }

    /** 서버 시작 시 저장소에서 다시 채운다. 만료·형식 오류분은 저장소에서도 지운다 */
    async hydrate(): Promise<number> {
        if (!this.store) return 0;
        const raws = await this.store.loadAll();
        const now = this.now();
        let loaded = 0;
        const stale = new Map<string, string[]>();
        for (const raw of raws) {
            const e = readStoredText(raw);
            if (!e) continue;
            if (e.expiresAt <= now || e.expiresAt > now + TEXT_QUEUE_TTL_MS) {
                stale.set(e.roomId, [...(stale.get(e.roomId) ?? []), e.textId]);
                continue;
            }
            const r = this.insert(e);
            if (r.ok) loaded++;
            if (r.ok && r.evicted?.length) stale.set(e.roomId, [...(stale.get(e.roomId) ?? []), ...r.evicted]);
        }
        for (const [roomId, ids] of stale) this.persist((s) => s.remove(roomId, ids));
        return loaded;
    }

    size(): number {
        return this.total;
    }

    /** 테스트용 초기화 (저장소는 건드리지 않는다) */
    reset(): void {
        this.rooms.clear();
        this.total = 0;
        this.totalChars = 0;
    }
}

let instance: TextQueue | null = null;

/** 서버 전체가 쓰는 대기열 */
export const getTextQueue = (): TextQueue => {
    if (!instance) instance = new TextQueue();
    return instance;
};
