import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { createHash, randomBytes } from 'crypto';
import { getTextQueue, TEXT_QUEUE_TTL_MS, TEXT_QUEUE_MAX_BYTES, TEXT_QUEUE_SENDER_QUOTA } from '../utils/textQueue';
import { TEXT_PUBLISH_BUCKET_CAPACITY } from '../handlers/socketHandlers';
import logger from '../utils/logger';
import { resetUnlockLimiter } from '../utils/unlockLimiter';
import { issueRoomToken } from '../utils/roomToken';

type Client = ReturnType<typeof ioClient>;
type Registered = { globalRoomId: string; ipRoomId: string; roomTokens: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();
const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = () => ({ v: 1, iv: b64url(randomBytes(12)), ct: b64url(randomBytes(48)) });

/** 범위 잠금 하나 (클라이언트가 비밀번호에서 파생하는 값들의 모양만 흉내) */
const makeLock = () => {
    const verifierBytes = randomBytes(32);
    const deleteKeyBytes = randomBytes(32);
    return {
        salt: b64url(randomBytes(16)),
        verifier: b64url(verifierBytes),
        vh: createHash('sha256').update(verifierBytes).digest('hex'),
        deleteKey: b64url(deleteKeyBytes),
        dh: createHash('sha256').update(deleteKeyBytes).digest('hex'),
    };
};

describe('텍스트 대기열 (10분 보관) — 소켓 + API', () => {
    let port: number;
    let base: string;
    const clients: Client[] = [];
    let now = Date.now();

    beforeAll((done) => {
        httpServer.listen(0, () => {
            port = (httpServer.address() as AddressInfo).port;
            base = `http://127.0.0.1:${port}`;
            done();
        });
    });
    afterAll((done) => {
        getTextQueue().setClock(Date.now);
        httpServer.close(() => done());
    });
    beforeEach(() => {
        now = Date.now();
        getTextQueue().setClock(() => now);
        getTextQueue().reset();
        resetUnlockLimiter();
    });
    afterEach((done) => {
        clients.forEach((c) => c.connected && c.disconnect());
        clients.length = 0;
        setTimeout(done, 50);
    });

    let ipCounter = 0;
    const freshIp = () => `198.51.100.${(++ipCounter % 250) + 1}`;
    const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

    const connect = (ip: string): Promise<{ c: Client; reg: Registered; messages: any[] }> =>
        new Promise((resolve) => {
            const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
                transports: ['polling'],
                extraHeaders: { 'x-forwarded-for': ip },
                forceNew: true,
            });
            clients.push(c);
            const messages: any[] = [];
            c.on('message', (m: any) => messages.push(m));
            c.on('registered', (reg: Registered) => resolve({ c, reg, messages }));
        });

    const ask = (c: Client, event: string, payload: unknown): Promise<any> => new Promise((r) => c.emit(event, payload, r));
    const publish = (c: Client, msg: object, target: string): Promise<any> =>
        new Promise((r) => c.emit('publish', msg, target, (err: unknown, res: unknown) => r({ err, res })));

    const api = (path: string, roomId: string | null, body?: object, token?: string) =>
        fetch(`${base}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(roomId ? { 'X-Room-Token': token ?? issueRoomToken(roomId) } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    const list = async (roomId: string, token?: string) => {
        const res = await api(`/api/texts/${roomId}`, roomId, undefined, token);
        expect(res.status).toBe(200);
        return ((await readJson(res)) as { texts: any[] }).texts;
    };

    let seq = 0;
    const lockedText = (roomId: string, lock: ReturnType<typeof makeLock>, extra: object = {}) => ({
        type: 'text-shared',
        textId: `${Date.now()}-t${++seq}`,
        roomId,
        timestamp: Date.now(),
        locked: true,
        lock: { v: 1, salt: lock.salt, vh: lock.vh, dh: lock.dh },
        enc: enc(),
        ...extra,
    });

    test('잠긴 텍스트: 보관 후 늦게 들어온 기기가 목록으로 받고, 비밀번호 확인값으로만 암호문을 연다', async () => {
        const ip = freshIp();
        const A = await connect(ip);
        const lock = makeLock();
        const msg = lockedText(A.reg.ipRoomId, lock);
        const { res } = await publish(A.c, msg, 'ip');
        expect(res.expiresAt).toBe(now + TEXT_QUEUE_TTL_MS);
        await wait();
        // 보낸 기기에 되돌아온 중계 메시지: 만료 시각, salt만 (암호문·vh·dh 없음)
        const echo = A.messages.find((m) => m.textId === msg.textId);
        expect(echo).toMatchObject({ locked: true, lock: { salt: lock.salt }, expiresAt: now + TEXT_QUEUE_TTL_MS });
        expect(echo.enc).toBeUndefined();
        expect(JSON.stringify(echo)).not.toContain(lock.vh);

        // 같은 네트워크의 다른 기기가 나중에 들어온다
        const B = await connect(ip);
        expect(B.reg.ipRoomId).toBe(A.reg.ipRoomId);
        const texts = await list(B.reg.ipRoomId, B.reg.roomTokens[B.reg.ipRoomId]);
        expect(texts).toHaveLength(1);
        expect(texts[0]).toMatchObject({ textId: msg.textId, locked: true, lock: { salt: lock.salt } });
        expect(texts[0].enc).toBeUndefined();
        expect(texts[0].sender?.socketId).toBe(A.c.id);

        const wrong = await api('/api/texts/unlock', B.reg.ipRoomId, { roomId: B.reg.ipRoomId, textIds: [msg.textId], verifier: b64url(randomBytes(32)) });
        expect(wrong.status).toBe(403);
        expect(await readJson(wrong)).toMatchObject({ code: 'WRONG_PASSWORD', remaining: 4 });

        const ok = await api('/api/texts/unlock', B.reg.ipRoomId, { roomId: B.reg.ipRoomId, textIds: [msg.textId], verifier: lock.verifier });
        expect(ok.status).toBe(200);
        expect(await readJson(ok)).toEqual({ texts: [{ textId: msg.textId, enc: msg.enc }] });
    });

    test('새로고침(새 소켓)으로 다시 들어와도 같은 텍스트를 다시 받는다 (textId 하나)', async () => {
        const ip = freshIp();
        const A = await connect(ip);
        const msg = lockedText(A.reg.ipRoomId, makeLock());
        await publish(A.c, msg, 'ip');
        A.c.disconnect();
        await wait();

        const again = await connect(ip);
        const texts = await list(again.reg.ipRoomId, again.reg.roomTokens[again.reg.ipRoomId]);
        expect(texts.map((t) => t.textId)).toEqual([msg.textId]);
        const twice = await list(again.reg.ipRoomId, again.reg.roomTokens[again.reg.ipRoomId]);
        expect(twice.map((t) => t.textId)).toEqual([msg.textId]);
    });

    test('10분이 지나면 목록에서 사라지고 풀 수도 없다 (시계 주입)', async () => {
        const A = await connect(freshIp());
        const lock = makeLock();
        const msg = lockedText(A.reg.ipRoomId, lock);
        await publish(A.c, msg, 'ip');
        now += TEXT_QUEUE_TTL_MS - 1000;
        expect(await list(A.reg.ipRoomId)).toHaveLength(1);
        now += 1000;
        expect(await list(A.reg.ipRoomId)).toHaveLength(0);
        const res = await api('/api/texts/unlock', A.reg.ipRoomId, { roomId: A.reg.ipRoomId, textIds: [msg.textId], verifier: lock.verifier });
        expect(res.status).toBe(404);
    });

    test('잠금 꺼진 같은 네트워크·전체 공유 평문도 10분 보관해 늦게 들어온 기기가 그대로 받는다', async () => {
        const ip = freshIp();
        const A = await connect(ip);
        const B = await connect(ip);
        const plain = { type: 'text-shared', textId: `${Date.now()}-plain`, content: '안녕', timestamp: 1, roomId: A.reg.ipRoomId };
        const { res } = await publish(A.c, plain, 'ip');
        expect(res).toEqual({ success: true, expiresAt: now + TEXT_QUEUE_TTL_MS });
        const globalPlain = { ...plain, textId: `${Date.now()}-g`, roomId: A.reg.globalRoomId };
        await publish(A.c, globalPlain, 'global');
        // 잠금 표시 없이 암호문만 보낸 것은 보관하지 않는다
        await publish(A.c, { type: 'text-shared', textId: `${Date.now()}-e`, enc: enc(), roomId: A.reg.ipRoomId }, 'ip');
        await wait();
        // 실시간 중계: 방 안의 기기에 평문 그대로 + 만료 시각
        expect(B.messages.find((m) => m.textId === plain.textId)).toMatchObject({ content: '안녕', expiresAt: now + TEXT_QUEUE_TTL_MS });

        // 늦게 들어온 같은 네트워크 기기 C, 다른 네트워크 기기 D
        const C = await connect(ip);
        const ipTexts = await list(C.reg.ipRoomId, C.reg.roomTokens[C.reg.ipRoomId]);
        expect(ipTexts).toEqual([expect.objectContaining({ textId: plain.textId, content: '안녕', sender: expect.objectContaining({ socketId: A.c.id }) })]);
        expect(JSON.stringify(ipTexts)).not.toContain('"owner"');
        const D = await connect(freshIp());
        const globalTexts = await list(D.reg.globalRoomId, D.reg.roomTokens[D.reg.globalRoomId]);
        expect(globalTexts.map((t) => t.textId)).toContain(globalPlain.textId);
        // 다른 네트워크 기기는 그 IP 방 토큰이 없어 같은 네트워크 보관분을 못 본다
        expect((await api(`/api/texts/${A.reg.ipRoomId}`, A.reg.ipRoomId, undefined, D.reg.roomTokens[D.reg.ipRoomId])).status).toBe(401);
        expect(getTextQueue().size()).toBe(2);
    });

    test('평문 내용은 로그·에러 메시지 어디에도 남지 않는다', async () => {
        const secret = `평문-비밀-${randomBytes(6).toString('hex')}`;
        const spies = [
            ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(logger, m)),
            ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {})),
        ];
        try {
            const ip = freshIp();
            const A = await connect(ip);
            const errors: unknown[] = [];
            A.c.on('error', (e: unknown) => errors.push(e));
            const msg = { type: 'text-shared', textId: `${Date.now()}-s`, content: secret, timestamp: 1, roomId: A.reg.ipRoomId };
            await publish(A.c, msg, 'ip');
            await publish(A.c, { ...msg, textId: `${Date.now()}-s2`, roomId: A.reg.globalRoomId }, 'global');
            await publish(A.c, { ...msg, textId: `${Date.now()}-big`, content: secret + 'x'.repeat(TEXT_QUEUE_MAX_BYTES) }, 'ip');
            await publish(A.c, { ...msg, textId: 'bad/id' }, 'ip');
            await publish(A.c, msg, 'prv-ffffffffffffffffffffffff');
            const B = await connect(ip);
            await list(B.reg.ipRoomId, B.reg.roomTokens[B.reg.ipRoomId]);
            await api('/api/texts/delete', B.reg.ipRoomId, { roomId: B.reg.ipRoomId, textIds: [msg.textId] });
            await api('/api/texts/unlock', B.reg.ipRoomId, { roomId: B.reg.ipRoomId, textIds: [msg.textId], verifier: secret });
            await wait();
            const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls), (_k, v) => (v instanceof Error ? `${v.name}:${v.message}` : v));
            expect(logged).not.toContain(secret);
            expect(JSON.stringify(errors)).not.toContain(secret);
        } finally {
            spies.forEach((s) => s.mockRestore());
        }
    });

    test('96KiB를 넘는 텍스트는 실시간 전달만 하고 보관하지 않으며, 보낸 쪽 ack에 이유를 준다', async () => {
        const ip = freshIp();
        const A = await connect(ip);
        const B = await connect(ip);
        const big = { type: 'text-shared', textId: `${Date.now()}-big`, content: 'x'.repeat(TEXT_QUEUE_MAX_BYTES + 1), timestamp: 1, roomId: A.reg.ipRoomId };
        const { res } = await publish(A.c, big, 'ip');
        expect(res).toEqual({ success: true, notStored: 'TOO_LARGE' });
        await wait();
        expect(B.messages.find((m) => m.textId === big.textId)?.content).toHaveLength(TEXT_QUEUE_MAX_BYTES + 1);
        expect(await list(A.reg.ipRoomId)).toHaveLength(0);
    });

    test('text-shared는 소켓당 속도 제한: 연속 10개까지 통과, 넘으면 중계·보관 없이 RATE_LIMITED', async () => {
        const ip = freshIp();
        const A = await connect(ip);
        const B = await connect(ip);
        const results: any[] = [];
        for (let i = 0; i < TEXT_PUBLISH_BUCKET_CAPACITY + 2; i++) {
            results.push((await publish(A.c, { type: 'text-shared', textId: `${Date.now()}-r${i}`, content: `m${i}`, timestamp: 1, roomId: A.reg.ipRoomId }, 'ip')).res);
        }
        expect(results.slice(0, TEXT_PUBLISH_BUCKET_CAPACITY).every((r) => r.success === true)).toBe(true);
        expect(results.slice(TEXT_PUBLISH_BUCKET_CAPACITY)).toEqual([
            { success: false, code: 'RATE_LIMITED' },
            { success: false, code: 'RATE_LIMITED' },
        ]);
        await wait();
        expect(B.messages.filter((m) => m.type === 'text-shared')).toHaveLength(TEXT_PUBLISH_BUCKET_CAPACITY);
        // 다른 소켓은 영향받지 않고, 파일 알림 같은 다른 publish도 막히지 않는다
        expect((await publish(B.c, { type: 'text-shared', textId: `${Date.now()}-other`, content: 'ok', roomId: B.reg.ipRoomId }, 'ip')).res.success).toBe(true);
        expect((await publish(A.c, { type: 'file-deleted', fileName: 'a.txt', roomId: A.reg.ipRoomId }, 'ip')).res.success).toBe(true);
    });

    test('보낸 쪽 몫(5개)을 넘으면 자기 가장 오래된 보관분만 밀려나고(ack로 알림) 남의 보관분은 남는다', async () => {
        const ip = freshIp();
        const victim = await connect(ip);
        const spammer = await connect(ip);
        const room = victim.reg.ipRoomId;
        const theirs = { type: 'text-shared', textId: `${Date.now()}-victim`, content: '남의 글', timestamp: 1, roomId: room };
        await publish(victim.c, theirs, 'ip');
        const mine: string[] = [];
        const evicted: string[] = [];
        for (let i = 0; i < TEXT_QUEUE_SENDER_QUOTA + 2; i++) {
            now += 1;
            const id = `${Date.now()}-spam${i}`;
            mine.push(id);
            const { res } = await publish(spammer.c, { type: 'text-shared', textId: id, content: `spam ${i}`, timestamp: 1, roomId: room }, 'ip');
            evicted.push(...(res.evicted ?? []));
        }
        expect(evicted).toEqual(mine.slice(0, 2));
        const left = (await list(room)).map((t) => t.textId);
        expect(left).toContain(theirs.textId);
        expect(left.filter((id) => mine.includes(id))).toEqual(mine.slice(2));
    });

    test('평문 content가 실린 메시지는 잠금 정보가 있어도 대기열에 들어가지 않는다', async () => {
        const A = await connect(freshIp());
        const secret = `평문-${randomBytes(6).toString('hex')}`;
        await publish(A.c, lockedText(A.reg.ipRoomId, makeLock(), { content: secret }), 'ip');
        await publish(A.c, lockedText(A.reg.globalRoomId, makeLock(), { content: secret }), 'global');
        await wait();
        expect(getTextQueue().size()).toBe(0);
        const all = [...(await list(A.reg.ipRoomId)), ...(await list(A.reg.globalRoomId))];
        expect(JSON.stringify(all)).not.toContain(secret);
    });

    test('전체 공유 잠긴 텍스트도 보관하고, 보낸 기기의 삭제 키로 보관 취소한다', async () => {
        const A = await connect(freshIp());
        const lock = makeLock();
        const msg = lockedText(A.reg.globalRoomId, lock);
        await publish(A.c, msg, 'global');
        const room = A.reg.globalRoomId;
        expect((await list(room)).some((t) => t.textId === msg.textId)).toBe(true);

        // 증명이 없거나 다른 삭제 키면 못 지운다
        const none = await api('/api/texts/delete', room, { roomId: room, textIds: [msg.textId] });
        expect(await readJson(none)).toEqual({ deleted: [], forbidden: [msg.textId] });
        const other = await api('/api/texts/delete', room, { roomId: room, textIds: [msg.textId], deleteKeys: { [msg.textId]: makeLock().deleteKey } });
        expect((await readJson(other)).deleted).toEqual([]);

        const res = await api('/api/texts/delete', room, { roomId: room, textIds: [msg.textId], deleteKeys: { [msg.textId]: lock.deleteKey } });
        expect(await readJson(res)).toEqual({ deleted: [msg.textId], forbidden: [] });
        expect((await list(room)).some((t) => t.textId === msg.textId)).toBe(false);
    });

    test('전체 삭제: 비밀번호 증명이 맞는 묶음만 지우고, 틀린 증명은 시도 횟수에 센다', async () => {
        const A = await connect(freshIp());
        const room = A.reg.ipRoomId;
        const mine = makeLock();
        const others = makeLock();
        const m1 = lockedText(room, mine);
        const m2 = lockedText(room, mine);
        const m3 = lockedText(room, others);
        for (const m of [m1, m2, m3]) await publish(A.c, m, 'ip');

        const wrong = await api('/api/texts/delete', room, { roomId: room, all: true, proofs: [{ salt: others.salt, verifier: mine.verifier }] });
        expect(await readJson(wrong)).toMatchObject({ deleted: [], code: 'WRONG_PASSWORD', remaining: 4 });

        const res = await api('/api/texts/delete', room, { roomId: room, all: true, proofs: [{ salt: mine.salt, verifier: mine.verifier }] });
        const body = await readJson(res);
        expect(body.deleted.sort()).toEqual([m1.textId, m2.textId].sort());
        expect(body.forbidden).toEqual([m3.textId]);
        expect((await list(room)).map((t) => t.textId)).toEqual([m3.textId]);
    });

    test('1:1 방: 암호문을 보관해 상대가 나중에 받고, 방 멤버는 증명 없이 지울 수 있다', async () => {
        const A = await connect(freshIp());
        const B = await connect(freshIp());
        const done: any[] = [];
        A.c.on('pair:done', (p: any) => done.push(p));
        B.c.on('pair:done', (p: any) => done.push(p));
        const inv = await ask(A.c, 'pair:invite', { to: B.c.id });
        await wait();
        await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: true, same: true });
        await ask(A.c, 'pair:confirm', { sessionId: inv.sessionId, same: true });
        await wait();
        const roomId = done[0].roomId as string;
        const bTicket = done.find((d) => d.peer.socketId === A.c.id).ticket;

        // B가 꺼진 동안 A가 보낸다
        B.c.disconnect();
        await wait();
        const msg = { type: 'text-shared', textId: `${Date.now()}-prv`, enc: enc(), timestamp: 1, roomId };
        const { res } = await publish(A.c, msg, roomId);
        expect(res.expiresAt).toBe(now + TEXT_QUEUE_TTL_MS);

        // B가 새로고침 뒤 입장권으로 다시 들어와 받는다
        const B2 = await connect(freshIp());
        const join = await ask(B2.c, 'private:join', { tickets: [bTicket] });
        expect(join.ok).toBe(true);
        const texts = await list(roomId, join.rooms[0].roomToken);
        expect(texts).toEqual([expect.objectContaining({ textId: msg.textId, enc: msg.enc, expiresAt: now + TEXT_QUEUE_TTL_MS })]);

        const del = await api('/api/texts/delete', roomId, { roomId, all: true }, join.rooms[0].roomToken);
        expect((await readJson(del)).deleted).toEqual([msg.textId]);
        expect(await list(roomId, join.rooms[0].roomToken)).toEqual([]);
    });

    test('1:1 방에 평문 content를 보내면 보관하지 않는다', async () => {
        const roomId = 'prv-0123456789abcdef01234567';
        expect(getTextQueue().offer({ type: 'text-shared', textId: 'x1', content: '평문', enc: enc(), roomId }, roomId).stored).toBe(false);
        expect(getTextQueue().offer({ type: 'text-shared', textId: 'x2', content: '평문', roomId }, roomId).stored).toBe(false);
        expect(getTextQueue().size()).toBe(0);
    });

    test('방 토큰이 없거나 다른 방 토큰이면 목록·풀기·삭제 모두 401', async () => {
        const A = await connect(freshIp());
        const lock = makeLock();
        const msg = lockedText(A.reg.ipRoomId, lock);
        await publish(A.c, msg, 'ip');
        const room = A.reg.ipRoomId;
        const otherToken = issueRoomToken('room-someone-else');

        expect((await api(`/api/texts/${room}`, null)).status).toBe(401);
        expect((await api(`/api/texts/${room}`, room, undefined, otherToken)).status).toBe(401);
        expect((await api('/api/texts/unlock', null, { roomId: room, textIds: [msg.textId], verifier: lock.verifier })).status).toBe(401);
        expect((await api('/api/texts/unlock', room, { roomId: room, textIds: [msg.textId], verifier: lock.verifier }, otherToken)).status).toBe(401);
        expect((await api('/api/texts/delete', null, { roomId: room, all: true, deleteKeys: { [msg.textId]: lock.deleteKey } })).status).toBe(401);
        expect(await list(room)).toHaveLength(1);
    });

    test('다른 방으로 가는 publish(멤버 아님)는 보관되지 않는다', async () => {
        const A = await connect(freshIp());
        const fake = 'prv-ffffffffffffffffffffffff';
        const { err } = await publish(A.c, { type: 'text-shared', textId: 'z1', enc: enc(), roomId: fake }, fake);
        expect(err).toBeTruthy();
        expect(getTextQueue().size()).toBe(0);
    });
});
