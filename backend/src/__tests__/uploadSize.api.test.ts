import { httpServer } from '../server';
import { AddressInfo } from 'net';
import { issueRoomToken } from '../utils/roomToken';
import { R2Service } from '../services/r2Service';

const AUTH = { 'X-Room-Token': issueRoomToken('room-x') };
const MB = 1024 * 1024;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

/** presign 용량 강제 (파일당 500MB, 룸 2048MB 기본값) */
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
    httpServer.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  beforeEach(() => {
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

  test('파일당 한도(500MB) 초과는 413', async () => {
    const res = await batch([{ fileName: 'big.bin', contentType: 'application/octet-stream', size: 500 * MB + 1 }]);
    expect(res.status).toBe(413);
    expect((await single({ size: 501 * MB })).status).toBe(413);
  });

  test('정확히 500MB는 허용된다', async () => {
    const res = await batch([{ fileName: 'edge.bin', contentType: 'application/octet-stream', size: 500 * MB }]);
    expect(res.status).toBe(200);
  });

  test('size가 0, 음수, 숫자가 아니면 400', async () => {
    for (const size of [0, -1, 1.5, '100']) {
      const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size }]);
      expect(res.status).toBe(400);
    }
    expect((await single({ size: 0 })).status).toBe(400);
  });

  test('룸 사용량 + 요청 합계가 2048MB를 넘으면 413', async () => {
    roomSizeSpy.mockResolvedValue(1900 * MB);
    const res = await batch([
      { fileName: 'a.bin', contentType: 'application/octet-stream', size: 100 * MB },
      { fileName: 'b.bin', contentType: 'application/octet-stream', size: 100 * MB },
    ]);
    expect(res.status).toBe(413);
    expect((await single({ size: 149 * MB })).status).toBe(413);
  });

  test('룸 한도 이내면 허용된다', async () => {
    roomSizeSpy.mockResolvedValue(1900 * MB);
    const res = await batch([{ fileName: 'a.bin', contentType: 'application/octet-stream', size: 100 * MB }]);
    expect(res.status).toBe(200);
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
