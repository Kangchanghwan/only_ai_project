import { PushNotifier, buildPushBody, PUSH_DEBOUNCE_MS, PUSH_MAX_WAIT_MS, PUSH_MIN_INTERVAL_MS, PUSH_TTL_SEC } from '../services/pushNotifier';
import { PushStore } from '../services/pushStore';

const pidOf = (n: number) => n.toString(16).padStart(32, '0');
const keys = { p256dh: 'BPtestkey_-AAAA', auth: 'authsecret_-AA' };
const SECRET_NAME = '비밀문서-계약서.pdf';
const SECRET_TEXT = 'my-secret-clipboard-text';

describe('PushNotifier', () => {
    let store: PushStore;
    let send: jest.Mock;
    let notifier: PushNotifier;
    let connected: Record<string, string[]>; // roomId -> pids
    let socketPids: Record<string, string>; // socketId -> pid

    const attachFakeIo = () => {
        const io = {
            sockets: {
                adapter: { rooms: { get: (room: string) => (connected[room] ? new Set(connected[room].map((p) => `sock-${p}`)) : undefined) } },
                sockets: { get: (id: string) => {
                    const pid = id.startsWith('sock-') ? id.slice(5) : socketPids[id];
                    return pid ? { data: { pushId: pid } } : undefined;
                } },
            },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notifier.attachIo(io as any);
    };

    beforeEach(() => {
        jest.useFakeTimers();
        store = new PushStore(() => Date.now());
        send = jest.fn().mockResolvedValue({ statusCode: 201 });
        notifier = new PushNotifier({ store, send, enabled: () => true, now: () => Date.now() });
        connected = {};
        socketPids = {};
        attachFakeIo();
    });
    afterEach(() => {
        notifier.reset();
        store.stop();
        jest.useRealTimers();
    });

    const subscribe = (n: number, over: Record<string, unknown> = {}) =>
        store.subscribe({ pid: pidOf(n), endpoint: `https://fcm.googleapis.com/fcm/send/t${n}`, keys, lang: 'ko', ipRoomId: 'room-a', tickets: [], ...over });
    const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
    const payloadOf = (callIndex = 0) => JSON.parse(send.mock.calls[callIndex][1]);

    test('같은 네트워크 방 도착: 4초 뒤 푸시 1건, 옵션은 TTL 3600 / urgency normal', async () => {
        subscribe(1);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS - 1);
        expect(send).not.toHaveBeenCalled();
        await advance(2);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/t1', keys });
        expect(send.mock.calls[0][2]).toMatchObject({ TTL: PUSH_TTL_SEC, urgency: 'normal' });
        expect(payloadOf()).toEqual({ v: 1, title: 'Clipboard Share', body: '새 파일 1개가 도착했어요', tag: 'cs-arrival', target: 'ip' });
    });

    test('비공개 방 도착: target은 방 ID', async () => {
        subscribe(1, { ipRoomId: null, tickets: [{ roomId: 'prv-abc', exp: Date.now() + 100000 }] });
        notifier.notifyArrival({ roomId: 'prv-abc', scope: 'prv', kind: 'text' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(payloadOf()).toMatchObject({ target: 'prv-abc', body: '새 텍스트가 도착했어요' });
    });

    test('접속 중인 기기와 보낸 기기는 제외한다', async () => {
        subscribe(1); subscribe(2); subscribe(3);
        connected['room-a'] = [pidOf(1)];
        socketPids['sender-sock'] = pidOf(2);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file', senderSocketId: 'sender-sock' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].endpoint).toContain('/t3');
    });

    test('대기 중에 앱을 연 기기에는 보내지 않는다', async () => {
        subscribe(1);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(1000);
        connected['room-a'] = [pidOf(1)];
        await advance(PUSH_DEBOUNCE_MS);
        expect(send).not.toHaveBeenCalled();
    });

    test('구독이 없는 방이나 다른 방에는 보내지 않는다', async () => {
        subscribe(1);
        notifier.notifyArrival({ roomId: 'room-other', scope: 'ip', kind: 'file' });
        await advance(PUSH_MAX_WAIT_MS);
        expect(send).not.toHaveBeenCalled();
    });

    test('전체 공유 범위(scope 외 값)는 보내지 않는다', async () => {
        subscribe(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notifier.notifyArrival({ roomId: 'room-a', scope: 'global' as any, kind: 'file' });
        await advance(PUSH_MAX_WAIT_MS);
        expect(send).not.toHaveBeenCalled();
    });

    test('꺼져 있으면 아무것도 하지 않는다', async () => {
        const off = new PushNotifier({ store, send, enabled: () => false });
        subscribe(1);
        off.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_MAX_WAIT_MS);
        expect(send).not.toHaveBeenCalled();
    });

    test('디바운스: 연달아 온 파일은 개수로 합친다', async () => {
        subscribe(1);
        for (let i = 0; i < 3; i++) {
            notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
            await advance(1000);
        }
        await advance(PUSH_DEBOUNCE_MS);
        expect(send).toHaveBeenCalledTimes(1);
        expect(payloadOf().body).toBe('새 파일 3개가 도착했어요');
    });

    test('파일과 텍스트가 섞이면 합친 문구', async () => {
        subscribe(1);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'text' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(payloadOf().body).toBe('새 파일 2개와 텍스트가 도착했어요');
    });

    test('계속 도착해도 첫 도착 후 최대 10초 안에는 보낸다', async () => {
        subscribe(1);
        for (let i = 0; i < 4; i++) {
            notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
            await advance(3000);
        }
        // 12초 경과: 10초 지점에서 이미 한 번 나갔다
        expect(send).toHaveBeenCalledTimes(1);
        expect(payloadOf().body).toBe('새 파일 4개가 도착했어요'.replace('4', String(payloadOf().body.match(/\d+/)[0])));
    });

    test('같은 기기에는 20초에 1번까지: 두 번째는 간격을 채운 뒤 합쳐 보낸다', async () => {
        subscribe(1);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(send).toHaveBeenCalledTimes(1);
        const firstSentAt = Date.now();

        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(send).toHaveBeenCalledTimes(1); // 아직 20초 안

        await advance(firstSentAt + PUSH_MIN_INTERVAL_MS - Date.now() + 5);
        expect(send).toHaveBeenCalledTimes(2);
        expect(payloadOf(1).body).toBe('새 파일 2개가 도착했어요');
    });

    test('404/410이면 구독을 지운다, 다른 오류는 남긴다', async () => {
        subscribe(1); subscribe(2);
        send.mockImplementation(async (sub: { endpoint: string }) => {
            if (sub.endpoint.endsWith('/t1')) throw Object.assign(new Error('gone'), { statusCode: 410 });
            throw Object.assign(new Error('boom'), { statusCode: 500 });
        });
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(store.get(pidOf(1))).toBeUndefined();
        expect(store.get(pidOf(2))).toBeDefined();
        send.mockReset().mockImplementation(async () => { throw Object.assign(new Error('nf'), { statusCode: 404 }); });
    });

    test('실패 로그에 엔드포인트·키를 남기지 않는다', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const logger = require('../utils/logger').default;
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
        subscribe(1);
        send.mockRejectedValue(Object.assign(new Error('https://fcm.googleapis.com/fcm/send/t1 auth failed'), { statusCode: 500 }));
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
        expect(warn).toHaveBeenCalled();
        expect(logged).not.toContain('fcm.googleapis.com');
        expect(logged).not.toContain(keys.auth);
        expect(logged).not.toContain(pidOf(1)); // pid도 앞 6자만
        warn.mockRestore(); error.mockRestore();
    });

    test('페이로드에는 파일 이름·텍스트·보낸 사람·IP가 없다', async () => {
        subscribe(1);
        // 알림 API는 이름·내용을 받지 않지만, 호출에 실어 보내도 새지 않는지 확인한다
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file', senderSocketId: 'sock-x', fileName: SECRET_NAME, content: SECRET_TEXT, ip: '203.0.113.7', senderName: '빠른 여우' } as never);
        await advance(PUSH_DEBOUNCE_MS + 1);
        const raw = send.mock.calls[0][1] as string;
        for (const s of [SECRET_NAME, SECRET_TEXT, '203.0.113.7', '빠른 여우', 'room-a']) expect(raw).not.toContain(s);
        expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['body', 'tag', 'target', 'title', 'v']);
    });

    test('언어: ko는 한국어, 그 외는 영어', async () => {
        subscribe(1, { lang: 'en' });
        notifier.notifyArrival({ roomId: 'room-a', scope: 'ip', kind: 'file' });
        await advance(PUSH_DEBOUNCE_MS + 1);
        expect(payloadOf().body).toBe('1 new file(s) arrived');
        expect(buildPushBody('en', 0, true)).toBe('New text arrived');
        expect(buildPushBody('en', 2, true)).toBe('2 new file(s) and text arrived');
    });
});
