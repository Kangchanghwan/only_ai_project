import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { parseClientId } from '../handlers/socketHandlers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const connect = (url: string, opts: any): any => (ioClient as any)(url, opts);

describe('presence: clientId 중복 정리 / 복구 시 IP 재확인', () => {
  let port: number;
  const clients: any[] = [];
  const url = () => `http://localhost:${port}`;
  const mk = (ip: string, auth?: Record<string, unknown>, extra: any = {}) => {
    const c = connect(url(), {
      transports: ['polling'],
      forceNew: true,
      auth,
      extraHeaders: { 'x-forwarded-for': ip },
      ...extra,
    });
    clients.push(c);
    return c;
  };
  const once = (c: any, ev: string): Promise<any> => new Promise((r) => c.once(ev, r));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll((done) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });
  afterAll((done) => {
    httpServer.close(() => done());
  });
  afterEach(async () => {
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    await sleep(100);
  });

  test('parseClientId: 형식 검증', () => {
    expect(parseClientId('abcd1234')).toBe('abcd1234');
    expect(parseClientId('short')).toBeUndefined();
    expect(parseClientId('has space!!')).toBeUndefined();
    expect(parseClientId('a'.repeat(65))).toBeUndefined();
    expect(parseClientId(123)).toBeUndefined();
    expect(parseClientId(undefined)).toBeUndefined();
  });

  /** 마지막으로 받은 room-users의 기기 수를 추적 */
  const track = (c: any, store: { n: number }) =>
    c.on('room-users', (p: { roomId: string; devices: unknown[] }) => {
      if (p.roomId !== 'room-shared') store.n = p.devices.length;
    });

  test('(a) 같은 clientId 두 소켓: 첫 소켓은 끊기고 IP 룸은 1명', async () => {
    const watcher = mk('198.51.100.31');
    const w = { n: 0 };
    track(watcher, w);
    await once(watcher, 'registered');

    const first = mk('198.51.100.31', { clientId: 'client-AAAA-1111' });
    await once(first, 'registered');
    const disc = once(first, 'disconnect');
    const second = mk('198.51.100.31', { clientId: 'client-AAAA-1111' });
    await once(second, 'registered');
    await disc;
    await sleep(300);
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(true);
    expect(w.n).toBe(2); // watcher + second
  });

  test('(b) 서로 다른 clientId는 둘 다 유지', async () => {
    const a = mk('198.51.100.32', { clientId: 'client-BBBB-1111' });
    await once(a, 'registered');
    const b = mk('198.51.100.32', { clientId: 'client-BBBB-2222' });
    const st = { n: 0 };
    track(b, st);
    await once(b, 'registered');
    await sleep(300);
    expect(a.connected).toBe(true);
    expect(b.connected).toBe(true);
    expect(st.n).toBe(2);
  });

  test('(c) clientId 없음/형식 오류는 기존 동작 그대로', async () => {
    const a = mk('198.51.100.33');
    await once(a, 'registered');
    const b = mk('198.51.100.33');
    const c = mk('198.51.100.33', { clientId: 'bad id' });
    const d = mk('198.51.100.33', { clientId: 'bad id' });
    const st = { n: 0 };
    track(d, st);
    await Promise.all([once(b, 'registered'), once(c, 'registered'), once(d, 'registered')]);
    await sleep(300);
    expect([a, b, c, d].every((x) => x.connected)).toBe(true);
    expect(st.n).toBe(4);
  });

  test('(d) 복구된 소켓의 IP가 바뀌면 새 IP 룸으로 옮기고 registered를 다시 받는다', async () => {
    const a = mk('198.51.100.41', { clientId: 'client-DDDD-1111' });
    const first = await once(a, 'registered');
    const second = new Promise<any>((r) => {
      a.on('connect', () => {
        if (a.recovered) a.once('registered', r);
      });
    });
    // 재연결 시 다른 IP로 보이게 한다
    const hdr = { 'x-forwarded-for': '203.0.113.77' };
    a.io.opts.extraHeaders = hdr;
    if (a.io.engine?.opts) a.io.engine.opts.extraHeaders = hdr;
    a.io.engine.close();
    const moved = await Promise.race([second, sleep(8000).then(() => null)]);
    expect(moved).not.toBeNull();
    expect(moved.ipRoomId).not.toBe(first.ipRoomId);
    expect(moved.globalRoomId).toBe('room-shared');
    expect(moved.roomTokens).toBeDefined();
  }, 15000);
});
