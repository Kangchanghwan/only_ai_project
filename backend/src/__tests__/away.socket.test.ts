import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { AWAY_DISCONNECT_REASONS, getAwayGraceMs } from '../handlers/socketHandlers';

type Client = ReturnType<typeof ioClient>;

describe('Socket.IO - 연결이 끊긴 기기를 잠시 자리 비움으로 남기기', () => {
  let port: number;
  const clients: Client[] = [];
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  let ipCounter = 40;

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
    delete process.env.AWAY_GRACE_SEC;
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    await wait(80);
  });

  const connect = (ip: string): Promise<Client> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
        auth: { roster: 2 },
      });
      clients.push(c);
      c.on('registered', () => resolve(c));
    });


  test('유예 설정: 기본 60초, 0이면 끈다, 네트워크성 이유만 유예 대상', () => {
    expect(getAwayGraceMs()).toBe(60000);
    process.env.AWAY_GRACE_SEC = '0';
    expect(getAwayGraceMs()).toBe(0);
    process.env.AWAY_GRACE_SEC = '5';
    expect(getAwayGraceMs()).toBe(5000);
    expect([...AWAY_DISCONNECT_REASONS].sort()).toEqual(['ping timeout', 'transport close', 'transport error']);
    expect(AWAY_DISCONNECT_REASONS.has('client namespace disconnect')).toBe(false);
  });

  test('명시적으로 나가면(client namespace disconnect) 바로 명단에서 빠진다', async () => {
    const ip = `198.51.100.${(++ipCounter % 250) + 1}`;
    const a = await connect(ip);
    const b = await connect(ip);
    await wait();
    const removed = new Promise<string>((resolve) => a.on('room-delta', (d: { op: string; socketId?: string }) => { if (d.op === 'remove') resolve(d.socketId as string); }));
    const bId = b.id;
    b.disconnect();
    expect(await removed).toBe(bId);
  });

  test('네트워크가 끊기면(transport close) 유예 동안 away로 남고, 유예가 끝나면 빠진다', async () => {
    process.env.AWAY_GRACE_SEC = '1';
    const ip = `198.51.100.${(++ipCounter % 250) + 1}`;
    const a = await connect(ip);
    const b = await connect(ip);
    await wait();
    const deltas: Array<{ op: string; device?: { socketId: string; away?: boolean }; socketId?: string }> = [];
    a.on('room-delta', (d: any) => deltas.push(d));
    const bId = b.id;
    // 클라이언트가 인사 없이 전송 계층만 닫는 상황 (iPad가 백그라운드로 가서 연결이 끊긴 것과 같다)
    (b as any).io.engine.close();
    await wait(300);
    const away = deltas.find((d) => d.op === 'update' && d.device?.socketId === bId);
    expect(away?.device?.away).toBe(true);
    expect(deltas.some((d) => d.op === 'remove')).toBe(false);
    await wait(1200);
    expect(deltas.some((d) => d.op === 'remove' && d.socketId === bId)).toBe(true);
  });

  test('유예 안에 같은 기기(clientId)가 새 소켓으로 붙으면 옛 항목을 정리하고 새로 등록된다', async () => {
    process.env.AWAY_GRACE_SEC = '30';
    const ip = `198.51.100.${(++ipCounter % 250) + 1}`;
    const a = await connect(ip);
    const clientId = 'client-away-test-0001';
    const b = await new Promise<Client>((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
        auth: { roster: 2, clientId },
        reconnection: false,
      });
      clients.push(c);
      c.on('registered', () => resolve(c));
    });
    await wait();
    const bId = b.id;
    const removed: string[] = [];
    a.on('room-delta', (d: any) => { if (d.op === 'remove') removed.push(d.socketId); });
    (b as any).io.engine.close();
    await wait(300);
    expect(removed).toEqual([]);
    const b2 = await new Promise<Client>((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
        auth: { roster: 2, clientId },
        reconnection: false,
      });
      clients.push(c);
      c.on('registered', () => resolve(c));
    });
    await wait(200);
    expect(removed).toContain(bId);
    expect(b2.id).not.toBe(bId);
  });
});
