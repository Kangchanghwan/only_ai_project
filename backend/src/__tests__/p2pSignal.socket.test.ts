import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { P2P_SIGNAL_MAX_BYTES, P2P_SIGNAL_BUCKET_CAPACITY } from '../handlers/socketHandlers';

type Client = ReturnType<typeof ioClient>;

describe('Socket.IO - p2p:signal 중계', () => {
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
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    setTimeout(done, 50);
  });

  const connect = (ip: string): Promise<Client> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
      });
      clients.push(c);
      c.on('registered', () => resolve(c));
    });

  const collect = (c: Client) => {
    const got: any[] = [];
    c.on('p2p:signal', (p: any) => got.push(p));
    return got;
  };
  const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

  test('같은 IP 룸의 대상에게만 {from, data}로 전달된다', async () => {
    const a = await connect('203.0.113.10');
    const b = await connect('203.0.113.10');
    const got = collect(b);
    a.emit('p2p:signal', { to: b.id, data: { type: 'offer', sdp: 'x' } });
    await wait();
    expect(got).toEqual([{ from: a.id, data: { type: 'offer', sdp: 'x' } }]);
  });

  test('다른 IP 룸(같은 전역 룸)의 대상은 거절된다', async () => {
    const a = await connect('203.0.113.20');
    const b = await connect('203.0.113.21');
    const got = collect(b);
    a.emit('p2p:signal', { to: b.id, data: 'hi' });
    await wait();
    expect(got).toHaveLength(0);
  });

  test('잘못된 payload와 자기 자신·존재하지 않는 대상은 무시된다', async () => {
    const a = await connect('203.0.113.30');
    const got = collect(a);
    a.emit('p2p:signal', null);
    a.emit('p2p:signal', { to: a.id, data: 'self' });
    a.emit('p2p:signal', { to: 'nope', data: 'x' });
    a.emit('p2p:signal', { to: 123, data: 'x' });
    await wait();
    expect(got).toHaveLength(0);
  });

  test('data 크기 상한을 넘으면 버려진다', async () => {
    const a = await connect('203.0.113.40');
    const b = await connect('203.0.113.40');
    const got = collect(b);
    a.emit('p2p:signal', { to: b.id, data: 'x'.repeat(P2P_SIGNAL_MAX_BYTES + 1) });
    a.emit('p2p:signal', { to: b.id, data: 'ok' });
    await wait();
    expect(got.map((g) => g.data)).toEqual(['ok']);
  });

  test('초당 메시지 수 제한을 넘으면 초과분이 버려진다', async () => {
    const a = await connect('203.0.113.50');
    const b = await connect('203.0.113.50');
    const got = collect(b);
    const total = P2P_SIGNAL_BUCKET_CAPACITY + 30;
    for (let i = 0; i < total; i++) a.emit('p2p:signal', { to: b.id, data: i });
    await wait(400);
    expect(got.length).toBeGreaterThanOrEqual(P2P_SIGNAL_BUCKET_CAPACITY);
    expect(got.length).toBeLessThan(total);
  });

  test('구버전 클라이언트 흐름(publish)은 영향받지 않는다', async () => {
    const a = await connect('203.0.113.60');
    const b = await connect('203.0.113.60');
    const msgs: any[] = [];
    b.on('message', (m: any) => msgs.push(m));
    a.emit('publish', { type: 'x' }, 'ip');
    await wait();
    // 원본 필드는 그대로, 서버가 sender만 추가로 붙인다
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ type: 'x' });
  });
});
