import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { verifyRoomToken } from '../utils/roomToken';

type Client = ReturnType<typeof ioClient>;
type Registered = { globalRoomId: string; ipRoomId: string };

describe('Socket.IO - 1:1 연결 (비공개 방)', () => {
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

  let ipCounter = 100;
  const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

  const connect = (ip: string): Promise<{ c: Client; reg: Registered }> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
      });
      clients.push(c);
      c.on('registered', (reg: Registered) => resolve({ c, reg }));
    });

  /** 이벤트를 모아 두는 수집기 */
  const collect = (c: Client, events: string[]) => {
    const got: Record<string, any[]> = {};
    for (const e of events) {
      got[e] = [];
      c.on(e, (p: any) => got[e].push(p));
    }
    return got;
  };
  const ask = (c: Client, event: string, payload: unknown): Promise<any> => new Promise((r) => c.emit(event, payload, r));
  const EVENTS = ['pair:incoming', 'pair:accepted', 'pair:signal', 'pair:ended', 'pair:done', 'room-users', 'message'];

  /** A(요청자)와 B(대상)를 서로 다른 IP로 연결하고 수락까지 진행 */
  const setupAccepted = async () => {
    const A = await connect(freshIp());
    const B = await connect(freshIp());
    const a = collect(A.c, EVENTS);
    const b = collect(B.c, EVENTS);
    const inv = await ask(A.c, 'pair:invite', { to: B.c.id });
    expect(inv.ok).toBe(true);
    await wait();
    const res = await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: true });
    expect(res.ok).toBe(true);
    await wait();
    return { A, B, a, b, sessionId: inv.sessionId as string };
  };

  const pairUp = async () => {
    const ctx = await setupAccepted();
    await ask(ctx.A.c, 'pair:confirm', { sessionId: ctx.sessionId, same: true });
    await ask(ctx.B.c, 'pair:confirm', { sessionId: ctx.sessionId, same: true });
    await wait();
    return { ...ctx, roomId: ctx.a['pair:done'][0].roomId as string };
  };

  test('다른 IP끼리 초대→수락→시그널 중계→확인으로 같은 방 pair:done', async () => {
    const { A, B, a, b, sessionId } = await setupAccepted();

    expect(b['pair:incoming'][0]).toMatchObject({ sessionId, sameNetwork: false });
    expect(b['pair:incoming'][0].from.socketId).toBe(A.c.id);
    expect(typeof b['pair:incoming'][0].expiresAt).toBe('number');
    expect(a['pair:accepted'][0]).toMatchObject({ sessionId, role: 'initiator' });
    expect(a['pair:accepted'][0].peer.socketId).toBe(B.c.id);
    expect(b['pair:accepted'][0]).toMatchObject({ sessionId, role: 'responder' });
    expect(b['pair:accepted'][0].peer.socketId).toBe(A.c.id);

    A.c.emit('pair:signal', { sessionId, data: { t: 'pk', v: 1, pk: 'abc' } });
    await wait();
    expect(b['pair:signal']).toEqual([{ sessionId, data: { t: 'pk', v: 1, pk: 'abc' } }]);
    expect(a['pair:signal']).toHaveLength(0);

    await ask(A.c, 'pair:confirm', { sessionId, same: true });
    await wait();
    expect(a['pair:done']).toHaveLength(0); // 한쪽만 확인하면 아직 방 없음
    await ask(B.c, 'pair:confirm', { sessionId, same: true });
    await wait();

    const da = a['pair:done'][0];
    const db = b['pair:done'][0];
    expect(da.roomId).toMatch(/^prv-[0-9a-f]{24}$/);
    expect(db.roomId).toBe(da.roomId);
    expect(da.peer.socketId).toBe(B.c.id);
    expect(db.peer.socketId).toBe(A.c.id);
    expect(da.roomTokenTtlSec).toBeGreaterThan(0);
    expect(verifyRoomToken(da.roomId, da.roomToken)).toBe('valid');
    expect(verifyRoomToken(db.roomId, db.roomToken)).toBe('valid');
    const ru = a['room-users'].find((p) => p.roomId === da.roomId);
    expect(ru.devices.map((d: any) => d.socketId).sort()).toEqual([A.c.id, B.c.id].sort());

    // room-tokens에 비공개 방 포함
    const tokens: any = await new Promise((r) => A.c.emit('room-tokens', r));
    expect(verifyRoomToken(da.roomId, tokens.roomTokens[da.roomId])).toBe('valid');

    // 토큰 없는 REST 접근은 401
    const res = await fetch(`http://localhost:${port}/api/r2/files/${da.roomId}`);
    expect(res.status).toBe(401);
  });

  test('세션 멤버가 아닌 소켓의 pair:signal은 무시, 4KB 초과도 무시', async () => {
    const { sessionId, a, b } = await setupAccepted();
    const C = await connect(freshIp());
    const c = collect(C.c, EVENTS);
    C.c.emit('pair:signal', { sessionId, data: { t: 'pk' } });
    await wait();
    expect(a['pair:signal']).toHaveLength(0);
    expect(b['pair:signal']).toHaveLength(0);
    expect(c['pair:signal']).toHaveLength(0);
  });

  test('4KB 초과 signal 은 중계되지 않는다', async () => {
    const { A, sessionId, b } = await setupAccepted();
    A.c.emit('pair:signal', { sessionId, data: { pk: 'x'.repeat(5000) } });
    A.c.emit('pair:signal', { sessionId, data: { pk: 'ok' } });
    await wait();
    expect(b['pair:signal']).toEqual([{ sessionId, data: { pk: 'ok' } }]);
  });

  test('비공개 방 publish는 파트너에게만 간다 (같은 IP의 제3 소켓은 못 받음)', async () => {
    const ipA = freshIp();
    const A = await connect(ipA);
    const C = await connect(ipA); // A와 같은 네트워크
    const B = await connect(freshIp());
    const a = collect(A.c, EVENTS);
    const b = collect(B.c, EVENTS);
    const c = collect(C.c, EVENTS);
    const inv = await ask(A.c, 'pair:invite', { to: B.c.id });
    await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: true });
    await ask(A.c, 'pair:confirm', { sessionId: inv.sessionId, same: true });
    await ask(B.c, 'pair:confirm', { sessionId: inv.sessionId, same: true });
    await wait();
    const roomId = a['pair:done'][0].roomId;

    // 방 멤버가 아닌 같은 IP 소켓은 발행 불가
    const errC: any = await new Promise((r) => C.c.emit('publish', { type: 'text-shared', content: 'x' }, roomId, r));
    expect(errC).toBeTruthy();

    const ack: any = await new Promise((r) => A.c.emit('publish', { type: 'text-shared', content: 'hi' }, roomId, (e: any, res: any) => r({ e, res })));
    expect(ack.e).toBeNull();
    await wait();
    expect(b.message.some((m) => m.content === 'hi')).toBe(true);
    expect(a.message.some((m) => m.content === 'hi')).toBe(true);
    expect(c.message.some((m) => m.content === 'hi')).toBe(false);
    expect(c.message.some((m) => m.content === 'x')).toBe(false);
  });

  test('확정 전에는 prv- 대상으로 발행할 수 없다', async () => {
    const { A, sessionId } = await setupAccepted();
    void sessionId;
    const fake = 'prv-' + 'a'.repeat(24);
    const r: any = await new Promise((res) => A.c.emit('publish', { content: 'x' }, fake, (e: any) => res(e)));
    expect(r).toBeTruthy();
  });

  test('한쪽이 same=false면 mismatch로 방이 만들어지지 않는다', async () => {
    const { A, B, a, b, sessionId } = await setupAccepted();
    await ask(A.c, 'pair:confirm', { sessionId, same: true });
    await ask(B.c, 'pair:confirm', { sessionId, same: false });
    await wait();
    expect(a['pair:ended']).toEqual([{ sessionId, reason: 'mismatch' }]);
    expect(b['pair:ended']).toEqual([{ sessionId, reason: 'mismatch' }]);
    expect(a['pair:done']).toHaveLength(0);
    expect(b['pair:done']).toHaveLength(0);
    const again = await ask(A.c, 'pair:confirm', { sessionId, same: true });
    expect(again.ok).toBe(false);
  });

  test('거절하면 요청자에게 declined, 같은 상대에게 30초 쿨다운(COOLDOWN)', async () => {
    const A = await connect(freshIp());
    const B = await connect(freshIp());
    const a = collect(A.c, EVENTS);
    const inv = await ask(A.c, 'pair:invite', { to: B.c.id });
    await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: false });
    await wait();
    expect(a['pair:ended']).toEqual([{ sessionId: inv.sessionId, reason: 'declined' }]);
    const again = await ask(A.c, 'pair:invite', { to: B.c.id });
    expect(again).toEqual({ ok: false, code: 'COOLDOWN' });
  });

  test('block:true 거절 후 초대는 BLOCKED, 자기 자신·없는 소켓·이미 연결된 상대', async () => {
    const A = await connect(freshIp());
    const B = await connect(freshIp());
    const inv = await ask(A.c, 'pair:invite', { to: B.c.id });
    await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: false, block: true });
    expect(await ask(A.c, 'pair:invite', { to: B.c.id })).toEqual({ ok: false, code: 'BLOCKED' });
    expect(await ask(A.c, 'pair:invite', { to: A.c.id })).toEqual({ ok: false, code: 'SELF' });
    expect(await ask(A.c, 'pair:invite', { to: 'nope' })).toEqual({ ok: false, code: 'TARGET_NOT_FOUND' });
  });

  test('이미 같은 비공개 방을 공유하면 ALREADY_PAIRED', async () => {
    const { A, B } = await pairUp();
    expect(await ask(A.c, 'pair:invite', { to: B.c.id })).toEqual({ ok: false, code: 'ALREADY_PAIRED' });
  });

  test('요청 동시 3개 초과는 TOO_MANY', async () => {
    const A = await connect(freshIp());
    const targets = [await connect(freshIp()), await connect(freshIp()), await connect(freshIp()), await connect(freshIp())];
    for (let i = 0; i < 3; i++) expect((await ask(A.c, 'pair:invite', { to: targets[i].c.id })).ok).toBe(true);
    expect(await ask(A.c, 'pair:invite', { to: targets[3].c.id })).toEqual({ ok: false, code: 'TOO_MANY' });
  });

  test('pair 이벤트 토큰 버킷 초과는 RATE_LIMITED', async () => {
    const A = await connect(freshIp());
    const results: any[] = [];
    for (let i = 0; i < 30; i++) results.push(await ask(A.c, 'pair:cancel', { sessionId: 'x' }));
    expect(results.some((r) => r.code === 'RATE_LIMITED')).toBe(true);
  });

  test('pair:cancel은 상대에게 cancelled', async () => {
    const { A, b, sessionId } = await setupAccepted();
    await ask(A.c, 'pair:cancel', { sessionId });
    await wait();
    expect(b['pair:ended']).toEqual([{ sessionId, reason: 'cancelled' }]);
  });

  test('세션 중 상대가 끊기면 peer-left', async () => {
    const { B, a, sessionId } = await setupAccepted();
    B.c.disconnect();
    await wait(300);
    expect(a['pair:ended']).toEqual([{ sessionId, reason: 'peer-left' }]);
  });

  test('방 연결 후 상대가 끊기면 남은 쪽에 room-users 갱신', async () => {
    const { B, a, roomId } = await pairUp();
    B.c.disconnect();
    await wait(300);
    const last = a['room-users'].filter((p) => p.roomId === roomId).pop();
    expect(last.devices).toHaveLength(1);
  });

  test('private:leave는 ack 후 남은 멤버에게 room-users와 private-left 메시지', async () => {
    const { A, B, a, roomId } = await pairUp();
    const res = await ask(B.c, 'private:leave', { roomId });
    expect(res).toEqual({ ok: true });
    await wait();
    expect(a.message).toContainEqual({ type: 'private-left', roomId });
    const last = a['room-users'].filter((p) => p.roomId === roomId).pop();
    expect(last.devices.map((d: any) => d.socketId)).toEqual([A.c.id]);
    // 나간 쪽은 더 이상 발행 불가, 토큰에서도 빠진다
    const pub: any = await new Promise((r) => B.c.emit('publish', { content: 'x' }, roomId, (e: any) => r(e)));
    expect(pub).toBeTruthy();
    const tokens: any = await new Promise((r) => B.c.emit('room-tokens', r));
    expect(tokens.roomTokens[roomId]).toBeUndefined();
    expect((await ask(B.c, 'private:leave', { roomId })).ok).toBe(false);
  });

  test('일반 업로드 경로는 prv- roomId를 400 PRIVATE_ROOM_LOCKED_ONLY로 거부한다', async () => {
    const roomId = 'prv-' + 'a'.repeat(24);
    const post = (path: string, body: unknown) =>
      fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r1 = await post('/api/r2/presigned-url', { roomId, fileName: 'a.txt', contentType: 'text/plain' });
    const r2 = await post('/api/r2/presigned-urls', { roomId, files: [{ fileName: 'a.txt', contentType: 'text/plain' }] });
    const r3 = await post('/api/r2/multipart/create', { roomId, fileName: 'a.bin', contentType: 'application/octet-stream', size: 10 });
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).code).toBe('PRIVATE_ROOM_LOCKED_ONLY');
    }
    const form = new FormData();
    form.append('roomId', roomId);
    form.append('file', new Blob(['hi']), 'a.txt');
    const r4 = await fetch(`http://localhost:${port}/api/r2/upload`, { method: 'POST', body: form });
    expect(r4.status).toBe(400);
    expect(((await r4.json()) as any).code).toBe('PRIVATE_ROOM_LOCKED_ONLY');
  });

  describe('v3: pk / 선확인 / 입장권', () => {
    test('invite pk 전달 → 수락 전 signal 중계 → 선확인 → accept+same → done(ticket) → private:join 복구', async () => {
      const A = await connect(freshIp());
      const B = await connect(freshIp());
      const a = collect(A.c, EVENTS);
      const b = collect(B.c, EVENTS);

      const bad = await ask(A.c, 'pair:invite', { to: B.c.id, pk: 123 });
      expect(bad).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
      const long = await ask(A.c, 'pair:invite', { to: B.c.id, pk: 'x'.repeat(201) });
      expect(long.code).toBe('INVALID_PAYLOAD');

      const inv = await ask(A.c, 'pair:invite', { to: B.c.id, pk: 'PK_A' });
      expect(inv.ok).toBe(true);
      await wait();
      expect(b['pair:incoming'][0].pk).toBe('PK_A');

      B.c.emit('pair:signal', { sessionId: inv.sessionId, data: { t: 'pk', pk: 'PK_B' } });
      await wait();
      expect(a['pair:signal']).toEqual([{ sessionId: inv.sessionId, data: { t: 'pk', pk: 'PK_B' } }]);

      expect((await ask(A.c, 'pair:confirm', { sessionId: inv.sessionId, same: true })).ok).toBe(true);
      await wait();
      expect(a['pair:done']).toHaveLength(0);

      expect((await ask(B.c, 'pair:respond', { sessionId: inv.sessionId, accept: true, same: true })).ok).toBe(true);
      await wait();
      expect(a['pair:accepted']).toHaveLength(1);
      expect(a['pair:done']).toHaveLength(1);
      expect(b['pair:done']).toHaveLength(1);
      const done = b['pair:done'][0];
      expect(typeof done.ticket).toBe('string');
      expect(a['pair:done'][0].roomId).toBe(done.roomId);

      // 새로고침 시뮬레이션: B 끊고 새 소켓으로 입장권 사용
      B.c.disconnect();
      await wait();
      const B2 = await connect(freshIp());
      const b2 = collect(B2.c, EVENTS);
      const forged = done.ticket.slice(0, -3) + 'AAA';
      const res = await ask(B2.c, 'private:join', { tickets: [done.ticket, forged] });
      expect(res.ok).toBe(true);
      expect(res.invalid).toEqual([forged]);
      expect(res.rooms).toHaveLength(1);
      expect(res.rooms[0].roomId).toBe(done.roomId);
      expect(typeof res.rooms[0].ticket).toBe('string');
      expect(verifyRoomToken(done.roomId, res.rooms[0].roomToken)).toBe('valid');
      expect(res.rooms[0].devices).toHaveLength(2);
      await wait();
      expect(a['room-users'].some((u: any) => u.roomId === done.roomId && u.devices.length === 2)).toBe(true);

      // 재입장 소켓에서 publish → 상대에게 도달
      const pub = await new Promise<any>((r) => B2.c.emit('publish', { type: 'text', text: 'hi' }, done.roomId, (e: any, x: any) => r({ e, x })));
      expect(pub.e).toBeNull();
      await wait();
      expect(a['message'].some((m: any) => m.text === 'hi')).toBe(true);
      expect(b2['message'].length).toBeGreaterThan(0);
    });

    test('private:join 11장은 INVALID_PAYLOAD', async () => {
      const A = await connect(freshIp());
      const res = await ask(A.c, 'private:join', { tickets: Array(11).fill('x') });
      expect(res).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
      const res2 = await ask(A.c, 'private:join', {});
      expect(res2.code).toBe('INVALID_PAYLOAD');
    });
  });
});
