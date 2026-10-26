import { isPrivateRoomId } from './privateRoom';
import type { Sender } from './uploaderStore';
import logger from './logger';

/**
 * 텍스트 대기열: 받는 기기가 그 순간 없어도 10분 동안 방별로 보관했다가, 늦게 들어오거나
 * 새로고침한 기기가 목록(GET /api/texts/:roomId)으로 받아 가게 한다.
 *
 * 무엇을 어떻게 보관하는지는 범위와 사용자의 잠금 선택으로 정해진다.
 * - 1:1 비공개 방: 방 키로 암호화한 enc만 보관한다 (평문 content가 실린 메시지는 보관하지 않는다).
 * - 같은 네트워크·전체 공유, 잠금 꺼짐: 평문 content를 그대로 보관한다 (그 방 토큰을 가진 기기가 받는다).
 * - 같은 네트워크·전체 공유, 잠금 켜짐: 범위 비밀번호로 암호화한 텍스트만 보관한다.
 *   암호문은 비밀번호 확인값(verifier)을 맞힌 기기에만 준다(잠긴 파일과 같은 시도 제한).
 *   목록·실시간 중계에는 salt만 실어 오프라인 대입 공격 재료를 넘기지 않는다.
 * 평문 내용은 로그·에러 메시지에 남기지 않는다 (textId·roomId만 다룬다).
 *
 * 악용 방지: 방별 상한 안에서 보낸 쪽마다 몫(quota)을 둔다. 몫을 넘으면 그 보낸 쪽 자신의 가장 오래된
 * 보관분부터, 방이 가득 차면 가장 많이 가진 보낸 쪽의 것부터 밀어낸다.
 *
 * 메모리가 기준이고, 서버 재시작에 대비해 비공개(잠금) 버킷 `_texts/<roomId>/<textId>.json`에 따라 쓴다.
 * 만료는 서버가 강제한다: 목록·조회 때 만료분을 걸러 지우고, 주기 정리(sweep)로도 지운다.
 */

/** 보관 기간: 10분 */
export const TEXT_QUEUE_TTL_MS = 10 * 60 * 1000;
/** 방별 보관 개수 상한 */
export const TEXT_QUEUE_MAX_PER_ROOM = 20;
/** 같은 네트워크·전체 공유에서 보낸 쪽 하나가 한 방에 보관할 수 있는 개수 */
export const TEXT_QUEUE_SENDER_QUOTA = 5;
/** 1:1 방(멤버 둘)에서 보낸 쪽 하나의 몫: 방 상한의 절반 */
export const TEXT_QUEUE_PRIVATE_SENDER_QUOTA = TEXT_QUEUE_MAX_PER_ROOM / 2;
/** 보관 크기 상한: 평문 UTF-8 96KiB. 넘으면 보관하지 않고 실시간 전달만 한다 */
export const TEXT_QUEUE_MAX_BYTES = 96 * 1024;
/** 서버 전체 보관 상한(개수·바이트). 넘으면 새 텍스트는 보관하지 않는다 */
export const TEXT_QUEUE_MAX_TOTAL = 2000;
export const TEXT_QUEUE_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/** 주기 정리 간격 */
const SWEEP_INTERVAL_MS = 60 * 1000;

const B64URL = /^[A-Za-z0-9_-]+$/;
const b64Len = (bytes: number): number => Math.ceil((bytes * 4) / 3);
const isB64Exact = (v: unknown, bytes: number): v is string => typeof v === 'string' && v.length === b64Len(bytes) && B64URL.test(v);
const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** 암호문(base64url) 길이 상한: 평문 상한 + GCM 태그 16바이트 */
export const TEXT_QUEUE_MAX_CT_CHARS = b64Len(TEXT_QUEUE_MAX_BYTES + 16);

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

/** 보낸 쪽: 소켓 ID와 네트워크(IP를 HMAC한 IP 룸 ID). 클라이언트에 내려 주지 않는다 */
export interface TextOwner {
    sid: string;
    net: string;
}

export interface QueuedText {
    roomId: string;
    textId: string;
    timestamp: number;
    expiresAt: number;
    /** 암호문 (1:1 방, 잠금 켜진 공개 범위) */
    enc?: TextCipher;
    /** 평문 (잠금 꺼진 같은 네트워크·전체 공유만) */
    content?: string;
    lock?: TextLock;
    sender?: Sender;
    owner?: TextOwner;
}

