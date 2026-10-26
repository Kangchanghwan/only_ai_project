import { randomBytes, createHash } from 'crypto';
import {
    TextQueue, TextQueueStore, QueuedText, queuedTextFromMessage, toPublicText, readStoredText,
    TEXT_QUEUE_TTL_MS, TEXT_QUEUE_MAX_PER_ROOM, TEXT_QUEUE_MAX_CT_CHARS,
} from '../utils/textQueue';
import { relayTextShared } from '../handlers/socketHandlers';

const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = () => ({ v: 1, iv: b64url(randomBytes(12)), ct: b64url(randomBytes(40)) });
const lockMeta = () => ({ v: 1, salt: b64url(randomBytes(16)), vh: createHash('sha256').update(randomBytes(32)).digest('hex') });
const PRV = 'prv-0123456789abcdef01234567';
const IP = 'room-abc123';

let seq = 0;
const lockedMsg = (roomId = IP, extra: object = {}) => ({
    type: 'text-shared', textId: `t-${++seq}`, roomId, timestamp: 1, locked: true, lock: lockMeta(), enc: enc(), ...extra,
});
const privateMsg = (extra: object = {}) => ({ type: 'text-shared', textId: `p-${++seq}`, roomId: PRV, timestamp: 1, enc: enc(), ...extra });

