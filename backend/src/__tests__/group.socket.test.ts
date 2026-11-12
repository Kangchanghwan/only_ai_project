import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { verifyRoomToken } from '../utils/roomToken';
import { verifyTicket, issueTicket } from '../utils/privateTicket';
import { newPrivateRoomId } from '../utils/privateRoom';

type Client = ReturnType<typeof ioClient>;

describe('Socket.IO - 그룹 방', () => {
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
    delete process.env.PRIVATE_GROUP_MAX_MEMBERS;
    delete process.env.PRIVATE_INVITE_TTL_SEC;
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    setTimeout(done, 50);
  });

  let ipCounter = 40;
  const freshIp = () => `198.51.100.${(++ipCounter % 250) + 1}`;
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

  const connect = (ip: string = freshIp()): Promise<Client> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        extraHeaders: { 'x-forwarded-for': ip },
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

  test('A create → invite → B 초대 입장권으로 join → B는 30일 입장권, 둘 다 room-users 2대 → C join 3대', async () => {
    const A = await connect();
    const B = await connect();
    const C = await connect();
    const a = collect(A, ['room-users', 'message']);
    const b = collect(B, ['room-users', 'message']);

    const created = await ask(A, 'private:create');
    expect(created.roomId).toMatch(/^prv-g-[0-9a-f]{24}$/);
    expect(verifyRoomToken(created.roomId, created.roomToken)).toBe('valid');
    expect(created.devices).toHaveLength(1);
    const roomId = created.roomId as string;
    const own = verifyTicket(created.ticket);
    expect(own.ok && own.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 24 * 3600);

    const inv = await ask(A, 'private:invite', { roomId });
    expect(inv.ticket.startsWith(`pv1.${roomId}.`)).toBe(true);
    const iv = verifyTicket(inv.ticket);
    expect(iv.ok).toBe(true);
    const left = (iv as { exp: number }).exp - Math.floor(Date.now() / 1000);
    expect(left).toBeGreaterThan(590);
    expect(left).toBeLessThanOrEqual(600);
    expect(inv.expiresAt).toBe((iv as { exp: number }).exp * 1000);

    const joinB = await ask(B, 'private:join', { tickets: [inv.ticket] });
    expect(joinB.ok).toBe(true);
    expect(joinB.invalid).toEqual([]);
    expect(joinB.full).toEqual([]);
    expect(joinB.rooms[0].roomId).toBe(roomId);
    const bt = verifyTicket(joinB.rooms[0].ticket);
    expect(bt.ok && bt.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 24 * 3600);
    expect(verifyRoomToken(roomId, joinB.rooms[0].roomToken)).toBe('valid');
    await wait();
    const lastA = a['room-users'].filter((p) => p.roomId === roomId).pop();
    const lastB = b['room-users'].filter((p) => p.roomId === roomId).pop();
    expect(lastA.devices).toHaveLength(2);
    expect(lastB.devices).toHaveLength(2);

    const invB = await ask(B, 'private:invite', { roomId });
    const joinC = await ask(C, 'private:join', { tickets: [invB.ticket] });
    expect(joinC.rooms[0].devices).toHaveLength(3);
    await wait();
    expect(a['room-users'].filter((p) => p.roomId === roomId).pop().devices).toHaveLength(3);
  });

  test('만료된 초대 입장권은 invalid (full 아님)', async () => {
    process.env.PRIVATE_INVITE_TTL_SEC = '1';
    const A = await connect();
    const B = await connect();
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    await wait(1200);
    const r = await ask(B, 'private:join', { tickets: [inv.ticket] });
    expect(r.rooms).toEqual([]);
    expect(r.invalid).toEqual([inv.ticket]);
    expect(r.full).toEqual([]);
  });

  test('상한: env 2로 두면 세 번째는 full 이고 invalid 에 들어가지 않는다. 멤버가 나가면 다시 들어올 수 있다', async () => {
    process.env.PRIVATE_GROUP_MAX_MEMBERS = '2';
    const A = await connect();
    const B = await connect();
    const C = await connect();
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    expect((await ask(B, 'private:join', { tickets: [inv.ticket] })).rooms).toHaveLength(1);

    const joinC = await ask(C, 'private:join', { tickets: [inv.ticket] });
    expect(joinC.ok).toBe(true);
    expect(joinC.rooms).toEqual([]);
    expect(joinC.invalid).toEqual([]);
    expect(joinC.full).toEqual([roomId]);
    // C는 방에 들어가지 못했으므로 발행·토큰이 없다
    const tokens: any = await ask(C, 'room-tokens');
    expect(tokens.roomTokens[roomId]).toBeUndefined();

    // 이미 멤버인 기기가 다시 join(재접속)해도 full 이 아니다
    const again = await ask(B, 'private:join', { tickets: [inv.ticket] });
    expect(again.rooms).toHaveLength(1);
    expect(again.full).toEqual([]);

    // 한 명이 나가면 자리가 난다
    await ask(B, 'private:leave', { roomId });
    const retry = await ask(C, 'private:join', { tickets: [inv.ticket] });
    expect(retry.rooms).toHaveLength(1);
  });

  test('1:1 방은 상한(PRIVATE_GROUP_MAX_MEMBERS)과 무관하다', async () => {
    process.env.PRIVATE_GROUP_MAX_MEMBERS = '1';
    const A = await connect();
    const roomId = newPrivateRoomId();
    const r = await ask(A, 'private:join', { tickets: [issueTicket(roomId)] });
    expect(r.rooms).toHaveLength(1);
    expect(r.full).toEqual([]);
  });

  test('비멤버의 invite 거부, 1:1 방 ID로 invite 거부, 잘못된 payload 거부', async () => {
    const A = await connect();
    const B = await connect();
    const { roomId } = await ask(A, 'private:create');
    expect(await ask(B, 'private:invite', { roomId })).toMatchObject({ error: 'NOT_ALLOWED' });

    const oneToOne = newPrivateRoomId();
    await ask(A, 'private:join', { tickets: [issueTicket(oneToOne)] });
    expect(await ask(A, 'private:invite', { roomId: oneToOne })).toMatchObject({ error: 'NOT_ALLOWED' });
    expect(await ask(A, 'private:invite', { roomId: 'prv-g-zzz' })).toMatchObject({ error: 'NOT_ALLOWED' });
    expect(await ask(A, 'private:invite', {})).toMatchObject({ error: 'NOT_ALLOWED' });
    expect(await ask(A, 'private:invite', { roomId: 'room-shared' })).toMatchObject({ error: 'NOT_ALLOWED' });
  });

  test('방 개수 상한이면 create 는 TOO_MANY_ROOMS', async () => {
    const A = await connect();
    for (let i = 0; i < 10; i++) expect((await ask(A, 'private:create')).roomId).toBeTruthy();
    expect(await ask(A, 'private:create')).toMatchObject({ error: 'TOO_MANY_ROOMS' });
  });

  test('그룹 방에 정확히 둘만 접속 중이면 ALREADY_PAIRED, 셋이면 허용', async () => {
    const A = await connect();
    const B = await connect();
    const C = await connect();
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    await ask(B, 'private:join', { tickets: [inv.ticket] });
    expect(await ask(A, 'pair:invite', { to: B.id })).toMatchObject({ ok: false, code: 'ALREADY_PAIRED' });
    const inv2 = await ask(A, 'private:invite', { roomId });
    await ask(C, 'private:join', { tickets: [inv2.ticket] });
    const res = await ask(A, 'pair:invite', { to: B.id });
    expect(res.ok).toBe(true);
    expect(res.code).toBeUndefined();
  });

  test('1:1 방을 같이 쓰면 여전히 ALREADY_PAIRED', async () => {
    const A = await connect();
    const B = await connect();
    const roomId = newPrivateRoomId();
    const t = issueTicket(roomId);
    await ask(A, 'private:join', { tickets: [t] });
    await ask(B, 'private:join', { tickets: [t] });
    expect(await ask(A, 'pair:invite', { to: B.id })).toMatchObject({ ok: false, code: 'ALREADY_PAIRED' });
  });

  test('그룹 방 publish 는 멤버 전원이 받고, 비멤버는 못 받고 발행도 못 한다', async () => {
    const ip = freshIp();
    const A = await connect(ip);
    const B = await connect();
    const C = await connect();
    const outsider = await connect(ip); // A와 같은 IP지만 방 멤버 아님
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    await ask(B, 'private:join', { tickets: [inv.ticket] });
    await ask(C, 'private:join', { tickets: [inv.ticket] });
    const a = collect(A, ['message']);
    const b = collect(B, ['message']);
    const c = collect(C, ['message']);
    const o = collect(outsider, ['message']);

    const res: any = await new Promise((r) => A.emit('publish', { type: 'file-uploaded', fileName: 'x' }, roomId, (e: any, resp: any) => r({ e, resp })));
    expect(res.e).toBeNull();
    await wait();
    for (const got of [a, b, c]) expect(got.message.filter((m) => m.fileName === 'x')).toHaveLength(1);
    expect(o.message.filter((m) => m.fileName === 'x')).toHaveLength(0);

    const bad: any = await new Promise((r) => outsider.emit('publish', { type: 'file-uploaded', fileName: 'y' }, roomId, (e: any) => r(e)));
    expect(bad).toBeTruthy();
    await wait();
    expect(a.message.filter((m) => m.fileName === 'y')).toHaveLength(0);
  });

  test('private:leave 는 남은 멤버에게 알리고 방은 유지된다', async () => {
    const A = await connect();
    const B = await connect();
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    await ask(B, 'private:join', { tickets: [inv.ticket] });
    const a = collect(A, ['room-users', 'message']);
    await ask(B, 'private:leave', { roomId });
    await wait();
    expect(a.message).toContainEqual({ type: 'private-left', roomId });
    expect(a['room-users'].filter((p) => p.roomId === roomId).pop().devices).toHaveLength(1);
  });

  test('룸 토큰·REST: 그룹 방 ID 로 목록 조회 시 토큰 없으면 401, 있으면 통과. 일반 업로드는 PRIVATE_ROOM_LOCKED_ONLY', async () => {
    const A = await connect();
    const { roomId, roomToken } = await ask(A, 'private:create');
    const noToken = await fetch(`http://localhost:${port}/api/r2/files/${roomId}`);
    expect(noToken.status).toBe(401);
    const withToken = await fetch(`http://localhost:${port}/api/r2/files/${roomId}`, { headers: { 'X-Room-Token': roomToken } });
    expect(withToken.status).not.toBe(401);
    expect(withToken.status).not.toBe(400);

    const post = (path: string, body: unknown) =>
      fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r1 = await post('/api/r2/presigned-url', { roomId, fileName: 'a.txt', contentType: 'text/plain' });
    const r2 = await post('/api/r2/multipart/create', { roomId, fileName: 'a.bin', contentType: 'application/octet-stream', size: 10 });
    for (const r of [r1, r2]) {
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).code).toBe('PRIVATE_ROOM_LOCKED_ONLY');
    }
  });

  test('그룹 방 텍스트: 암호문만 받고 평문은 거부, 멤버 전원이 받는다', async () => {
    const A = await connect();
    const B = await connect();
    const { roomId } = await ask(A, 'private:create');
    const inv = await ask(A, 'private:invite', { roomId });
    await ask(B, 'private:join', { tickets: [inv.ticket] });
    const b = collect(B, ['message']);
    const enc = { v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAA' };
    const res: any = await new Promise((r) =>
      A.emit('publish', { type: 'text-shared', textId: 'a'.repeat(32), enc, timestamp: Date.now(), roomId }, roomId, (e: any, resp: any) => r({ e, resp }))
    );
    expect(res.e).toBeNull();
    await wait();
    const got = b.message.find((m) => m.type === 'text-shared');
    expect(got).toBeTruthy();
    expect(got.content).toBeUndefined();
    expect(got.enc).toBeTruthy();
  });
});
