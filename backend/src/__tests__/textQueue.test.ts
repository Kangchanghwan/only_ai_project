import { randomBytes, createHash } from 'crypto';
import {
    TextQueue, TextQueueStore, QueuedText, TextOwner, queuedTextFromMessage, parseQueuedText, toPublicText, readStoredText,
    TEXT_QUEUE_TTL_MS, TEXT_QUEUE_MAX_PER_ROOM, TEXT_QUEUE_MAX_CT_CHARS, TEXT_QUEUE_MAX_BYTES, TEXT_QUEUE_SENDER_QUOTA,
} from '../utils/textQueue';
import { relayTextShared } from '../handlers/socketHandlers';

const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = () => ({ v: 1, iv: b64url(randomBytes(12)), ct: b64url(randomBytes(40)) });
const lockMeta = () => ({ v: 1, salt: b64url(randomBytes(16)), vh: createHash('sha256').update(randomBytes(32)).digest('hex') });
const PRV = 'prv-0123456789abcdef01234567';
const IP = 'room-abc123';
const GLOBAL = 'room-shared';

let seq = 0;
const lockedMsg = (roomId = IP, extra: object = {}) => ({
    type: 'text-shared', textId: `t-${++seq}`, roomId, timestamp: 1, locked: true, lock: lockMeta(), enc: enc(), ...extra,
});
const plainMsg = (roomId = IP, extra: object = {}) => ({ type: 'text-shared', textId: `c-${++seq}`, roomId, timestamp: 1, content: '안녕', ...extra });
const privateMsg = (extra: object = {}) => ({ type: 'text-shared', textId: `p-${++seq}`, roomId: PRV, timestamp: 1, enc: enc(), ...extra });

