/**
 * @file pushNotifier.ts
 * @description 파일·텍스트가 도착했을 때 탭이 닫힌 기기에 Web Push를 보낸다.
 *
 * - 전체 공유 방에는 부르지 않는다(호출하는 쪽에서 scope를 'ip' | 'prv'로만 넘긴다).
 * - 대상 = 그 방에 묶인 구독 - 지금 그 방에 소켓이 붙어 있는 기기 - 보낸 기기.
 * - 기기(pid)별로 4초 디바운스(최대 10초 대기), 같은 기기에는 20초에 1번까지. 그 사이 도착분은 개수로 합친다.
 * - 알림 내용에는 개수와 종류만 담는다. 파일 이름·텍스트·보낸 기기 이름·IP는 넣지 않는다.
 * - VAPID 키가 없으면 전부 no-op.
 */
import webpush from 'web-push';
import type { Server } from 'socket.io';
import { getPushStore, PushStore, PushLang, PushRecord } from './pushStore';
import logger from '../utils/logger';

export const PUSH_DEBOUNCE_MS = 4000;
export const PUSH_MAX_WAIT_MS = 10000;
export const PUSH_MIN_INTERVAL_MS = 20000;
export const PUSH_TTL_SEC = 3600;
const SEND_TIMEOUT_MS = 10000;
const LAST_SENT_PRUNE_AT = 2000;

export const isPushEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
    !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;

export interface PushPayload {
    v: 1;
    title: string;
    body: string;
    tag: string;
    target: string;
}

/** 알림 문구 (ko/en만. 그 외 언어는 en) */
export const buildPushBody = (lang: PushLang, files: number, text: boolean): string => {
    if (lang === 'ko') {
        if (files > 0 && text) return `새 파일 ${files}개와 텍스트가 도착했어요`;
        if (files > 0) return `새 파일 ${files}개가 도착했어요`;
        return '새 텍스트가 도착했어요';
    }
    if (files > 0 && text) return `${files} new file(s) and text arrived`;
    if (files > 0) return `${files} new file(s) arrived`;
    return 'New text arrived';
};

export interface ArrivalEvent {
    roomId: string;
    scope: 'ip' | 'prv';
    kind: 'file' | 'text';
    senderSocketId?: string;
}

export type PushSender = (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number; urgency: 'normal'; timeout: number },
) => Promise<unknown>;

interface Pending {
    files: number;
    text: boolean;
    target: string;
    rooms: Set<string>;
    firstAt: number;
    timer: ReturnType<typeof setTimeout> | null;
}

export interface PushNotifierOptions {
    store?: PushStore;
    send?: PushSender;
    enabled?: () => boolean;
    now?: () => number;
}

let vapidConfigured = false;
/** web-push에 VAPID를 한 번만 설정한다. 키가 잘못됐으면 false (값은 로그에 남기지 않는다) */
const configureVapid = (): boolean => {
    if (vapidConfigured) return true;
    try {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'https://www.clipboardapp.org',
            process.env.VAPID_PUBLIC_KEY as string,
            process.env.VAPID_PRIVATE_KEY as string,
        );
        vapidConfigured = true;
    } catch {
        logger.error('[Push] VAPID 설정 오류: 도착 알림을 보내지 않습니다');
    }
    return vapidConfigured;
};

const defaultSend: PushSender = (sub, payload, options) => {
    if (!configureVapid()) return Promise.reject(new Error('VAPID not configured'));
    return webpush.sendNotification(sub, payload, options);
};

export class PushNotifier {
    private io: Server | null = null;
    private pending = new Map<string, Pending>();
    private lastSent = new Map<string, number>();
    private readonly store: PushStore;
    private readonly send: PushSender;
    private readonly isEnabled: () => boolean;
    private readonly now: () => number;

    constructor(opts: PushNotifierOptions = {}) {
        this.store = opts.store ?? getPushStore();
        this.send = opts.send ?? defaultSend;
        this.isEnabled = opts.enabled ?? (() => isPushEnabled());
        this.now = opts.now ?? Date.now;
    }

    attachIo(io: Server): void { this.io = io; }

    /** 테스트용: 대기 중인 타이머와 기록을 비운다 */
    reset(): void {
        for (const p of this.pending.values()) if (p.timer) clearTimeout(p.timer);
        this.pending.clear();
        this.lastSent.clear();
    }

