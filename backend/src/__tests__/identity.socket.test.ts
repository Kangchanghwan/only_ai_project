import { httpServer } from '../server';
import ioClient from 'socket.io-client';
import { AddressInfo } from 'net';
import { R2Service } from '../services/r2Service';
import { resetDailyQuota } from '../utils/dailyQuota';
import { resetUploaders } from '../utils/uploaderStore';

type Client = ReturnType<typeof ioClient>;
type Registered = { globalRoomId: string; ipRoomId: string; identity: { adj: number; animal: number; suffix?: number }; roomTokens: Record<string, string> };

describe('Socket.IO - 정체성 / 보낸 사람 / 업로더', () => {
  let port: number;
  const clients: Client[] = [];

  beforeAll((done) => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });
  afterAll((done) => {
    httpServer.close(() => done());
  });
  beforeEach(() => {
    resetDailyQuota();
    resetUploaders();
  });
  afterEach((done) => {
    clients.forEach((c) => c.connected && c.disconnect());
    clients.length = 0;
    jest.restoreAllMocks();
    setTimeout(done, 50);
  });

  // 각 테스트가 서로 격리되도록 테스트마다 고유 IP를 쓴다 (IP 룸 분리). 전역 룸은 공유된다.
  let ipCounter = 0;
  const freshIp = () => `198.51.100.${(++ipCounter % 250) + 1}`;

  const connect = (ip: string, auth: Record<string, unknown> = {}, ua?: string): Promise<{ c: Client; reg: Registered }> =>
    new Promise((resolve) => {
      const c = (ioClient as unknown as (url: string, opts: Record<string, unknown>) => Client)(`http://localhost:${port}`, {
        transports: ['polling'],
        auth,
        extraHeaders: { 'x-forwarded-for': ip, ...(ua ? { 'user-agent': ua } : {}) },
      });
      clients.push(c);
      c.on('registered', (reg: Registered) => resolve({ c, reg }));
    });
  const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
  const lastUsers = (c: Client, roomId: string) => {
    const box: { devices: any[] } = { devices: [] };
    c.on('room-users', (p: any) => { if (p.roomId === roomId) box.devices = p.devices; });
    return box;
  };

  test('할당된 정체성이 registered에 담기고 room-users devices[]에 확장 필드가 있다', async () => {
    const { c, reg } = await connect(freshIp(), {}, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    expect(reg.identity.adj).toBeGreaterThanOrEqual(0);
    const box = lastUsers(c, reg.ipRoomId);
    c.emit('identity:reroll'); // room-users 재브로드캐스트를 유도해 목록을 받는다
    await wait();
    const me = box.devices.find((d) => d.socketId === c.id);
    expect(me).toMatchObject({ deviceType: 'desktop', os: 'macOS', browser: 'Chrome', deviceLabel: 'mac' });
    expect(typeof me.joinedAt).toBe('number');
    expect(me.identity).toBeTruthy();
  });

  test('저장된 정체성이 비어 있으면 그대로 재사용한다', async () => {
    // 다른 테스트와 겹치지 않도록 전역 룸 사용 현황을 보고 비어 있는 조합을 고른다
    const probe = await connect(freshIp());
    const taken = probe.reg.identity;
    probe.c.disconnect();
    await wait();
    const { reg } = await connect(freshIp(), { identity: { adj: taken.adj, animal: taken.animal } });
    expect(reg.identity).toMatchObject({ adj: taken.adj, animal: taken.animal });
  });

  test('같은 방의 다른 소켓이 같은 조합을 쓰고 있으면 동물은 유지하고 형용사를 바꿔 재할당한다', async () => {
    const ip = freshIp();
    const first = await connect(ip, { identity: { adj: 5, animal: 9 } });
    const second = await connect(ip, { identity: { adj: 5, animal: 9 } });
    expect(second.reg.identity.animal).toBe(first.reg.identity.animal);
    expect(second.reg.identity.adj).not.toBe(first.reg.identity.adj);
  });

  test('다른 IP 룸이라도 전역 룸에서 겹치면 재할당된다', async () => {
    const first = await connect(freshIp(), { identity: { adj: 7, animal: 3 } });
    const second = await connect(freshIp(), { identity: { adj: 7, animal: 3 } });
    expect(`${second.reg.identity.adj}:${second.reg.identity.animal}`).not.toBe(`${first.reg.identity.adj}:${first.reg.identity.animal}`);
  });

  test('잘못된 저장 정체성은 무시하고 새로 뽑는다', async () => {
    const { reg } = await connect(freshIp(), { identity: { adj: 999, animal: -1 }, hints: 'junk' });
    expect(reg.identity.adj).toBeLessThan(24);
    expect(reg.identity.animal).toBeLessThan(24);
  });

  test('identity:reroll — 새 조합으로 바뀌고 room-users가 재브로드캐스트, 3초 쿨다운', async () => {
    const ip = freshIp();
    const a = await connect(ip);
    const b = await connect(ip);
    const seenByB = lastUsers(b.c, b.reg.ipRoomId);
    const before = a.reg.identity;

    const first: any = await new Promise((resolve) => a.c.emit('identity:reroll', resolve));
    expect(first.ok).toBe(true);
    expect(`${first.identity.adj}:${first.identity.animal}`).not.toBe(`${before.adj}:${before.animal}`);
    await wait();
    expect(seenByB.devices.find((d) => d.socketId === a.c.id).identity).toMatchObject({ adj: first.identity.adj, animal: first.identity.animal });

    const second: any = await new Promise((resolve) => a.c.emit('identity:reroll', resolve));
    expect(second.ok).toBe(false);
    expect(second.error).toBe('cooldown');
    expect(second.retryAfterMs).toBeGreaterThan(0);
    expect(second.retryAfterMs).toBeLessThanOrEqual(3000);
  });

  test('모든 소켓 힌트가 sanitize되어 model에 반영된다', async () => {
    const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const ip = freshIp();
    const a = await connect(ip, { hints: { model: 'Pixel 8 <b>' } }, ua);
    const b = await connect(ip);
    const box = lastUsers(b.c, b.reg.ipRoomId);
    b.c.emit('identity:reroll');
    await wait();
    expect(box.devices.find((d) => d.socketId === a.c.id)).toMatchObject({ deviceLabel: 'android_phone', model: 'Pixel 8 b' });
  });

  test('publish: 서버가 sender를 붙이고, 클라이언트가 보낸 sender는 덮어쓴다', async () => {
    const ip = freshIp();
    const a = await connect(ip);
    const b = await connect(ip);
    const got: any[] = [];
    b.c.on('message', (m: any) => got.push(m));
    a.c.emit('publish', { type: 'text-shared', textId: 't1', sender: { socketId: 'forged', identity: { adj: 0, animal: 0 } } }, 'ip');
    await wait();
    expect(got).toHaveLength(1);
    expect(got[0].type).toBe('text-shared');
    expect(got[0].sender.socketId).toBe(a.c.id);
    expect(got[0].sender.identity).toMatchObject({ adj: a.reg.identity.adj, animal: a.reg.identity.animal });
    expect(got[0].sender).toHaveProperty('deviceLabel');
    expect(got[0].sender).toHaveProperty('browser');
  });

  test('publish: 전역 룸 메시지에도 sender가 붙는다', async () => {
    const a = await connect(freshIp());
    const b = await connect(freshIp());
    const got: any[] = [];
    b.c.on('message', (m: any) => got.push(m));
    a.c.emit('publish', { type: 'file-uploaded', fileName: 'x.png', sender: 'evil' }, 'global');
    await wait();
    const mine = got.find((m) => m.fileName === 'x.png');
    expect(mine.sender.socketId).toBe(a.c.id);
  });

  test('파일 목록 API가 업로더(presign 시점 기록)를 돌려준다 / 삭제 시 제거', async () => {
    const ip = freshIp();
    const a = await connect(ip, {}, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    const roomId = a.reg.ipRoomId;
    const headers = { 'Content-Type': 'application/json', 'X-Room-Token': a.reg.roomTokens[roomId] };
    const base = `http://127.0.0.1:${port}`;
    jest.spyOn(R2Service.prototype, 'getRoomTotalSize').mockResolvedValue(0);
    jest.spyOn(R2Service.prototype, 'getUploadPresignedUrls').mockImplementation(async (_r, files) =>
      files.map((f) => ({ uploadUrl: 'https://u', fileUrl: 'https://f', fileName: `1-${f.fileName}` })));
    jest.spyOn(R2Service.prototype, 'loadFiles').mockResolvedValue({
      files: [
        { name: '1-a.png', url: 'u', size: 1, lastModified: '2026-01-01T00:00:00Z' },
        { name: 'old.png', url: 'u', size: 1, lastModified: '2026-01-01T00:00:00Z' },
      ],
    });
    const del = jest.spyOn(R2Service.prototype, 'deleteFile').mockResolvedValue();

    const presign = await fetch(`${base}/api/r2/presigned-urls`, {
      method: 'POST', headers,
      body: JSON.stringify({ roomId, socketId: a.c.id, files: [{ fileName: 'a.png', contentType: 'image/png', size: 10 }] }),
    });
    expect(presign.status).toBe(200);

    const list: any = await (await fetch(`${base}/api/r2/files/${roomId}`, { headers })).json();
    const withUp = list.files.find((f: any) => f.name === '1-a.png');
    expect(withUp.uploader).toMatchObject({ socketId: a.c.id, deviceLabel: 'windows_pc', browser: 'Chrome' });
    expect(withUp.uploader.identity).toMatchObject({ adj: a.reg.identity.adj, animal: a.reg.identity.animal });
    // 기록이 없는 파일(서버 재시작 전 업로드 등)은 uploader 필드 없음
    expect(list.files.find((f: any) => f.name === 'old.png').uploader).toBeUndefined();

    await fetch(`${base}/api/r2/files/${roomId}/1-a.png`, { method: 'DELETE', headers });
    expect(del).toHaveBeenCalled();
    const after: any = await (await fetch(`${base}/api/r2/files/${roomId}`, { headers })).json();
    expect(after.files.find((f: any) => f.name === '1-a.png').uploader).toBeUndefined();
  });

  test('다른 룸의 소켓 ID로 업로더를 위장할 수 없다', async () => {
    const a = await connect(freshIp());
    const other = await connect(freshIp());
    const roomId = a.reg.ipRoomId;
    const headers = { 'Content-Type': 'application/json', 'X-Room-Token': a.reg.roomTokens[roomId] };
    jest.spyOn(R2Service.prototype, 'getRoomTotalSize').mockResolvedValue(0);
    jest.spyOn(R2Service.prototype, 'getUploadPresignedUrls').mockImplementation(async (_r, files) =>
      files.map((f) => ({ uploadUrl: 'u', fileUrl: 'f', fileName: `9-${f.fileName}` })));
    jest.spyOn(R2Service.prototype, 'loadFiles').mockResolvedValue({
      files: [{ name: '9-z.png', url: 'u', size: 1, lastModified: '2026-01-01T00:00:00Z' }],
    });
    const base = `http://127.0.0.1:${port}`;
    await fetch(`${base}/api/r2/presigned-urls`, {
      method: 'POST', headers,
      body: JSON.stringify({ roomId, socketId: other.c.id, files: [{ fileName: 'z.png', contentType: 'image/png', size: 5 }] }),
    });
    const list: any = await (await fetch(`${base}/api/r2/files/${roomId}`, { headers })).json();
    expect(list.files[0].uploader).toBeUndefined();
  });
});
