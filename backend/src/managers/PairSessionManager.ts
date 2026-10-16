import { randomBytes } from 'crypto';

export type PairState = 'invited' | 'accepted' | 'confirmed';

export interface PairSession {
    id: string;
    initiator: string;
    responder: string;
    state: PairState;
    /** socketId → same */
    confirms: Map<string, boolean>;
    expiresAt: number;
}

export type InviteErrorCode = 'TARGET_NOT_FOUND' | 'SELF' | 'COOLDOWN' | 'TOO_MANY' | 'BLOCKED' | 'ALREADY_PAIRED';

export const INVITE_TTL_MS = 60 * 1000;
export const CONFIRM_TTL_MS = 2 * 60 * 1000;
export const DECLINE_COOLDOWN_MS = 30 * 1000;
export const MAX_PENDING_INVITES = 3;

export interface InviteContext {
    /** 대상이 지금 접속 중(전체 방에 있음)인지 */
    targetConnected: boolean;
    /** 두 소켓이 이미 같은 비공개 방을 공유하는지 */
    alreadyPaired: boolean;
}

export type InviteResult = { ok: true; session: PairSession } | { ok: false; code: InviteErrorCode };

export type ConfirmResult =
    | { status: 'waiting'; session: PairSession }
    | { status: 'mismatch'; session: PairSession }
    | { status: 'done'; session: PairSession }
    | { status: 'invalid' };

/**
 * 1:1 연결 세션 관리 (메모리). 시계를 주입할 수 있고, 만료는 expireDue()를 주기적으로 불러 처리한다.
 * 소켓 통신은 모르고 상태·제한만 다룬다.
 */
export class PairSessionManager {
    private sessions = new Map<string, PairSession>();
    /** `${initiator}|${target}` → 쿨다운 끝 시각 */
    private cooldowns = new Map<string, number>();
    /** target → 차단한 initiator 소켓들 */
    private blocks = new Map<string, Set<string>>();

    constructor(private readonly now: () => number = Date.now) {}

    get(id: string): PairSession | undefined {
        return this.sessions.get(id);
    }

    size(): number {
        return this.sessions.size;
    }

    invite(initiator: string, target: string, ctx: InviteContext): InviteResult {
        if (initiator === target) return { ok: false, code: 'SELF' };
        if (!ctx.targetConnected) return { ok: false, code: 'TARGET_NOT_FOUND' };
        if (this.blocks.get(target)?.has(initiator)) return { ok: false, code: 'BLOCKED' };
        if (ctx.alreadyPaired) return { ok: false, code: 'ALREADY_PAIRED' };

        const key = `${initiator}|${target}`;
        const until = this.cooldowns.get(key);
        if (until !== undefined) {
            if (until > this.now()) return { ok: false, code: 'COOLDOWN' };
            this.cooldowns.delete(key);
        }

        let pending = 0;
        for (const s of this.sessions.values()) {
            if (s.initiator !== initiator) continue;
            // 같은 상대에게 이미 진행 중인 세션이 있으면 중복 요청으로 보고 막는다
            if (s.responder === target) return { ok: false, code: 'TOO_MANY' };
            if (s.state === 'invited') pending++;
        }
        if (pending >= MAX_PENDING_INVITES) return { ok: false, code: 'TOO_MANY' };

        const session: PairSession = {
            id: randomBytes(16).toString('hex'),
            initiator,
            responder: target,
            state: 'invited',
            confirms: new Map(),
            expiresAt: this.now() + INVITE_TTL_MS,
        };
        this.sessions.set(session.id, session);
        return { ok: true, session };
    }

    /** 대상의 응답. 세션이 없거나 대상이 아니거나 invited가 아니면 null */
    respond(sessionId: string, responder: string, accept: boolean, block = false): PairSession | null {
        const s = this.sessions.get(sessionId);
        if (!s || s.responder !== responder || s.state !== 'invited') return null;
        if (accept) {
            s.state = 'accepted';
            s.expiresAt = this.now() + CONFIRM_TTL_MS;
            return s;
        }
        this.sessions.delete(sessionId);
        this.cooldowns.set(`${s.initiator}|${s.responder}`, this.now() + DECLINE_COOLDOWN_MS);
        if (block) {
            let set = this.blocks.get(responder);
            if (!set) this.blocks.set(responder, (set = new Set()));
            set.add(s.initiator);
        }
        return s;
    }

    /** 멤버 여부 확인 후 세션 반환 */
    getForMember(sessionId: string, socketId: string): PairSession | undefined {
        const s = this.sessions.get(sessionId);
        return s && (s.initiator === socketId || s.responder === socketId) ? s : undefined;
    }

    /** 확인 버튼. invited/accepted 상태에서 유효(방 생성은 accepted일 때만). done/mismatch면 세션을 제거한다 */
    confirm(sessionId: string, socketId: string, same: boolean): ConfirmResult {
        const s = this.getForMember(sessionId, socketId);
        if (!s || (s.state !== 'accepted' && s.state !== 'invited')) return { status: 'invalid' };
        s.confirms.set(socketId, same);
        if (!same) {
            this.sessions.delete(sessionId);
            return { status: 'mismatch', session: s };
        }
        // 방 생성 조건: 두 사람 모두 same=true 이고 대상이 수락함(accepted)
        if (s.state === 'accepted' && s.confirms.get(s.initiator) === true && s.confirms.get(s.responder) === true) {
            s.state = 'confirmed';
            this.sessions.delete(sessionId);
            return { status: 'done', session: s };
        }
        return { status: 'waiting', session: s };
    }

    /** 멤버의 취소. 제거된 세션 반환 */
    cancel(sessionId: string, socketId: string): PairSession | null {
        const s = this.getForMember(sessionId, socketId);
        if (!s) return null;
        this.sessions.delete(sessionId);
        return s;
    }

    /** 소켓이 끝났을 때: 그 소켓이 낀 세션과 쿨다운·차단 기록 제거. 제거된 세션 반환 */
    removeBySocket(socketId: string): PairSession[] {
        const removed: PairSession[] = [];
        for (const s of this.sessions.values()) {
            if (s.initiator === socketId || s.responder === socketId) {
                this.sessions.delete(s.id);
                removed.push(s);
            }
        }
        this.blocks.delete(socketId);
        for (const set of this.blocks.values()) set.delete(socketId);
        for (const key of this.cooldowns.keys()) {
            if (key.startsWith(`${socketId}|`) || key.endsWith(`|${socketId}`)) this.cooldowns.delete(key);
        }
        return removed;
    }

    /** 만료된 세션 제거 후 반환 (오래된 쿨다운도 정리) */
    expireDue(): PairSession[] {
        const t = this.now();
        const expired: PairSession[] = [];
        for (const s of this.sessions.values()) {
            if (s.expiresAt <= t) {
                this.sessions.delete(s.id);
                expired.push(s);
            }
        }
        for (const [key, until] of this.cooldowns) {
            if (until <= t) this.cooldowns.delete(key);
        }
        return expired;
    }
}