/** 클라이언트에 보여 주는 형태 (text-shared 메시지와 같은 모양). 잠긴 텍스트는 enc 없이 salt만 */
export type PublicQueuedText = {
    type: 'text-shared';
    roomId: string;
    textId: string;
    timestamp: number;
    expiresAt: number;
    sender?: Sender;
} & ({ locked: true; lock: { salt: string } } | { enc: TextCipher } | { content: string });

/** 보관하지 않은 이유 (보낸 쪽에 알릴 만한 것만 의미가 있다) */
export type NotStoredReason = 'NOT_ELIGIBLE' | 'TOO_LARGE' | 'DUPLICATE' | 'FULL';

const isCipherShape = (v: unknown): v is TextCipher => {
    if (!v || typeof v !== 'object') return false;
    const e = v as Partial<TextCipher>;
    return e.v === 1 && isB64Exact(e.iv, 12) && typeof e.ct === 'string' && e.ct.length >= b64Len(16 + 1) && B64URL.test(e.ct);
};

export const isTextCipher = (v: unknown): v is TextCipher => isCipherShape(v) && v.ct.length <= TEXT_QUEUE_MAX_CT_CHARS;

const isPlain = (v: unknown): v is string =>
    typeof v === 'string' && v.trim().length > 0 && Buffer.byteLength(v, 'utf8') <= TEXT_QUEUE_MAX_BYTES;

const readLock = (v: unknown): TextLock | null => {
    if (!v || typeof v !== 'object') return null;
    const l = v as { v?: unknown; salt?: unknown; vh?: unknown; dh?: unknown };
    if (l.v !== undefined && l.v !== 1) return null;
    if (!isB64Exact(l.salt, 16) || !isHex64(l.vh)) return null;
    if (l.dh !== undefined && !isHex64(l.dh)) return null;
    return { salt: l.salt, vh: l.vh, ...(l.dh ? { dh: l.dh as string } : {}) };
};

const readOwner = (v: unknown): TextOwner | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const o = v as { sid?: unknown; net?: unknown };
    if (typeof o.sid !== 'string' || typeof o.net !== 'string' || o.sid.length > 64 || o.net.length > 120) return undefined;
    return { sid: o.sid, net: o.net };
};

/** 보관 바이트 수 (평문은 UTF-8, 암호문은 base64url 디코딩 크기) */
const bytesOf = (e: QueuedText): number =>
    e.content !== undefined ? Buffer.byteLength(e.content, 'utf8') : Math.floor(((e.enc?.ct.length ?? 0) * 3) / 4);

/**
 * publish 메시지에서 보관할 항목을 만든다. 보관 대상이 아니면 이유를 돌려준다.
 * - 1:1 방: 암호문만 (content가 있으면 보관하지 않음)
 * - 공개 범위: 잠금 켜짐(locked) → 암호문만, 잠금 꺼짐 → 평문 content만
 */
export function parseQueuedText(
    msg: unknown, roomId: string, now: number, sender?: Sender, owner?: TextOwner
): QueuedText | NotStoredReason {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return 'NOT_ELIGIBLE';
    const m = msg as Record<string, unknown>;
    if (m.type !== 'text-shared' || !isTextId(m.textId) || !isQueueRoomId(roomId)) return 'NOT_ELIGIBLE';
    // 메시지의 roomId가 실제 발행 대상과 다르면 보관하지 않는다
    if (m.roomId !== undefined && m.roomId !== roomId) return 'NOT_ELIGIBLE';

    const base = {
        roomId,
        textId: m.textId,
        timestamp: typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : now,
        expiresAt: now + TEXT_QUEUE_TTL_MS,
        ...(sender ? { sender } : {}),
        ...(owner ? { owner } : {}),
    };
    const cipherEntry = (): QueuedText | NotStoredReason => {
        if (!isCipherShape(m.enc)) return 'NOT_ELIGIBLE';
        if (m.enc.ct.length > TEXT_QUEUE_MAX_CT_CHARS) return 'TOO_LARGE';
        const { iv, ct } = m.enc;
        return { ...base, enc: { v: 1, iv, ct } };
    };

    // 평문과 암호문이 섞인 메시지는 어느 쪽으로도 보관하지 않는다
    const hasContent = 'content' in m;
    if (isPrivateRoomId(roomId)) return hasContent ? 'NOT_ELIGIBLE' : cipherEntry();
    if (m.locked === true) {
        if (hasContent) return 'NOT_ELIGIBLE';
        const lock = readLock(m.lock);
        if (!lock) return 'NOT_ELIGIBLE';
        const e = cipherEntry();
        return typeof e === 'string' ? e : { ...e, lock };
    }
    if (m.enc !== undefined || m.lock !== undefined || typeof m.content !== 'string' || !m.content.trim()) return 'NOT_ELIGIBLE';
    if (Buffer.byteLength(m.content, 'utf8') > TEXT_QUEUE_MAX_BYTES) return 'TOO_LARGE';
    return { ...base, content: m.content };
}

