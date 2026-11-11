import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { R2Service } from '../services/r2Service';
import { getTextQueue } from '../utils/textQueue';
import { resetDailyQuota } from '../utils/dailyQuota';
import { QUICK_SEND_MAX_BYTES } from '../routes/quickSend';

type Client = ReturnType<typeof ioClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

/** iOS 단축어용 빠른 보내기: 요청 IP의 같은 네트워크 방으로만 간다 */
describe('POST /api/quick-send', () => {
    let port: number;
    let base: string;
    const clients: Client[] = [];
    let uploadSpy: jest.SpyInstance;
    let sizeSpy: jest.SpyInstance;

    beforeAll((done) => {
        process.env.R2_ACCOUNT_ID = 'test-account';
        process.env.R2_ACCESS_KEY_ID = 'test-key';
        process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
        process.env.R2_BUCKET_NAME = 'test-bucket';
        process.env.R2_PUBLIC_URL = 'https://store.test';
        httpServer.listen(0, () => {
            port = (httpServer.address() as AddressInfo).port;
            base = `http://127.0.0.1:${port}`;
            done();
        });
    });
    afterAll((done) => { httpServer.close(() => done()); });

    beforeEach(() => {
        resetDailyQuota();
        getTextQueue().reset();
        uploadSpy = jest.spyOn(R2Service.prototype, 'uploadFileStream').mockImplementation(
            async (roomId: string, fileName: string, body: NodeJS.ReadableStream) => {
                // 스트림을 끝까지 읽어 임시 파일 정리 경로까지 실제로 탄다
                for await (const _chunk of body as AsyncIterable<unknown>) { /* drain */ }
                return { fileUrl: `https://store.test/${roomId}/${fileName}`, fileName };
            });
        sizeSpy = jest.spyOn(R2Service.prototype, 'getRoomTotalSize').mockResolvedValue(0);
    });
    afterEach((done) => {
        uploadSpy.mockRestore();
        sizeSpy.mockRestore();
        clients.forEach((c) => c.connected && c.disconnect());
        clients.length = 0;
        setTimeout(done, 50);
    });

    let ipCounter = 0;
    const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
    const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connect = (ip: string): Promise<{ ipRoomId: string; messages: any[] }> =>
        new Promise((resolve) => {
            const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
                transports: ['polling'],
                extraHeaders: { 'x-forwarded-for': ip },
                forceNew: true,
            });
            clients.push(c);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            c.on('message', (m: any) => messages.push(m));
            c.on('registered', (reg: { ipRoomId: string }) => resolve({ ipRoomId: reg.ipRoomId, messages }));
        });

    const send = (ip: string, form: FormData, lang = 'ko') =>
        fetch(`${base}/api/quick-send`, {
            method: 'POST',
            headers: { 'x-forwarded-for': ip, 'accept-language': lang },
            body: form,
        });

    test('파일은 같은 IP의 열린 기기에만 file-uploaded로 간다', async () => {
        const ip = freshIp();
        const pc = await connect(ip);
        const other = await connect(freshIp());

        const form = new FormData();
        form.append('file', new Blob([Buffer.from('hello photo')], { type: 'image/jpeg' }), '사진.jpg');
        form.append('device', 'iphone');
        const res = await send(ip, form);
        const body = await readJson(res);

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ ok: true, files: 1, text: false, receivers: 1 });
        expect(body.message).toContain('파일 1개를');
        await wait();
        const msg = pc.messages.find((m) => m.type === 'file-uploaded');
        expect(msg).toMatchObject({ roomId: pc.ipRoomId, size: 11, sender: { deviceLabel: 'iphone', browser: 'Shortcuts', model: 'iPhone' } });
        expect(msg.url).toContain(pc.ipRoomId);
        // 한글 파일명이 깨지지 않는다
        expect(uploadSpy.mock.calls[0][1]).toContain('사진');
        expect(other.messages.find((m) => m.type === 'file-uploaded')).toBeUndefined();
    });

    test('텍스트는 10분 대기열에 보관되고 text-shared로 간다', async () => {
        const ip = freshIp();
        const pc = await connect(ip);
        const form = new FormData();
        form.append('text', '인증번호 123456');
        const res = await send(ip, form);
        const body = await readJson(res);

        expect(body).toMatchObject({ ok: true, files: 0, text: true });
        await wait();
        const msg = pc.messages.find((m) => m.type === 'text-shared');
        expect(msg).toMatchObject({ roomId: pc.ipRoomId, content: '인증번호 123456' });
        expect(typeof msg.expiresAt).toBe('number');
        expect(getTextQueue().list(pc.ipRoomId)).toHaveLength(1);
    });

    test('열린 기기가 없어도 보내고, 그렇다고 알려 준다', async () => {
        const form = new FormData();
        form.append('text', 'hi');
        const body = await readJson(await send(freshIp(), form));
        expect(body).toMatchObject({ ok: true, receivers: 0 });
        expect(body.message).toContain('열린 기기는 없어요');
    });

    test('빈 요청은 400, 영어 요청은 영어 메시지', async () => {
        const res = await send(freshIp(), new FormData(), 'en-US');
        expect(res.status).toBe(400);
        expect((await readJson(res)).message).toBe('Nothing to send.');
    });

    test('95MB를 넘는 파일은 413', async () => {
        const form = new FormData();
        form.append('file', new Blob([Buffer.alloc(QUICK_SEND_MAX_BYTES + 1)]), 'big.mov');
        const res = await send(freshIp(), form);
        expect(res.status).toBe(413);
        expect((await readJson(res)).code).toBe('LIMIT_FILE_SIZE');
        expect(uploadSpy).not.toHaveBeenCalled();
    });

    test('같은 네트워크에서 너무 빠르게 보내면 429', async () => {
        const ip = freshIp();
        const statuses: number[] = [];
        for (let i = 0; i < 22; i++) {
            const form = new FormData();
            form.append('text', `t${i}`);
            statuses.push((await send(ip, form)).status);
        }
        expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
        expect(statuses[21]).toBe(429);
    });

    test('방 용량이 가득 차면 업로드하지 않는다', async () => {
        sizeSpy.mockResolvedValue(10240 * 1024 * 1024);
        const form = new FormData();
        form.append('file', new Blob([Buffer.from('x')]), 'a.txt');
        const res = await send(freshIp(), form);
        expect(res.status).toBe(413);
        expect((await readJson(res)).code).toBe('ROOM_FULL');
        expect(uploadSpy).not.toHaveBeenCalled();
    });
});
