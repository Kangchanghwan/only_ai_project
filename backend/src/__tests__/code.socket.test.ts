import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import logger from '../utils/logger';
import { CodeRegistry } from '../services/codeRegistry';

type Client = ReturnType<typeof ioClient>;

describe('Socket.IO - 그림 코드 입장', () => {
  let port: number;
  const clients: Client[] = [];

  beforeAll((done) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });
  afterAll((done) => {
    httpServer.close(() => done());
  });
  afterEach((done) => {
    delete process.env.CODE_TTL_SEC;
    delete process.env.CODE_LOCK_SEC;
    delete process.env.CODE_MAX_FAILS;
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    setTimeout(done, 80);
  });

  let ipCounter = 100;
  const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  let routeCounter = 0;
  const freshRoute = (): [number, number] => {
    const n = routeCounter++ % 576;
    return [Math.floor(n / 24), n % 24];
  };

  const connect = (ip: string = freshIp()): Promise<Client> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' },
      });
      clients.push(c);
      c.on('registered', () => resolve(c));
    });
  const ask = (c: Client, event: string, payload?: unknown): Promise<any> =>
    new Promise((r) => (payload === undefined ? c.emit(event, r) : c.emit(event, payload, r)));
  const collect = (c: Client, events: string[]) => {
    const got: Record<string, any[]> = {};
    for (const e of events) {
      got[e] = [];
      c.on(e, (p: any) => got[e].push(p));
    }
    return got;
  };
  const EV = ['code:incoming', 'code:signal', 'code:request', 'code:end'];

  /** 호스트가 그룹 방을 만들고 코드를 연다 */
  const openHost = async (route = freshRoute()) => {
    const host = await connect();
    const room = await ask(host, 'private:create');
    const opened = await ask(host, 'code:open', { roomId: room.roomId, route });
    return { host, roomId: room.roomId as string, route, opened };
  };

  test('정상 흐름: open → join → signal 중계 → confirmed → request에 기기 정보 → decide accept → 호스트 신호 1회 중계', async () => {
    const { host, route, opened } = await openHost();
    expect(opened.ok).toBe(true);
    expect(opened.expiresAt).toBeGreaterThan(Date.now() + 290 * 1000);
    expect(opened.expiresAt).toBeLessThanOrEqual(Date.now() + 300 * 1000);
    const joiner = await connect();
    const h = collect(host, EV);
    const j = collect(joiner, EV);

    const joined = await ask(joiner, 'code:join', { route });
    expect(joined.ok).toBe(true);
    const sid = joined.sessionId as string;
    await wait();
    expect(h['code:incoming']).toEqual([{ sessionId: sid }]);

    await ask(joiner, 'code:signal', { sessionId: sid, data: { m: 'pA' } });
    await ask(host, 'code:signal', { sessionId: sid, data: { m: 'pB' } });
    await wait();
    expect(h['code:signal']).toEqual([{ sessionId: sid, data: { m: 'pA' } }]);
    expect(j['code:signal']).toEqual([{ sessionId: sid, data: { m: 'pB' } }]);
    expect(h['code:request']).toHaveLength(0);

    await ask(host, 'code:confirmed', { sessionId: sid });
    await wait();
    expect(h['code:request']).toHaveLength(1);
    expect(h['code:request'][0].sessionId).toBe(sid);
    expect(h['code:request'][0].from.socketId).toBe(joiner.id);
    expect(h['code:request'][0].from.deviceType).toBeDefined();

    expect((await ask(host, 'code:decide', { sessionId: sid, accept: true })).ok).toBe(true);
    await ask(host, 'code:signal', { sessionId: sid, data: { m: 'payload' } });
    await wait();
    expect(j['code:signal'][j['code:signal'].length - 1]).toEqual({ sessionId: sid, data: { m: 'payload' } });
    // 1회 전달 뒤 세션은 끝났다
    expect(await ask(host, 'code:signal', { sessionId: sid, data: { m: 'again' } })).toMatchObject({ ok: false });
    await wait();
    expect(j['code:signal']).toHaveLength(2);
  });

  test('방 멤버가 아니면 open 거부, 1:1(prv-) 방과 형식이 틀린 값도 거부', async () => {
    const A = await connect();
    const B = await connect();
    const room = await ask(A, 'private:create');
    const r1 = await ask(B, 'code:open', { roomId: room.roomId, route: freshRoute() });
    expect(r1).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    const r2 = await ask(A, 'code:open', { roomId: 'prv-0123456789abcdef01234567', route: freshRoute() });
    expect(r2).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    const r3 = await ask(A, 'code:open', { roomId: room.roomId, route: [24, 0] });
    expect(r3).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    const r4 = await ask(A, 'code:open', { roomId: room.roomId, route: [1] });
    expect(r4).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });

  test('이미 활성인 route는 ROUTE_TAKEN, 소켓당 코드 1개(새로 열면 이전 것 닫힘), close하면 NOT_FOUND', async () => {
    const { host, roomId, route } = await openHost();
    const other = await connect();
    const otherRoom = await ask(other, 'private:create');
    expect(await ask(other, 'code:open', { roomId: otherRoom.roomId, route })).toMatchObject({ ok: false, error: 'ROUTE_TAKEN' });

    const route2 = freshRoute();
    expect((await ask(host, 'code:open', { roomId, route: route2 })).ok).toBe(true);
    const joiner = await connect();
    expect(await ask(joiner, 'code:join', { route })).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    // 이전 route는 비었으니 다른 방이 쓸 수 있다
    expect((await ask(other, 'code:open', { roomId: otherRoom.roomId, route })).ok).toBe(true);
    expect((await ask(host, 'code:close', {})).ok).toBe(true);
    expect(await ask(joiner, 'code:join', { route: route2 })).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('만료 뒤 join은 NOT_FOUND', async () => {
    process.env.CODE_TTL_SEC = '1';
    const { route } = await openHost();
    const joiner = await connect();
    await wait(1200);
    expect(await ask(joiner, 'code:join', { route })).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  test('실패 3회부터 warn, 5회째부터 WAIT, 잠금 시간이 지나면 풀린다', async () => {
    process.env.CODE_LOCK_SEC = '1';
    const { route } = await openHost();
    const joiner = await connect();
    const bad = freshRoute();
    const r1 = await ask(joiner, 'code:join', { route: bad });
    const r2 = await ask(joiner, 'code:join', { route: bad });
    expect(r1).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(r2).toEqual({ ok: false, error: 'NOT_FOUND' });
    const r3 = await ask(joiner, 'code:join', { route: bad });
    expect(r3).toMatchObject({ ok: false, error: 'NOT_FOUND', warn: true });
    const r4 = await ask(joiner, 'code:join', { route: bad });
    expect(r4.warn).toBe(true);
    await ask(joiner, 'code:join', { route: bad });
    const locked = await ask(joiner, 'code:join', { route });
    expect(locked).toMatchObject({ ok: false, error: 'WAIT' });
    expect(locked.retryAfterSec).toBeGreaterThanOrEqual(1);
    await wait(1200);
    const after = await ask(joiner, 'code:join', { route });
    expect(after.ok).toBe(true);
  });

  test('같은 IP의 다른 소켓도 실패가 합산된다', async () => {
    const ip = freshIp();
    const { route } = await openHost();
    const a = await connect(ip);
    const b = await connect(ip);
    const bad = freshRoute();
    for (let i = 0; i < 5; i++) await ask(a, 'code:join', { route: bad });
    expect(await ask(b, 'code:join', { route })).toMatchObject({ ok: false, error: 'WAIT' });
  });

  test('code:fail은 들어오는 쪽 실패 1회로 세고 wrong을 보낸다 (확인 실패 시 호스트에는 request 없음)', async () => {
    const { host, route } = await openHost();
    const joiner = await connect();
    const h = collect(host, EV);
    const j = collect(joiner, EV);
    const sid = (await ask(joiner, 'code:join', { route })).sessionId;
    await ask(host, 'code:fail', { sessionId: sid });
    await wait();
    expect(j['code:end']).toEqual([{ sessionId: sid, reason: 'wrong' }]);
    expect(h['code:request']).toHaveLength(0);
    // 실패 2회를 더 쌓으면(총 3회) 응답에 warn
    const bad = freshRoute();
    await ask(joiner, 'code:join', { route: bad });
    const third = await ask(joiner, 'code:join', { route: bad });
    expect(third.warn).toBe(true);
  });

  test('세션 멤버가 아닌 소켓의 signal은 무시되고, 호스트가 아닌 쪽의 confirmed/decide도 무시', async () => {
    const { host, route } = await openHost();
    const joiner = await connect();
    const stranger = await connect();
    const h = collect(host, EV);
    const j = collect(joiner, EV);
    const sid = (await ask(joiner, 'code:join', { route })).sessionId;
    stranger.emit('code:signal', { sessionId: sid, data: { x: 1 } });
    await wait();
    expect(h['code:signal']).toHaveLength(0);
    expect(j['code:signal']).toHaveLength(0);
    expect(await ask(joiner, 'code:confirmed', { sessionId: sid })).toMatchObject({ ok: false });
    expect(await ask(stranger, 'code:cancel', { sessionId: sid })).toMatchObject({ ok: false });
    // 너무 큰 신호는 중계하지 않는다
    joiner.emit('code:signal', { sessionId: sid, data: 'x'.repeat(5000) });
    await wait();
    expect(h['code:signal']).toHaveLength(0);
  });

  test('거절하면 declined, 취소하면 cancelled가 상대에게 간다', async () => {
    const { host, route } = await openHost();
    const j1 = await connect();
    const j2 = await connect();
    const c1 = collect(j1, EV);
    const h = collect(host, EV);
    const s1 = (await ask(j1, 'code:join', { route })).sessionId;
    await ask(host, 'code:confirmed', { sessionId: s1 });
    await ask(host, 'code:decide', { sessionId: s1, accept: false });
    const s2 = (await ask(j2, 'code:join', { route })).sessionId;
    await ask(j2, 'code:cancel', { sessionId: s2 });
    await wait();
    expect(c1['code:end']).toEqual([{ sessionId: s1, reason: 'declined' }]);
    expect(h['code:end']).toEqual([{ sessionId: s2, reason: 'cancelled' }]);
  });

  test('같은 코드로 여러 기기가 각각 세션을 만들 수 있고, 한 소켓은 동시에 세션 1개', async () => {
    const { host, route } = await openHost();
    const j1 = await connect();
    const j2 = await connect();
    const a = await ask(j1, 'code:join', { route });
    const b = await ask(j2, 'code:join', { route });
    expect(a.ok && b.ok).toBe(true);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(await ask(j1, 'code:join', { route })).toMatchObject({ ok: false, error: 'BUSY' });
    expect(host.connected).toBe(true);
  });

  test('끊김 정리: 호스트가 끊기면 코드가 사라지고 들어오는 쪽에 gone, 들어오는 쪽이 끊기면 호스트에 gone', async () => {
    const { host, route } = await openHost();
    const j1 = await connect();
    const c1 = collect(j1, EV);
    const sid = (await ask(j1, 'code:join', { route })).sessionId;
    host.disconnect();
    await wait(250);
    expect(c1['code:end']).toEqual([{ sessionId: sid, reason: 'gone' }]);
    const j2 = await connect();
    expect(await ask(j2, 'code:join', { route })).toMatchObject({ ok: false, error: 'NOT_FOUND' });

    const second = await openHost();
    const j3 = await connect();
    const h2 = collect(second.host, EV);
    const sid2 = (await ask(j3, 'code:join', { route: second.route })).sessionId;
    j3.disconnect();
    await wait(250);
    expect(h2['code:end']).toEqual([{ sessionId: sid2, reason: 'gone' }]);
  });

  test('로그에 route·sessionId·신호 내용을 남기지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .filter((k) => typeof (logger as any)[k] === 'function')
      .map((k) => jest.spyOn(logger as any, k));
    const route: [number, number] = [11, 22];
    const { host } = await openHost(route);
    const joiner = await connect();
    const sid = (await ask(joiner, 'code:join', { route })).sessionId as string;
    await ask(joiner, 'code:signal', { sessionId: sid, data: { secretMarker: 'ZZTOP-MARKER' } });
    await ask(host, 'code:fail', { sessionId: sid });
    await ask(joiner, 'code:join', { route: [0, 0] });
    host.disconnect();
    await wait(250);
    const all = spies.flatMap((s) => s.mock.calls).map((args) => JSON.stringify(args)).join('\n');
    spies.forEach((s) => s.mockRestore());
    expect(all).toContain('그림 코드 열림');
    expect(all).not.toContain(sid);
    expect(all).not.toContain('ZZTOP-MARKER');
    expect(all).not.toContain('11-22');
    expect(all).not.toContain('[11,22]');
  });
});

describe('CodeRegistry (주입 시계)', () => {
  test('10분이 지나면 실패 카운터가 초기화되고 잠금은 시간이 지나면 풀린다', () => {
    let t = 1_000_000;
    const reg = new CodeRegistry(() => t);
    const keys = ['s:a', 'i:1.1.1.1'];
    for (let i = 0; i < 5; i++) reg.recordFail(keys);
    expect(reg.lockedFor(keys)).toBe(180);
    t += 181_000;
    expect(reg.lockedFor(keys)).toBe(0);
    t += 10 * 60 * 1000;
    expect(reg.recordFail(keys)).toMatchObject({ count: 1, warn: false, retryAfterSec: 0 });
  });

  test('동시 활성 코드 상한 500을 넘으면 BUSY', () => {
    const reg = new CodeRegistry();
    let n = 0;
    for (let a = 0; a < 24 && n < 500; a++) {
      for (let b = 0; b < 24 && n < 500; b++) {
        expect(reg.open(`sock${n}`, 'prv-g-x', [a, b]).ok).toBe(true);
        n++;
      }
    }
    expect(reg.activeCodeCount).toBe(500);
    expect(reg.open('sock-extra', 'prv-g-x', [23, 23])).toEqual({ ok: false, error: 'BUSY' });
    // 기존 호스트가 route를 바꾸는 건 허용
    expect(reg.open('sock0', 'prv-g-x', [23, 23]).ok).toBe(true);
  });
});
