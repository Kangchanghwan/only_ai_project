import { httpServer } from '../server';
import { AddressInfo } from 'net';
import { issueRoomToken } from '../utils/roomToken';
import { R2Service } from '../services/r2Service';
import { resetDailyQuota } from '../utils/dailyQuota';

const AUTH = { 'X-Room-Token': issueRoomToken('room-x') };
const MB = 1024 * 1024;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

/** presign 용량 강제 (파일당 5120MB, 룸 10240MB, 단일 PUT 100MB 기본값) */
describe('presign 크기 강제', () => {
  let baseUrl: string;
  let roomSizeSpy: jest.SpyInstance;

  beforeAll((done) => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
    delete process.env.MAX_FILE_SIZE_MB;
    delete process.env.MAX_ROOM_SIZE_MB;
    delete process.env.SINGLE_PUT_MAX_MB;
    delete process.env.DAILY_UPLOAD_QUOTA_GB;
    httpServer.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  beforeEach(() => {
    resetDailyQuota();
    roomSizeSpy = jest.spyOn(R2Service.prototype, 'getRoomTotalSize').mockResolvedValue(0);
  });

  afterEach(() => roomSizeSpy.mockRestore());

  const batch = (files: object[]) =>
    fetch(`${baseUrl}/api/r2/presigned-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ roomId: 'room-x', files }),
    });

  const single = (extra: object) =>
    fetch(`${baseUrl}/api/r2/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ roomId: 'room-x', fileName: 'a.bin', contentType: 'application/octet-stream', ...extra }),
    });

  test('정상 크기면 Content-Length가 서명 헤더에 포함된 URL을 발급한다', async () => {
    const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size: 5 * MB }]);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const url = new URL(body.files[0].uploadUrl);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });

  test('단일 PUT 100MB 초과는 413 + SINGLE_PUT_TOO_LARGE', async () => {
    const res = await batch([{ fileName: 'big.bin', contentType: 'application/octet-stream', size: 100 * MB + 1 }]);
    expect(res.status).toBe(413);
    expect((await readJson(res)).code).toBe('SINGLE_PUT_TOO_LARGE');
    const one = await single({ size: 101 * MB });
    expect(one.status).toBe(413);
    expect((await readJson(one)).code).toBe('SINGLE_PUT_TOO_LARGE');
  });

  test('정확히 100MB 단일 PUT은 허용된다', async () => {
    const res = await batch([{ fileName: 'edge.bin', contentType: 'application/octet-stream', size: 100 * MB }]);
    expect(res.status).toBe(200);
  });

  test('파일당 한도(5120MB) 초과는 FILE_TOO_LARGE, SINGLE_PUT_MAX_MB를 올리면 단일도 허용', async () => {
    const res = await single({ size: 5120 * MB + 1 });
    expect(res.status).toBe(413);
    expect((await readJson(res)).code).toBe('FILE_TOO_LARGE');
    process.env.SINGLE_PUT_MAX_MB = '500';
    try {
      expect((await single({ size: 500 * MB })).status).toBe(200);
    } finally {
      delete process.env.SINGLE_PUT_MAX_MB;
    }
  });

  test('size가 0, 음수, 숫자가 아니면 400', async () => {
    for (const size of [0, -1, 1.5, '100']) {
      const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size }]);
      expect(res.status).toBe(400);
    }
    expect((await single({ size: 0 })).status).toBe(400);
  });

  test('룸 사용량 + 요청 합계가 10240MB를 넘으면 413', async () => {
    roomSizeSpy.mockResolvedValue(10140 * MB);
    const res = await batch([
      { fileName: 'a.bin', contentType: 'application/octet-stream', size: 60 * MB },
      { fileName: 'b.bin', contentType: 'application/octet-stream', size: 60 * MB },
    ]);
    expect(res.status).toBe(413);
    expect((await readJson(res)).code).toBe('ROOM_SIZE_EXCEEDED');
    expect((await single({ size: 101 * MB })).status).toBe(413);
  });

  test('룸 한도 이내면 허용된다', async () => {
    roomSizeSpy.mockResolvedValue(10140 * MB);
    const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size: 100 * MB }]);
    expect(res.status).toBe(200);
  });

  test('IP 일일 한도 초과는 429 + DAILY_QUOTA_EXCEEDED + 남은 용량', async () => {
    process.env.DAILY_UPLOAD_QUOTA_GB = '1';
    try {
      expect((await single({ size: 100 * MB })).status).toBe(200);
      const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size: 100 * MB }]);
      expect(res.status).toBe(200);
      const over = await single({ size: 100 * MB * 9 + 1 });
      expect(over.status).toBe(413); // 단일 100MB 초과는 한도 이전에 거절
      let last = 200;
      for (let i = 0; i < 9; i++) last = (await single({ size: 100 * MB })).status;
      expect(last).toBe(429);
      const body = await readJson(await single({ size: 100 * MB }));
      expect(body.code).toBe('DAILY_QUOTA_EXCEEDED');
      expect(body.remainingBytes).toBeLessThan(100 * MB);
    } finally {
      delete process.env.DAILY_UPLOAD_QUOTA_GB;
    }
  });

  test('구버전 프론트(size 없음)는 그대로 허용되고 서명에 Content-Length가 없다', async () => {
    const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream' }]);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const url = new URL(body.files[0].uploadUrl);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).not.toContain('content-length');
    expect((await single({})).status).toBe(200);
  });
});
