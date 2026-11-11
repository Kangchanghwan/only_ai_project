import { httpServer } from '../server';
import { AddressInfo } from 'net';
import webpush from 'web-push';
import { getPushStore, PUSH_MAX_PRV_PER_SUB } from '../services/pushStore';
import { issueTicket } from '../utils/privateTicket';
import { newPrivateRoomId } from '../utils/privateRoom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

const pid = (n: number) => n.toString(16).padStart(32, '0');
const keys = { p256dh: 'BPtestkey_-AAAA', auth: 'authsecret_-AA' };
const goodEndpoint = (n: number) => `https://fcm.googleapis.com/fcm/send/tok${n}`;

describe('/api/push', () => {
    let base: string;
    let ipCounter = 0;
    const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
    const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
    const vapid = webpush.generateVAPIDKeys();

    beforeAll((done) => {
        httpServer.listen(0, () => {
            base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
            done();
        });
    });
    afterAll((done) => {
        process.env.VAPID_PUBLIC_KEY = saved.pub;
        process.env.VAPID_PRIVATE_KEY = saved.priv;
        if (saved.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
        if (saved.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
        getPushStore().reset();
        httpServer.close(() => done());
    });
    beforeEach(() => {
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;
        getPushStore().reset();
    });

    const enable = () => {
        process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
        process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    };
    const post = (path: string, body: unknown, ip = freshIp()) =>
        fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
    const subscribe = (over: Record<string, unknown> = {}, ip = freshIp()) =>
        post('/api/push/subscribe', { pid: pid(1), subscription: { endpoint: goodEndpoint(1), keys }, lang: 'ko', ...over }, ip);

    test('VAPID가 없으면 key는 404 PUSH_DISABLED, subscribe도 저장하지 않는다', async () => {
        const res = await fetch(`${base}/api/push/key`);
        expect(res.status).toBe(404);
        expect(await readJson(res)).toEqual({ error: 'PUSH_DISABLED' });
        expect((await subscribe()).status).toBe(404);
        expect(getPushStore().size()).toBe(0);
    });

    test('VAPID가 있으면 key는 공개키만 돌려준다', async () => {
        enable();
        const res = await fetch(`${base}/api/push/key`);
        expect(res.status).toBe(200);
        const body = await readJson(res);
        expect(body).toEqual({ key: vapid.publicKey });
        expect(JSON.stringify(body)).not.toContain(vapid.privateKey);
    });

    test('정상 구독: 요청 IP로 같은 네트워크 방이 묶인다', async () => {
        enable();
        const res = await subscribe();
        expect(res.status).toBe(200);
        expect(await readJson(res)).toEqual({ ok: true, ip: true, prv: 0 });
        const rec = getPushStore().get(pid(1));
        expect(rec?.ipRoomId).toMatch(/^room-/);
    });

    test('클라이언트가 보낸 방 ID(ipRoomId, roomId)는 무시된다', async () => {
        enable();
        const res = await subscribe({ ipRoomId: 'room-victim', roomId: 'room-victim', ipRoom: 'room-victim' });
        expect(res.status).toBe(200);
        expect(getPushStore().get(pid(1))?.ipRoomId).not.toBe('room-victim');
        expect(getPushStore().targetsFor('room-victim', 'ip')).toHaveLength(0);
    });

    test.each([
        ['BAD_PID', { pid: 'NOT-HEX' }],
        ['BAD_PID', { pid: 'A'.repeat(32) }],
        ['BAD_PID', { pid: undefined }],
        ['BAD_ENDPOINT', { subscription: { endpoint: 'https://evil.example/x', keys } }],
        ['BAD_ENDPOINT', { subscription: { endpoint: 'https://fcm.googleapis.com.evil.example/x', keys } }],
        ['BAD_ENDPOINT', { subscription: { endpoint: 'http://fcm.googleapis.com/x', keys } }],
        ['BAD_ENDPOINT', { subscription: { endpoint: 'https://fcm.googleapis.com@evil.example/x', keys } }],
        ['BAD_ENDPOINT', { subscription: { endpoint: `https://fcm.googleapis.com/${'a'.repeat(1000)}`, keys } }],
        ['BAD_ENDPOINT', { subscription: { keys } }],
        ['BAD_ENDPOINT', { subscription: null }],
        ['BAD_KEYS', { subscription: { endpoint: goodEndpoint(1), keys: { p256dh: 'x'.repeat(201), auth: 'abc' } } }],
        ['BAD_KEYS', { subscription: { endpoint: goodEndpoint(1), keys: { p256dh: 'abc', auth: 'y'.repeat(101) } } }],
        ['BAD_KEYS', { subscription: { endpoint: goodEndpoint(1), keys: { p256dh: 'not base64url!', auth: 'abc' } } }],
        ['BAD_KEYS', { subscription: { endpoint: goodEndpoint(1) } }],
    ])('잘못된 요청은 400 %s', async (code, over) => {
        enable();
        const res = await subscribe(over as Record<string, unknown>);
        expect(res.status).toBe(400);
        expect(await readJson(res)).toEqual({ error: code });
        expect(getPushStore().size()).toBe(0);
    });

    test('본문이 JSON이 아니어도 서버가 죽지 않고 400', async () => {
        enable();
        const res = await fetch(`${base}/api/push/subscribe`, { method: 'POST', headers: { 'x-forwarded-for': freshIp() }, body: 'hello' });
        expect([400, 404]).toContain(res.status);
    });

    test('허용된 푸시 서비스 4곳은 통과한다', async () => {
        enable();
        const hosts = [
            'https://fcm.googleapis.com/fcm/send/a',
            'https://updates.push.services.mozilla.com/wpush/v2/a',
            'https://wns2-par02p.notify.windows.com/w/?token=a',
            'https://web.push.apple.com/a',
        ];
        for (let i = 0; i < hosts.length; i++) {
            const res = await subscribe({ pid: pid(10 + i), subscription: { endpoint: hosts[i], keys } });
            expect(res.status).toBe(200);
        }
    });

    test('입장권: 서명이 맞는 것만 묶고, 위조·만료·중복은 무시한다', async () => {
        enable();
        const roomA = newPrivateRoomId();
        const roomB = newPrivateRoomId();
        const good = issueTicket(roomA);
        const forged = issueTicket(roomB).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
        const expired = issueTicket(newPrivateRoomId(), Math.floor(Date.now() / 1000) - 40 * 24 * 3600);
        const res = await subscribe({ tickets: [good, good, forged, expired, 'junk', 42] });
        expect(await readJson(res)).toEqual({ ok: true, ip: true, prv: 1 });
        expect(getPushStore().targetsFor(roomA, 'prv')).toHaveLength(1);
        expect(getPushStore().targetsFor(roomB, 'prv')).toHaveLength(0);
    });

    test('입장권은 최대 10개까지만 본다', async () => {
        enable();
        const tickets = Array.from({ length: 15 }, () => issueTicket(newPrivateRoomId()));
        const res = await subscribe({ tickets });
        expect((await readJson(res)).prv).toBe(PUSH_MAX_PRV_PER_SUB);
    });

    test('다시 subscribe하면 입장권 묶음이 새 목록으로 바뀐다', async () => {
        enable();
        const roomA = newPrivateRoomId();
        await subscribe({ tickets: [issueTicket(roomA)] });
        expect(getPushStore().targetsFor(roomA, 'prv')).toHaveLength(1);
        await subscribe({ tickets: [] });
        expect(getPushStore().targetsFor(roomA, 'prv')).toHaveLength(0);
    });

    test('unsubscribe: pid와 endpoint가 모두 맞을 때만 지우고 항상 ok', async () => {
        enable();
        await subscribe();
        for (const body of [
            { pid: pid(1), endpoint: goodEndpoint(2) },
            { pid: pid(2), endpoint: goodEndpoint(1) },
            { pid: 'bad', endpoint: goodEndpoint(1) },
            {},
        ]) {
            const res = await post('/api/push/unsubscribe', body);
            expect(await readJson(res)).toEqual({ ok: true });
            expect(getPushStore().size()).toBe(1);
        }
        const res = await post('/api/push/unsubscribe', { pid: pid(1), endpoint: goodEndpoint(1) });
        expect(await readJson(res)).toEqual({ ok: true });
        expect(getPushStore().size()).toBe(0);
    });

    test('속도 제한: IP당 분당 30회, 다른 IP는 영향 없음', async () => {
        enable();
        const ip = freshIp();
        let last = 0;
        for (let i = 0; i < 31; i++) last = (await subscribe({}, ip)).status;
        expect(last).toBe(429);
        expect((await subscribe({}, freshIp())).status).toBe(200);
    });

    test('전체 구독 상한이면 503 PUSH_FULL', async () => {
        enable();
        const store = getPushStore();
        const spy = jest.spyOn(store, 'subscribe').mockReturnValue({ ok: false, code: 'PUSH_FULL' });
        const res = await subscribe();
        spy.mockRestore();
        expect(res.status).toBe(503);
        expect(await readJson(res)).toEqual({ error: 'PUSH_FULL' });
    });
});
