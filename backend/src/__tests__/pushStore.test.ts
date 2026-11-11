import { PushStore, PushRecord, PushPersistence, PUSH_IP_VALID_MS, PUSH_REFRESH_INTERVAL_MS, PUSH_SWEEP_INTERVAL_MS, PUSH_MAX_TARGETS_PER_ROOM, parsePushRecord, isAllowedPushEndpoint } from '../services/pushStore';

const pidOf = (n: number) => n.toString(16).padStart(32, '0');
const keys = { p256dh: 'BPtestkey_-AAAA', auth: 'authsecret_-AA' };
const ep = (n: number) => `https://fcm.googleapis.com/fcm/send/token${n}`;

const sub = (n: number, over: Partial<Parameters<PushStore['subscribe']>[0]> = {}) => ({
    pid: pidOf(n), endpoint: ep(n), keys, lang: 'ko' as const, ipRoomId: 'room-aaa', tickets: [], ...over,
});

const makePersistence = () => {
    const puts: PushRecord[] = [];
    const removes: string[] = [];
    let stored: unknown[] = [];
    const p: PushPersistence = {
        put: jest.fn(async (r) => { puts.push(JSON.parse(JSON.stringify(r))); }),
        remove: jest.fn(async (pid) => { removes.push(pid); }),
        loadAll: jest.fn(async () => stored),
    };
    return { p, puts, removes, setStored: (v: unknown[]) => { stored = v; } };
};