describe('queuedTextFromMessage — 보관 대상 판별', () => {
    test('1:1 방의 암호문 텍스트는 보관한다 (만료 = 지금 + 10분)', () => {
        const e = queuedTextFromMessage(privateMsg(), PRV, 1000);
        expect(e).not.toBeNull();
        expect(e!.expiresAt).toBe(1000 + TEXT_QUEUE_TTL_MS);
        expect(e!.lock).toBeUndefined();
    });

    test('평문 content가 있으면 어느 범위든 보관하지 않는다', () => {
        expect(queuedTextFromMessage(privateMsg({ content: '비밀' }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(lockedMsg(IP, { content: '비밀' }), IP, 0)).toBeNull();
        expect(queuedTextFromMessage(lockedMsg(IP, { content: '' }), IP, 0)).toBeNull();
        expect(queuedTextFromMessage({ type: 'text-shared', textId: 'x', content: 'hi', roomId: IP }, IP, 0)).toBeNull();
    });

    test('같은 네트워크·전체 공유는 범위 잠금 정보가 있는 암호문만 보관한다', () => {
        const { locked: _l, lock: _k, ...unlocked } = lockedMsg();
        expect(queuedTextFromMessage(unlocked, IP, 0)).toBeNull();
        expect(queuedTextFromMessage(lockedMsg('room-shared'), 'room-shared', 0)?.lock?.salt).toBeTruthy();
        expect(queuedTextFromMessage(lockedMsg(IP, { lock: { salt: 'short', vh: 'zz' } }), IP, 0)).toBeNull();
    });

    test('형식 오류(암호문·textId·roomId 불일치·크기 초과)는 보관하지 않는다', () => {
        expect(queuedTextFromMessage(privateMsg({ enc: { v: 1, iv: 'x', ct: 'y' } }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(privateMsg({ textId: '../evil' }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(privateMsg({ roomId: 'prv-ffffffffffffffffffffffff' }), PRV, 0)).toBeNull();
        const big = { v: 1, iv: b64url(randomBytes(12)), ct: 'A'.repeat(TEXT_QUEUE_MAX_CT_CHARS + 1) };
        expect(queuedTextFromMessage(privateMsg({ enc: big }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage({ type: 'file-uploaded', enc: enc() }, PRV, 0)).toBeNull();
    });
});

describe('toPublicText / relayTextShared — 클라이언트에 나가는 형태', () => {
    test('잠긴 텍스트는 암호문·vh·dh 없이 salt만 나간다', () => {
        const e = queuedTextFromMessage(lockedMsg(IP, { lock: { ...lockMeta(), dh: 'a'.repeat(64) } }), IP, 0)!;
        const pub = toPublicText(e) as Record<string, any>;
        expect(pub).toMatchObject({ type: 'text-shared', locked: true, lock: { salt: e.lock!.salt }, expiresAt: e.expiresAt });
        expect(pub.enc).toBeUndefined();
        expect(JSON.stringify(pub)).not.toContain(e.lock!.vh);
        expect(JSON.stringify(pub)).not.toContain(e.enc.ct);
    });

    test('1:1 방 텍스트는 암호문(enc)을 그대로 준다', () => {
        const e = queuedTextFromMessage(privateMsg(), PRV, 0)!;
        expect((toPublicText(e) as any).enc).toEqual(e.enc);
    });

    test('보관하지 않은 잠긴 텍스트 중계에서도 vh·dh는 빠진다', () => {
        const msg = lockedMsg(IP, { lock: { ...lockMeta(), dh: 'b'.repeat(64) } });
        const out = relayTextShared(msg, null) as any;
        expect(out.lock).toEqual({ salt: msg.lock.salt });
        expect(out.enc).toEqual(msg.enc);
    });
});

describe('TextQueue', () => {
    let now = 1_000_000;
    const clock = () => now;
    let q: TextQueue;
    beforeEach(() => {
        now = 1_000_000;
        q = new TextQueue({ now: clock });
    });

    test('10분이 지나면 목록에서 빠지고 지워진다 (시계 주입)', () => {
        q.offer(privateMsg(), PRV);
        now += TEXT_QUEUE_TTL_MS - 1;
        expect(q.list(PRV)).toHaveLength(1);
        now += 1;
        expect(q.list(PRV)).toHaveLength(0);
        expect(q.size()).toBe(0);
    });

    test('sweep은 모든 방의 만료분을 지운다', () => {
        q.offer(privateMsg(), PRV);
        q.offer(lockedMsg(), IP);
        now += TEXT_QUEUE_TTL_MS;
        expect(q.sweep()).toBe(2);
        expect(q.size()).toBe(0);
    });

    test('방별 상한을 넘으면 가장 오래된 것부터 밀어낸다', () => {
        const ids: string[] = [];
        for (let i = 0; i < TEXT_QUEUE_MAX_PER_ROOM + 2; i++) {
            const m = privateMsg();
            ids.push(m.textId);
            q.offer(m, PRV);
            now += 1;
        }
        const left = q.list(PRV).map((e) => e.textId);
        expect(left).toHaveLength(TEXT_QUEUE_MAX_PER_ROOM);
        expect(left).toEqual(ids.slice(2));
    });

    test('같은 textId는 덮어쓰지 않는다', () => {
        const m = privateMsg();
        expect(q.offer(m, PRV)).not.toBeNull();
        expect(q.offer({ ...m, enc: enc() }, PRV)).toBeNull();
        expect(q.list(PRV)[0].enc).toEqual(m.enc);
    });

    test('저장소에 쓰고 지우며, hydrate는 만료분을 빼고 복원한다', async () => {
        const saved = new Map<string, QueuedText>();
        const removed: string[] = [];
        const store: TextQueueStore = {
            put: async (e) => { saved.set(e.textId, e); },
            remove: async (_r, ids) => { ids.forEach((id) => { removed.push(id); saved.delete(id); }); },
            loadAll: async () => [...saved.values()],
        };
        const q1 = new TextQueue({ now: clock, store });
        const a = q1.offer(privateMsg(), PRV)!;
        now += 60_000;
        const b = q1.offer(lockedMsg(), IP)!;
        await Promise.resolve();
        expect([...saved.keys()].sort()).toEqual([a.textId, b.textId].sort());

        // 재시작: a는 만료, b는 남아 있음
        now = a.expiresAt;
        const q2 = new TextQueue({ now: clock, store });
        expect(await q2.hydrate()).toBe(1);
        expect(q2.list(IP).map((e) => e.textId)).toEqual([b.textId]);
        await Promise.resolve();
        expect(removed).toContain(a.textId);
    });

    test('저장 형식 검증: 잠금 없는 공개 범위 항목은 버린다', () => {
        const e = queuedTextFromMessage(lockedMsg(), IP, 0)!;
        const { lock: _l, ...noLock } = e;
        expect(readStoredText(noLock)).toBeNull();
        expect(readStoredText({ ...e, content: 'x' })).not.toHaveProperty('content');
    });
});
