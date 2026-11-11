import { httpServer, io } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { getPushNotifier } from '../services/pushNotifier';
import { newPrivateRoomId } from '../utils/privateRoom';
import { issueTicket } from '../utils/privateTicket';
import { resetDailyQuota } from '../utils/dailyQuota';
import { getTextQueue } from '../utils/textQueue';

type Client = ReturnType<typeof ioClient>;
type Registered = { globalRoomId: string; ipRoomId: string };

const pid = (n: number) => n.toString(16).padStart(32, '0');

describe('도착 알림: 소켓 publish 연결', () => {
    let port: number;
    const clients: Client[] = [];
    let spy: jest.SpyInstance;

    beforeAll((done) => {
        httpServer.listen(0, () => { port = (httpServer.address() as AddressInfo).port; done(); });
    });
    afterAll((done) => { httpServer.close(() => done()); });
    beforeEach(() => {
        resetDailyQuota();
        getTextQueue().reset();
        spy = jest.spyOn(getPushNotifier(), 'notifyArrival').mockImplementation(() => undefined);
    });
    afterEach((done) => {
        spy.mockRestore();
        clients.forEach((c) => c.connected && c.disconnect());
        clients.length = 0;
        setTimeout(done, 50);
    });

    let ipCounter = 0;
    const freshIp = () => `198.18.0.${(++ipCounter % 250) + 1}`;
    const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

    const connect = (ip: string): Promise<{ c: Client; reg: Registered }> =>
        new Promise((resolve) => {
            const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
                transports: ['polling'],
                extraHeaders: { 'x-forwarded-for': ip },
                forceNew: true,
            });
            clients.push(c);
            c.on('registered', (reg: Registered) => resolve({ c, reg }));
        });
    const publish = (c: Client, msg: object, target: string): Promise<{ err: unknown; res: unknown }> =>
        new Promise((r) => c.emit('publish', msg, target, (err: unknown, res: unknown) => r({ err, res })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ask = (c: Client, event: string, payload: unknown): Promise<any> => new Promise((r) => c.emit(event, payload, r));

    const file = (roomId: string) => ({ type: 'file-uploaded', fileName: 'a.png', url: 'https://x.test/a.png', size: 1, created: new Date().toISOString(), roomId });
    const text = (roomId: string) => ({ type: 'text-shared', textId: `t${Date.now()}${Math.random()}`, roomId, timestamp: Date.now(), content: 'hello' });

    test('ip 범위 파일·텍스트 publish는 notifier를 부른다 (보낸 소켓 id 포함)', async () => {
        const { c, reg } = await connect(freshIp());
        await publish(c, file(reg.ipRoomId), 'ip');
        await publish(c, text(reg.ipRoomId), 'ip');
        expect(spy).toHaveBeenCalledWith({ roomId: reg.ipRoomId, scope: 'ip', kind: 'file', senderSocketId: c.id });
        expect(spy).toHaveBeenCalledWith({ roomId: reg.ipRoomId, scope: 'ip', kind: 'text', senderSocketId: c.id });
        expect(spy).toHaveBeenCalledTimes(2);
    });

    test('global 범위는 notifier를 부르지 않는다', async () => {
        const { c, reg } = await connect(freshIp());
        await publish(c, file(reg.globalRoomId), 'global');
        await publish(c, text(reg.globalRoomId), 'global');
        expect(spy).not.toHaveBeenCalled();
    });

    test('비공개 방 publish는 scope prv로 부른다', async () => {
        const { c } = await connect(freshIp());
        const roomId = newPrivateRoomId();
        const joined = await ask(c, 'private:join', { tickets: [issueTicket(roomId)] });
        expect(joined.ok).toBe(true);
        await publish(c, text(roomId), roomId);
        expect(spy).toHaveBeenCalledWith({ roomId, scope: 'prv', kind: 'text', senderSocketId: c.id });
    });

    test('file-deleted 같은 다른 메시지와 잘못된 대상은 부르지 않는다', async () => {
        const { c, reg } = await connect(freshIp());
        await publish(c, { type: 'file-deleted', fileName: 'a.png', roomId: reg.ipRoomId }, 'ip');
        await publish(c, file('prv-000000000000000000000000'), 'prv-000000000000000000000000');
        expect(spy).not.toHaveBeenCalled();
    });

    test('push:bind는 socket.data.pushId를 정하고, 형식이 틀리면 무시한다', async () => {
        const { c } = await connect(freshIp());
        const sock = () => io.sockets.sockets.get(c.id as string);
        c.emit('push:bind', { pid: 'bad' });
        await wait();
        expect(sock()?.data.pushId).toBeUndefined();
        c.emit('push:bind', { pid: pid(7) });
        await wait();
        expect(sock()?.data.pushId).toBe(pid(7));
        c.emit('push:bind', null);
        c.emit('push:bind', { pid: 123 });
        await wait();
        expect(sock()?.data.pushId).toBe(pid(7));
    });

    test('빠른 보내기(텍스트)도 같은 네트워크 방으로 notifier를 부른다 (보낸 소켓 없음)', async () => {
        const ip = freshIp();
        const { reg } = await connect(ip);
        const form = new FormData();
        form.append('text', 'hello from shortcut');
        const res = await fetch(`http://127.0.0.1:${port}/api/quick-send`, { method: 'POST', headers: { 'x-forwarded-for': ip }, body: form });
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith({ roomId: reg.ipRoomId, scope: 'ip', kind: 'text' });
    });
});