    /** 지금 그 방에 소켓이 붙어 있는 기기의 pid */
    private connectedPids(roomId: string): Set<string> {
        const out = new Set<string>();
        const io = this.io;
        if (!io) return out;
        const ids = io.sockets.adapter.rooms.get(roomId);
        if (!ids) return out;
        for (const id of ids) {
            const pid = io.sockets.sockets.get(id)?.data?.pushId;
            if (typeof pid === 'string') out.add(pid);
        }
        return out;
    }

    private pidOfSocket(socketId?: string): string | undefined {
        if (!socketId || !this.io) return undefined;
        const pid = this.io.sockets.sockets.get(socketId)?.data?.pushId;
        return typeof pid === 'string' ? pid : undefined;
    }

    notifyArrival(ev: ArrivalEvent): void {
        try {
            if (!this.isEnabled()) return;
            if (ev.scope !== 'ip' && ev.scope !== 'prv') return;
            const targets = this.store.targetsFor(ev.roomId, ev.scope);
            if (targets.length === 0) return;
            const skip = this.connectedPids(ev.roomId);
            const senderPid = this.pidOfSocket(ev.senderSocketId);
            if (senderPid) skip.add(senderPid);
            const target = ev.scope === 'ip' ? 'ip' : ev.roomId;
            for (const rec of targets) {
                if (skip.has(rec.pid)) continue;
                this.enqueue(rec.pid, ev.roomId, target, ev.kind);
            }
        } catch (error) {
            logger.error('[Push] 알림 대기열 오류:', error instanceof Error ? error.message : 'error');
        }
    }

    private enqueue(pid: string, roomId: string, target: string, kind: 'file' | 'text'): void {
        const t = this.now();
        let p = this.pending.get(pid);
        if (!p) {
            p = { files: 0, text: false, target, rooms: new Set(), firstAt: t, timer: null };
            this.pending.set(pid, p);
        }
        if (kind === 'file') p.files += 1; else p.text = true;
        p.target = target;
        p.rooms.add(roomId);
        this.schedule(pid, p);
    }

    private schedule(pid: string, p: Pending): void {
        const t = this.now();
        const debounced = Math.min(t + PUSH_DEBOUNCE_MS, p.firstAt + PUSH_MAX_WAIT_MS);
        const earliest = (this.lastSent.get(pid) ?? -Infinity) + PUSH_MIN_INTERVAL_MS;
        const fireAt = Math.max(debounced, earliest);
        if (p.timer) clearTimeout(p.timer);
        p.timer = setTimeout(() => { void this.flush(pid); }, Math.max(0, fireAt - t));
        p.timer.unref?.();
    }

    private async flush(pid: string): Promise<void> {
        const p = this.pending.get(pid);
        if (!p) return;
        this.pending.delete(pid);
        const rec = this.store.get(pid);
        if (!rec) return;
        // 그 사이 앱을 연 기기는 알림이 필요 없다
        for (const roomId of p.rooms) {
            if (this.connectedPids(roomId).has(pid)) return;
        }
        this.lastSent.set(pid, this.now());
        if (this.lastSent.size > LAST_SENT_PRUNE_AT) this.pruneLastSent();
        await this.deliver(rec, p);
    }

    private pruneLastSent(): void {
        const cutoff = this.now() - PUSH_MIN_INTERVAL_MS;
        for (const [pid, at] of this.lastSent) if (at < cutoff) this.lastSent.delete(pid);
    }

    private async deliver(rec: PushRecord, p: Pending): Promise<void> {
        const payload: PushPayload = {
            v: 1,
            title: 'Clipboard Share',
            body: buildPushBody(rec.lang, p.files, p.text),
            tag: 'cs-arrival',
            target: p.target,
        };
        try {
            await this.send(
                { endpoint: rec.endpoint, keys: rec.keys },
                JSON.stringify(payload),
                { TTL: PUSH_TTL_SEC, urgency: 'normal', timeout: SEND_TIMEOUT_MS },
            );
        } catch (error) {
            const status = (error as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) {
                this.store.removeByPid(rec.pid);
                return;
            }
            // 엔드포인트·키는 로그에 남기지 않는다
            logger.warn(`[Push] 발송 실패 (${rec.pid.slice(0, 6)}) status=${typeof status === 'number' ? status : 'n/a'}`);
        }
    }
}

let singleton: PushNotifier | null = null;
export const getPushNotifier = (): PushNotifier => (singleton ??= new PushNotifier());