describe('PushStore', () => {
    let now: number;
    let store: PushStore;
    beforeEach(() => {
        now = 1_800_000_000_000;
        store = new PushStore(() => now);
    });
    afterEach(() => store.stop());

    test('같은 네트워크 방은 가장 최근 방 하나만 묶는다', () => {
        store.subscribe(sub(1, { ipRoomId: 'room-home' }));
        store.subscribe(sub(1, { ipRoomId: 'room-cafe' }));
        expect(store.targetsFor('room-home', 'ip')).toHaveLength(0);
        expect(store.targetsFor('room-cafe', 'ip')).toHaveLength(1);
        expect(store.size()).toBe(1);
    });

    test('같은 네트워크 방은 마지막 방문 7일 뒤 무효, 다시 방문하면 갱신', () => {
        store.subscribe(sub(1));
        now += PUSH_IP_VALID_MS - 1000;
        expect(store.targetsFor('room-aaa', 'ip')).toHaveLength(1);
        store.subscribe(sub(1));
        now += PUSH_IP_VALID_MS - 1000;
        expect(store.targetsFor('room-aaa', 'ip')).toHaveLength(1);
        now += 2000;
        expect(store.targetsFor('room-aaa', 'ip')).toHaveLength(0);
    });

    test('IP를 알 수 없는 subscribe는 이전 방의 방문 시각을 늘리지 않는다', () => {
        store.subscribe(sub(1));
        now += PUSH_IP_VALID_MS - 1000;
        store.subscribe(sub(1, { ipRoomId: null }));
        now += 2000;
        expect(store.targetsFor('room-aaa', 'ip')).toHaveLength(0);
    });

    test('비공개 방 묶음은 입장권 만료 시각까지, 구독당 최대 10개', () => {
        const tickets = Array.from({ length: 12 }, (_, i) => ({ roomId: `prv-${i}`, exp: now + 60_000 }));
        const r = store.subscribe(sub(1, { ipRoomId: null, tickets }));
        expect(r).toEqual({ ok: true, prv: 10 });
        expect(store.targetsFor('prv-0', 'prv')).toHaveLength(1);
        expect(store.targetsFor('prv-11', 'prv')).toHaveLength(0);
        now += 60_001;
        expect(store.targetsFor('prv-0', 'prv')).toHaveLength(0);
    });

    test('scope가 다르면 대상이 되지 않는다', () => {
        store.subscribe(sub(1, { tickets: [{ roomId: 'prv-x', exp: now + 1000 }] }));
        expect(store.targetsFor('prv-x', 'ip')).toHaveLength(0);
        expect(store.targetsFor('room-aaa', 'prv')).toHaveLength(0);
    });

    test('방당 발송 대상 상한 20', () => {
        for (let i = 1; i <= 30; i++) store.subscribe(sub(i));
        expect(store.targetsFor('room-aaa', 'ip')).toHaveLength(PUSH_MAX_TARGETS_PER_ROOM);
    });

    test('유효한 묶음이 없는 구독은 정리 때 삭제된다', () => {
        store.subscribe(sub(1, { ipRoomId: null, tickets: [{ roomId: 'prv-a', exp: now + 1000 }] }));
        store.subscribe(sub(2));
        now += PUSH_IP_VALID_MS + 1;
        expect(store.sweep()).toBe(2);
        expect(store.size()).toBe(0);
    });

    test('전체 구독 상한: 가득이면 PUSH_FULL, 정리로 자리가 나면 받는다', () => {
        const small = new PushStore(() => now, 3);
        for (let i = 1; i <= 3; i++) expect(small.subscribe(sub(i)).ok).toBe(true);
        expect(small.subscribe(sub(4))).toEqual({ ok: false, code: 'PUSH_FULL' });
        // 기존 구독의 갱신은 가득이어도 된다
        expect(small.subscribe(sub(1)).ok).toBe(true);
        now += PUSH_IP_VALID_MS + 1;
        expect(small.subscribe(sub(4)).ok).toBe(true);
        expect(small.size()).toBe(1);
    });

    test('같은 endpoint를 다른 pid로 등록하면 옛 레코드는 지운다', () => {
        store.subscribe(sub(1, { endpoint: ep(9) }));
        store.subscribe(sub(2, { endpoint: ep(9) }));
        expect(store.get(pidOf(1))).toBeUndefined();
        expect(store.get(pidOf(2))).toBeDefined();
    });

    test('unsubscribe는 pid와 endpoint가 모두 맞을 때만 지운다', () => {
        store.subscribe(sub(1));
        expect(store.unsubscribe(pidOf(1), ep(2))).toBe(false);
        expect(store.unsubscribe(pidOf(2), ep(1))).toBe(false);
        expect(store.size()).toBe(1);
        expect(store.unsubscribe(pidOf(1), ep(1))).toBe(true);
        expect(store.size()).toBe(0);
    });

    describe('영속화', () => {
        test('새 구독·변경은 저장하고, 변경 없는 재등록은 1시간 안에는 다시 쓰지 않는다', () => {
            const { p, puts } = makePersistence();
            store.setPersistence(p);
            store.subscribe(sub(1));
            expect(puts).toHaveLength(1);
            now += 60_000;
            store.subscribe(sub(1));
            expect(puts).toHaveLength(1);
            store.subscribe(sub(1, { ipRoomId: 'room-bbb' }));
            expect(puts).toHaveLength(2);
            now += 61 * 60_000;
            store.subscribe(sub(1, { ipRoomId: 'room-bbb' }));
            expect(puts).toHaveLength(3);
        });

        test('삭제는 저장소에서도 지운다', () => {
            const { p, removes } = makePersistence();
            store.setPersistence(p);
            store.subscribe(sub(1));
            store.unsubscribe(pidOf(1), ep(1));
            expect(removes).toEqual([pidOf(1)]);
        });

        test('저장 실패는 구독을 막지 않는다', async () => {
            const { p } = makePersistence();
            (p.put as jest.Mock).mockRejectedValue(new Error('r2 down'));
            store.setPersistence(p);
            expect(store.subscribe(sub(1)).ok).toBe(true);
            await Promise.resolve();
        });

        test('hydrate는 검증을 통과한 유효 레코드만 되살린다', async () => {
            const { p, setStored } = makePersistence();
            const good: PushRecord = { pid: pidOf(1), endpoint: ep(1), keys, lang: 'ko', ipRoomId: 'room-aaa', ipSeenAt: now - 1000, prv: [], createdAt: now, updatedAt: now };
            setStored([
                good,
                { ...good, pid: pidOf(2), endpoint: 'https://evil.example/x' },
                { ...good, pid: pidOf(3), ipSeenAt: now - PUSH_IP_VALID_MS - 1 },
                { ...good, pid: 'nothex' },
                null,
            ]);
            store.setPersistence(p);
            expect(await store.hydrate()).toBe(1);
            expect(store.targetsFor('room-aaa', 'ip').map((r) => r.pid)).toEqual([pidOf(1)]);
        });

        test('잠금 버킷 수명 주기(1일) 대비: 12시간마다 전체 레코드를 다시 쓴다', async () => {
            jest.useFakeTimers();
            try {
                let t = Date.now();
                const s = new PushStore(() => t);
                const { p, puts } = makePersistence();
                s.setPersistence(p);
                s.subscribe(sub(1, { ipRoomId: 'room-aaa' }));
                s.subscribe(sub(2, { ipRoomId: 'room-aaa' }));
                expect(puts).toHaveLength(2);
                s.start();
                t += PUSH_REFRESH_INTERVAL_MS;
                await jest.advanceTimersByTimeAsync(PUSH_REFRESH_INTERVAL_MS);
                expect(puts.length).toBeGreaterThanOrEqual(4);
                s.stop();
            } finally {
                jest.useRealTimers();
            }
        });

        test('1시간마다 정리가 돈다', async () => {
            jest.useFakeTimers();
            try {
                let t = Date.now();
                const s = new PushStore(() => t);
                s.subscribe(sub(1, { ipRoomId: 'room-aaa' }));
                s.start();
                t += PUSH_IP_VALID_MS + 1;
                await jest.advanceTimersByTimeAsync(PUSH_SWEEP_INTERVAL_MS);
                expect(s.size()).toBe(0);
                s.stop();
            } finally {
                jest.useRealTimers();
            }
        });
    });
});

describe('endpoint 허용 목록', () => {
    test.each([
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
        'https://web.push.apple.com/abc',
    ])('허용: %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

    test.each([
        'https://evil.example/x',
        'https://fcm.googleapis.com.evil.example/x',
        'http://fcm.googleapis.com/x',
        'https://evilfcm.googleapis.com.evil.example/',
        'https://fcm.googleapis.com@evil.example/x',
        'https://evil.example/fcm.googleapis.com',
        'https://notfcm.googleapis.com.attacker.io/',
        'https://xpush.apple.com/x',
        'https://127.0.0.1/x',
        'https://localhost/x',
        'ftp://fcm.googleapis.com/x',
        'not a url',
        '',
        `https://fcm.googleapis.com/${'a'.repeat(1000)}`,
    ])('거부: %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(false));

    test('문자열이 아닌 값은 거부', () => {
        expect(isAllowedPushEndpoint(undefined)).toBe(false);
        expect(isAllowedPushEndpoint({ toString: () => 'https://fcm.googleapis.com/x' })).toBe(false);
    });

    test('parsePushRecord는 허용 밖 endpoint를 거부한다', () => {
        expect(parsePushRecord({ pid: pidOf(1), endpoint: 'https://evil.example/x', keys })).toBeNull();
    });
});
