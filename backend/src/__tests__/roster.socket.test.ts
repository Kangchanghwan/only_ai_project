import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { resetDailyQuota } from '../utils/dailyQuota';

type Client = ReturnType<typeof ioClient>;
type Registered = { globalRoomId: string; ipRoomId: string; identity: { adj: number; animal: number; suffix?: number } };

describe('Socket.IO - 명단 증분(room-delta)', () => {
  let port: number;
  const clients: Client[] = [];
  beforeAll((done) => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
    httpServer.listen(0, () => { port = (httpServer.address() as AddressInfo).port; done(); });
  });
  afterAll((done) => { httpServer.close(() => done()); });
  beforeEach(() => resetDailyQuota());
  afterEach((done) => {
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    delete process.env.ROSTER_FULL_MAX;
    setTimeout(done, 50);
  });

  let ipCounter = 100;
  const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
  const connect = (ip: string, auth: Record<string, unknown> = { roster: 2 }): Promise<{ c: Client; reg: Registered; log: any[] }> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'], auth, extraHeaders: { 'x-forwarded-for': ip },
      });
      clients.push(c);
      const log: any[] = [];
      c.on('room-users', (p: any) => log.push({ ev: 'room-users', ...p }));
      c.on('room-delta', (p: any) => log.push({ ev: 'room-delta', ...p }));
      c.on('registered', (reg: Registered) => resolve({ c, reg, log }));
    });
  const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  const emitAck = (c: Client, ev: string, payload: unknown): Promise<any> => new Promise((res) => c.emit(ev, payload, res));

  test('들어옴: 본인 스냅샷, 다른 v2 add delta, legacy 전체', async () => {
    const ip = freshIp();
    const a = await connect(ip);
    const leg = await connect(ip, {});
    await wait();
    a.log.length = 0; leg.log.length = 0;
    const b = await connect(ip);
    await wait();
    const snap = b.log.find((e) => e.ev === 'room-users' && e.roomId === b.reg.ipRoomId);
    expect(snap).toMatchObject({ total: 3, truncated: false });
    expect(typeof snap.rev).toBe('number');
    const add = a.log.find((e) => e.ev === 'room-delta' && e.roomId === b.reg.ipRoomId);
    expect(add).toMatchObject({ op: 'add', total: 3 });
    expect(add.device.socketId).toBe(b.c.id);
    expect(a.log.some((e) => e.ev === 'room-users' && e.roomId === b.reg.ipRoomId)).toBe(false);
    const full = leg.log.find((e) => e.ev === 'room-users' && e.roomId === b.reg.ipRoomId);
    expect(full.devices).toHaveLength(3);
  });

  test('나감: remove delta, rev 1씩 증가', async () => {
    const ip = freshIp();
    const a = await connect(ip);
    const b = await connect(ip);
    await wait();
    a.log.length = 0;
    const bid = b.c.id;
    b.c.disconnect();
    await wait();
    const rm = a.log.filter((e) => e.ev === 'room-delta' && e.roomId === a.reg.ipRoomId);
    expect(rm).toHaveLength(1);
    expect(rm[0]).toMatchObject({ op: 'remove', socketId: bid, total: 1 });
    const c3 = await connect(ip);
    await wait();
    const add = a.log.filter((e) => e.ev === 'room-delta' && e.roomId === a.reg.ipRoomId).pop();
    expect(add.rev).toBe(rm[0].rev + 1);
    expect(c3.c.id).toBeTruthy();
  });

  test('나감: 전체 공유 방이 한도+1에서 한도로 내려가면 v2 전원 전체 스냅샷', async () => {
    const base = await connect(freshIp());
    await wait();
    const n = await new Promise<number>((r) => base.c.emit('room-snapshot', { roomId: base.reg.globalRoomId }, (res: any) => r(res.snapshot.total)));
    process.env.ROSTER_FULL_MAX = String(n + 1);
    const x = await connect(freshIp());
    const y = await connect(freshIp()); // total = n+2 > max → truncated
    await wait();
    const snapY = await emitAck(y.c, 'room-snapshot', { roomId: y.reg.globalRoomId });
    expect(snapY.snapshot.truncated).toBe(true);
    base.log.length = 0;
    x.c.disconnect(); // n+2 → n+1 = max → 스냅샷(truncated false)
    await wait();
    const snap = base.log.find((e) => e.ev === 'room-users' && e.roomId === base.reg.globalRoomId);
    expect(snap).toMatchObject({ truncated: false, total: n + 1 });
    expect(base.log.some((e) => e.ev === 'room-delta' && e.roomId === base.reg.globalRoomId)).toBe(false);
  });

  test('reroll: update delta (v2) / 전체 (legacy)', async () => {
    const ip = freshIp();
    const a = await connect(ip);
    const leg = await connect(ip, {});
    const b = await connect(ip);
    await wait();
    a.log.length = 0; leg.log.length = 0;
    b.c.emit('identity:reroll');
    await wait();
    const up = a.log.find((e) => e.ev === 'room-delta' && e.roomId === a.reg.ipRoomId);
    expect(up).toMatchObject({ op: 'update' });
    expect(up.device.socketId).toBe(b.c.id);
    expect(leg.log.some((e) => e.ev === 'room-users' && e.roomId === a.reg.ipRoomId)).toBe(true);
  });

  test('room-snapshot: 자기 방 ok, 남의 방 거부', async () => {
    const a = await connect(freshIp());
    const b = await connect(freshIp());
    const ok = await emitAck(a.c, 'room-snapshot', { roomId: a.reg.ipRoomId });
    expect(ok.ok).toBe(true);
    expect(ok.snapshot.devices.some((d: any) => d.socketId === a.c.id)).toBe(true);
    expect((await emitAck(a.c, 'room-snapshot', { roomId: b.reg.ipRoomId })).ok).toBe(false);
    expect((await emitAck(a.c, 'room-snapshot', { roomId: 'prv-x' })).ok).toBe(false);
  });

  test('devices:find: 찾음/자기 제외/NOT_FOUND/INVALID/11번째 RATE_LIMITED', async () => {
    const a = await connect(freshIp());
    const b = await connect(freshIp());
    const id = b.reg.identity;
    const found = await emitAck(a.c, 'devices:find', { adj: id.adj, animal: id.animal, ...(id.suffix ? { suffix: id.suffix } : {}) });
    expect(found.ok).toBe(true);
    expect(found.device.socketId).toBe(b.c.id);
    const mine = a.reg.identity;
    const self = await emitAck(a.c, 'devices:find', { adj: mine.adj, animal: mine.animal, ...(mine.suffix ? { suffix: mine.suffix } : {}) });
    expect(self).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await emitAck(a.c, 'devices:find', { adj: 99, animal: 0 })).toMatchObject({ ok: false, code: 'INVALID' });
    // 지금까지 유효 요청 2회(INVALID는 제한에 세지 않음) → 8회 더
    for (let i = 0; i < 8; i++) await emitAck(a.c, 'devices:find', { adj: 0, animal: 0, suffix: 999 });
    expect(await emitAck(a.c, 'devices:find', { adj: 0, animal: 0 })).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});