/** 보관 대상이면 항목, 아니면 null (이유가 필요 없을 때) */
export function queuedTextFromMessage(msg: unknown, roomId: string, now: number, sender?: Sender, owner?: TextOwner): QueuedText | null {
    const r = parseQueuedText(msg, roomId, now, sender, owner);
    return typeof r === 'string' ? null : r;
}

/** 저장소에서 읽은 항목 검증 (형식이 틀리면 null) */
export function readStoredText(raw: unknown): QueuedText | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<QueuedText>;
    if (!isQueueRoomId(r.roomId) || !isTextId(r.textId)) return null;
    if (typeof r.timestamp !== 'number' || typeof r.expiresAt !== 'number') return null;
    const lock = r.lock === undefined ? undefined : readLock(r.lock);
    if (lock === null) return null;
    const isPrv = isPrivateRoomId(r.roomId);
    let body: { enc: TextCipher } | { content: string };
    if (isTextCipher(r.enc) && r.content === undefined) {
        if (!isPrv && !lock) return null;
        body = { enc: { v: 1, iv: r.enc.iv, ct: r.enc.ct } };
    } else if (isPlain(r.content) && r.enc === undefined && !isPrv && !lock) {
        body = { content: r.content };
    } else {
        return null;
    }
    const owner = readOwner(r.owner);
    return {
        roomId: r.roomId,
        textId: r.textId,
        timestamp: r.timestamp,
        expiresAt: r.expiresAt,
        ...body,
        ...(lock ? { lock } : {}),
        ...(r.sender && typeof r.sender === 'object' ? { sender: r.sender } : {}),
        ...(owner ? { owner } : {}),
    };
}

/** 클라이언트에 보낼 형태. 잠긴 텍스트는 암호문·vh·dh를 빼고 salt만, 보낸 쪽(owner)은 항상 뺀다 */
export function toPublicText(e: QueuedText): PublicQueuedText {
    const base = {
        type: 'text-shared' as const,
        roomId: e.roomId,
        textId: e.textId,
        timestamp: e.timestamp,
        expiresAt: e.expiresAt,
        ...(e.sender ? { sender: e.sender } : {}),
    };
    if (e.lock) return { ...base, locked: true, lock: { salt: e.lock.salt } };
    if (e.content !== undefined) return { ...base, content: e.content };
    return { ...base, enc: e.enc! };
}

/**
 * 몫을 세는 단위. 같은 네트워크 방과 1:1 방에서는 소켓, 전체 공유처럼 여러 네트워크가 섞인 방에서는
 * 네트워크(IP) 단위로 센다 — 새로고침으로 소켓을 바꿔 몫을 늘리지 못하게 한다.
 */
const ownerKey = (e: QueuedText): string => {
    if (!e.owner) return `text:${e.textId}`;
    if (isPrivateRoomId(e.roomId) || e.owner.net === e.roomId) return `sid:${e.owner.sid}`;
    return `net:${e.owner.net}`;
};

const quotaFor = (roomId: string): number => (isPrivateRoomId(roomId) ? TEXT_QUEUE_PRIVATE_SENDER_QUOTA : TEXT_QUEUE_SENDER_QUOTA);

/** 영구 저장소 (서버 재시작 대비). 실패해도 메모리 동작은 계속된다 */
export interface TextQueueStore {
    put(entry: QueuedText): Promise<void>;
    remove(roomId: string, textIds: string[]): Promise<void>;
    loadAll(): Promise<unknown[]>;
}

export type AddResult =
    | { ok: true; entry: QueuedText; evicted: string[]; evictedOwn: string[] }
    | { ok: false; reason: 'DUPLICATE' | 'FULL' };

export type OfferResult =
    | { stored: true; entry: QueuedText; evictedOwn: string[] }
    | { stored: false; reason: NotStoredReason };