describe('parseQueuedText — 범위·잠금별 보관 정책', () => {
    test('1:1 방의 암호문 텍스트는 보관한다 (만료 = 지금 + 10분)', () => {
        const e = queuedTextFromMessage(privateMsg(), PRV, 1000);
        expect(e).not.toBeNull();
        expect(e!.expiresAt).toBe(1000 + TEXT_QUEUE_TTL_MS);
        expect(e!.content).toBeUndefined();
    });

    test('1:1 방에 평문 content가 실리면 보관하지 않는다', () => {
        expect(parseQueuedText(privateMsg({ content: '비밀' }), PRV, 0)).toBe('NOT_ELIGIBLE');
        expect(parseQueuedText({ type: 'text-shared', textId: 'x', content: 'hi', roomId: PRV }, PRV, 0)).toBe('NOT_ELIGIBLE');
    });

    test('같은 네트워크·전체 공유, 잠금 꺼짐: 평문 content를 그대로 보관한다', () => {
        expect(queuedTextFromMessage(plainMsg(IP), IP, 0)?.content).toBe('안녕');
        expect(queuedTextFromMessage(plainMsg(GLOBAL), GLOBAL, 0)?.content).toBe('안녕');
        expect(parseQueuedText(plainMsg(IP, { content: '   ' }), IP, 0)).toBe('NOT_ELIGIBLE');
    });

    test('잠금 켜짐: 잠금 정보가 있는 암호문만, 평문이 섞이면 보관하지 않는다', () => {
        expect(queuedTextFromMessage(lockedMsg(GLOBAL), GLOBAL, 0)?.lock?.salt).toBeTruthy();
        expect(parseQueuedText(lockedMsg(IP, { content: '비밀' }), IP, 0)).toBe('NOT_ELIGIBLE');
        expect(parseQueuedText(lockedMsg(IP, { lock: { salt: 'short', vh: 'zz' } }), IP, 0)).toBe('NOT_ELIGIBLE');
        // 잠금 표시 없이 암호문만 보낸 것도, 평문과 암호문을 같이 보낸 것도 보관하지 않는다
        const { locked: _l, lock: _k, ...cipherOnly } = lockedMsg();
        expect(parseQueuedText(cipherOnly, IP, 0)).toBe('NOT_ELIGIBLE');
        expect(parseQueuedText(plainMsg(IP, { enc: enc() }), IP, 0)).toBe('NOT_ELIGIBLE');
    });

    test('크기 상한(평문 UTF-8 96KiB)을 넘으면 TOO_LARGE, 상한까지는 보관', () => {
        expect(parseQueuedText(plainMsg(IP, { content: 'a'.repeat(TEXT_QUEUE_MAX_BYTES + 1) }), IP, 0)).toBe('TOO_LARGE');
        // 한글 3바이트: 글자 수가 아니라 바이트로 센다
        expect(parseQueuedText(plainMsg(IP, { content: '가'.repeat(Math.floor(TEXT_QUEUE_MAX_BYTES / 3) + 1) }), IP, 0)).toBe('TOO_LARGE');
        expect(queuedTextFromMessage(plainMsg(IP, { content: 'a'.repeat(TEXT_QUEUE_MAX_BYTES) }), IP, 0)).not.toBeNull();
        const big = { v: 1, iv: b64url(randomBytes(12)), ct: 'A'.repeat(TEXT_QUEUE_MAX_CT_CHARS + 1) };
        expect(parseQueuedText(privateMsg({ enc: big }), PRV, 0)).toBe('TOO_LARGE');
        expect(parseQueuedText(lockedMsg(IP, { enc: big }), IP, 0)).toBe('TOO_LARGE');
    });

    test('형식 오류(암호문·textId·roomId 불일치)는 보관하지 않는다', () => {
        expect(queuedTextFromMessage(privateMsg({ enc: { v: 1, iv: 'x', ct: 'y' } }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(privateMsg({ textId: '../evil' }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(privateMsg({ roomId: 'prv-ffffffffffffffffffffffff' }), PRV, 0)).toBeNull();
        expect(queuedTextFromMessage(plainMsg(IP, { roomId: 'room-other' }), IP, 0)).toBeNull();
        expect(queuedTextFromMessage({ type: 'file-uploaded', enc: enc() }, PRV, 0)).toBeNull();
    });
});

describe('toPublicText / relayTextShared — 클라이언트에 나가는 형태', () => {
    const owner: TextOwner = { sid: 'sock-1', net: 'room-net-1' };

    test('잠긴 텍스트는 암호문·vh·dh 없이 salt만 나간다', () => {
        const e = queuedTextFromMessage(lockedMsg(IP, { lock: { ...lockMeta(), dh: 'a'.repeat(64) } }), IP, 0)!;
        const pub = toPublicText(e) as Record<string, any>;
        expect(pub).toMatchObject({ type: 'text-shared', locked: true, lock: { salt: e.lock!.salt }, expiresAt: e.expiresAt });
        expect(pub.enc).toBeUndefined();
        expect(JSON.stringify(pub)).not.toContain(e.lock!.vh);
        expect(JSON.stringify(pub)).not.toContain(e.enc!.ct);
    });

    test('평문 텍스트는 content를, 1:1 방은 enc를 그대로 주고, 보낸 쪽(owner)은 내보내지 않는다', () => {
        const plain = queuedTextFromMessage(plainMsg(GLOBAL), GLOBAL, 0, undefined, owner)!;
        expect(toPublicText(plain)).toMatchObject({ content: '안녕' });
        expect(JSON.stringify(toPublicText(plain))).not.toContain(owner.net);
        const prv = queuedTextFromMessage(privateMsg(), PRV, 0, undefined, owner)!;
        expect((toPublicText(prv) as any).enc).toEqual(prv.enc);
        expect(JSON.stringify(toPublicText(prv))).not.toContain(owner.sid);
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
    const tick = () => { now += 1; };
    const ownerOf = (sid: string, net = IP): TextOwner => ({ sid, net });
    const ids = (roomId: string) => q.list(roomId).map((e) => e.textId);
    beforeEach(() => {
        now = 1_000_000;
        q = new TextQueue({ now: clock });
    });

    test('10분이 지나면 목록에서 빠지고 지워진다 (시계 주입)', () => {
        q.offer(plainMsg(), IP);
        now += TEXT_QUEUE_TTL_MS - 1;
        expect(q.list(IP)).toHaveLength(1);
        now += 1;
        expect(q.list(IP)).toHaveLength(0);
        expect(q.size()).toBe(0);
    });

    test('sweep은 모든 방의 만료분을 지운다', () => {
        q.offer(privateMsg(), PRV);
        q.offer(lockedMsg(), IP);
        q.offer(plainMsg(GLOBAL), GLOBAL);
        now += TEXT_QUEUE_TTL_MS;
        expect(q.sweep()).toBe(3);
        expect(q.size()).toBe(0);
    });

    test('보낸 쪽 몫(5개)을 넘으면 그 보낸 쪽 자신의 가장 오래된 것만 밀려나고 남의 것은 남는다', () => {
        const others = [plainMsg(), plainMsg()];
        others.forEach((m) => { q.offer(m, IP, undefined, ownerOf('victim')); tick(); });
        const mine: string[] = [];
        let evictedOwn: string[] = [];
        for (let i = 0; i < TEXT_QUEUE_SENDER_QUOTA + 3; i++) {
            const m = plainMsg();
            mine.push(m.textId);
            const r = q.offer(m, IP, undefined, ownerOf('spammer'));
            if (r.stored) evictedOwn = evictedOwn.concat(r.evictedOwn);
            tick();
        }
        expect(ids(IP)).toEqual([...others.map((m) => m.textId), ...mine.slice(3)]);
        expect(evictedOwn).toEqual(mine.slice(0, 3));
    });

    test('전체 공유는 네트워크 단위로 센다 (새로고침으로 소켓을 바꿔도 몫이 늘지 않는다)', () => {
        const victim = plainMsg(GLOBAL);
        q.offer(victim, GLOBAL, undefined, ownerOf('v', 'room-net-victim'));
        for (let i = 0; i < 8; i++) {
            q.offer(plainMsg(GLOBAL), GLOBAL, undefined, ownerOf(`spam-${i}`, 'room-net-spam'));
            tick();
        }
        const left = q.list(GLOBAL);
        expect(left.filter((e) => e.owner!.net === 'room-net-spam')).toHaveLength(TEXT_QUEUE_SENDER_QUOTA);
        expect(left.map((e) => e.textId)).toContain(victim.textId);
    });

    test('방이 가득 차면 가장 많이 가진 보낸 쪽의 가장 오래된 것부터 밀어낸다', () => {
        // 보낸 쪽 a는 5개, b~e는 3~4개 → 합 20
        const plan: Array<[string, number]> = [['a', 5], ['b', 4], ['c', 4], ['d', 4], ['e', 3]];
        const first: Record<string, string> = {};
        for (const [sid, n] of plan) {
            for (let i = 0; i < n; i++) {
                const m = plainMsg();
                if (i === 0) first[sid] = m.textId;
                q.offer(m, IP, undefined, ownerOf(sid));
                tick();
            }
        }
        expect(q.list(IP)).toHaveLength(TEXT_QUEUE_MAX_PER_ROOM);
        const r = q.offer(plainMsg(), IP, undefined, ownerOf('newcomer'));
        expect(r.stored && r.evictedOwn).toEqual([]);
        const left = ids(IP);
        expect(left).toHaveLength(TEXT_QUEUE_MAX_PER_ROOM);
        expect(left).not.toContain(first.a);
        for (const sid of ['b', 'c', 'd', 'e']) expect(left).toContain(first[sid]);
    });

    test('같은 textId는 덮어쓰지 않는다', () => {
        const m = privateMsg();
        expect(q.offer(m, PRV).stored).toBe(true);
        expect(q.offer({ ...m, enc: enc() }, PRV)).toEqual({ stored: false, reason: 'DUPLICATE' });
        expect(q.list(PRV)[0].enc).toEqual(m.enc);
    });

    test('저장소에 쓰고 지우며, hydrate는 만료분을 빼고 복원한다 (평문 포함)', async () => {
        const saved = new Map<string, QueuedText>();
        const removed: string[] = [];
        const store: TextQueueStore = {
            put: async (e) => { saved.set(e.textId, e); },
            remove: async (_r, list) => { list.forEach((id) => { removed.push(id); saved.delete(id); }); },
            loadAll: async () => [...saved.values()],
        };
        const q1 = new TextQueue({ now: clock, store });
        const a = q1.offer(privateMsg(), PRV);
        now += 60_000;
        const b = q1.offer(plainMsg(), IP, undefined, ownerOf('s'));
        await Promise.resolve();
        if (!a.stored || !b.stored) throw new Error('not stored');
        expect([...saved.keys()].sort()).toEqual([a.entry.textId, b.entry.textId].sort());

        // 재시작: a는 만료, b는 남아 있음
        now = a.entry.expiresAt;
        const q2 = new TextQueue({ now: clock, store });
        expect(await q2.hydrate()).toBe(1);
        expect(q2.list(IP)).toEqual([expect.objectContaining({ textId: b.entry.textId, content: '안녕', owner: { sid: 's', net: IP } })]);
        await Promise.resolve();
        expect(removed).toContain(a.entry.textId);
    });

    test('저장 형식 검증: 잠금 없는 암호문 공개 항목·1:1 방 평문·평문+암호문 혼합은 버린다', () => {
        const e = queuedTextFromMessage(lockedMsg(), IP, 0)!;
        const { lock: _l, ...noLock } = e;
        expect(readStoredText(noLock)).toBeNull();
        expect(readStoredText({ ...e, content: 'x' })).toBeNull();
        expect(readStoredText({ roomId: PRV, textId: 'x', timestamp: 1, expiresAt: 2, content: '평문' })).toBeNull();
        expect(readStoredText({ roomId: IP, textId: 'x', timestamp: 1, expiresAt: 2, content: '평문' })?.content).toBe('평문');
    });
});