export class TextQueue {
    private rooms = new Map<string, QueuedText[]>();
    private totalBytes = 0;
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
        fn(this.store).catch((error) => logger.error('[TextQueue] 저장소 오류:', error instanceof Error ? error.name : 'unknown'));
    }

    private account(e: QueuedText, sign: 1 | -1): void {
        this.total += sign;
        this.totalBytes += sign * bytesOf(e);
    }

    /**
     * 밀어낼 항목을 고른다: 방이 가득 차면 가장 많이 가진 보낸 쪽(같으면 새 항목의 보낸 쪽, 그다음 가장 오래된 것을
     * 가진 쪽)의 가장 오래된 것. list는 오래된 순(만료 시각 순)이다.
     */
    private pickVictim(list: QueuedText[], incomingKey: string): QueuedText {
        const groups = new Map<string, QueuedText[]>();
        for (const e of list) {
            const k = ownerKey(e);
            groups.set(k, [...(groups.get(k) ?? []), e]);
        }
        let best: { key: string; items: QueuedText[] } | null = null;
        for (const [key, items] of groups) {
            if (!best || items.length > best.items.length) {
                best = { key, items };
            } else if (items.length === best.items.length) {
                const preferMine = key === incomingKey && best.key !== incomingKey;
                const older = best.key !== incomingKey && items[0].expiresAt < best.items[0].expiresAt;
                if (preferMine || older) best = { key, items };
            }
        }
        return best!.items[0];
    }

    /** 메모리에 넣는다 (저장소에는 쓰지 않음). 몫·방 상한을 넘으면 위 규칙대로 밀어낸다 */
    private insert(entry: QueuedText): AddResult {
        const list = this.rooms.get(entry.roomId) ?? [];
        if (list.some((e) => e.textId === entry.textId)) return { ok: false, reason: 'DUPLICATE' };
        if (this.total >= TEXT_QUEUE_MAX_TOTAL || this.totalBytes + bytesOf(entry) > TEXT_QUEUE_MAX_TOTAL_BYTES) {
            return { ok: false, reason: 'FULL' };
        }
        const key = ownerKey(entry);
        const evicted: string[] = [];
        const evictedOwn: string[] = [];
        const evict = (victim: QueuedText) => {
            list.splice(list.indexOf(victim), 1);
            this.account(victim, -1);
            evicted.push(victim.textId);
            if (ownerKey(victim) === key) evictedOwn.push(victim.textId);
        };
        list.sort((a, b) => a.expiresAt - b.expiresAt);
        // 1) 보낸 쪽 몫: 넘으면 자기 것 중 가장 오래된 것부터
        let mine = list.filter((e) => ownerKey(e) === key);
        while (mine.length >= quotaFor(entry.roomId)) {
            evict(mine[0]);
            mine = mine.slice(1);
        }
        // 2) 방 상한: 가장 많이 가진 보낸 쪽의 가장 오래된 것부터
        while (list.length >= TEXT_QUEUE_MAX_PER_ROOM) evict(this.pickVictim(list, key));

        list.push(entry);
        list.sort((a, b) => a.expiresAt - b.expiresAt);
        this.rooms.set(entry.roomId, list);
        this.account(entry, 1);
        return { ok: true, entry, evicted, evictedOwn };
    }

    /** 새 텍스트 보관 */
    add(entry: QueuedText): AddResult {
        this.purgeExpired(entry.roomId);
        const r = this.insert(entry);
        if (!r.ok) return r;
        this.persist((s) => s.put(entry));
        if (r.evicted.length > 0) {
            const ids = r.evicted;
            this.persist((s) => s.remove(entry.roomId, ids));
        }
        return r;
    }

    /** publish 메시지가 보관 대상이면 보관한다 */
    offer(msg: unknown, roomId: string, sender?: Sender, owner?: TextOwner): OfferResult {
        const parsed = parseQueuedText(msg, roomId, this.now(), sender, owner);
        if (typeof parsed === 'string') return { stored: false, reason: parsed };
        const r = this.add(parsed);
        return r.ok ? { stored: true, entry: r.entry, evictedOwn: r.evictedOwn } : { stored: false, reason: r.reason };
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
        const stale = new Map<string, string[]>();
        const mark = (roomId: string, ids: string[]) => stale.set(roomId, [...(stale.get(roomId) ?? []), ...ids]);
        const entries = raws.map(readStoredText).filter((e): e is QueuedText => !!e).sort((a, b) => a.expiresAt - b.expiresAt);
        let loaded = 0;
        for (const e of entries) {
            if (e.expiresAt <= now || e.expiresAt > now + TEXT_QUEUE_TTL_MS) {
                mark(e.roomId, [e.textId]);
                continue;
            }
            const r = this.insert(e);
            if (!r.ok) continue;
            loaded = loaded + 1 - r.evicted.length;
            if (r.evicted.length) mark(e.roomId, r.evicted);
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
        this.totalBytes = 0;
    }
}

let instance: TextQueue | null = null;

/** 서버 전체가 쓰는 대기열 */
export const getTextQueue = (): TextQueue => {
    if (!instance) instance = new TextQueue();
    return instance;
};
