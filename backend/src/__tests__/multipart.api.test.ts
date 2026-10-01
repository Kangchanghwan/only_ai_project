import { httpServer } from '../server';
import { AddressInfo } from 'net';
import { issueRoomToken } from '../utils/roomToken';
import { R2Service } from '../services/r2Service';
import { resetDailyQuota } from '../utils/dailyQuota';
import { resetMultipartStore, partLength, computePartCount, MULTIPART_PART_SIZE } from '../utils/multipartStore';

const MB = 1024 * 1024;
const PART = MULTIPART_PART_SIZE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

describe('멀티파트 업로드 API', () => {
  let baseUrl: string;
  let spies: Record<string, jest.SpyInstance>;

  beforeAll((done) => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
    delete process.env.MAX_FILE_SIZE_MB;
    delete process.env.MAX_ROOM_SIZE_MB;
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
    resetMultipartStore();
    const proto = R2Service.prototype;
    spies = {
      room: jest.spyOn(proto, 'getRoomTotalSize').mockResolvedValue(0),
      create: jest.spyOn(proto, 'createMultipartUpload').mockImplementation(async (roomId, fileName) => ({
        uploadId: `up-${Math.random().toString(36).slice(2)}`,
        key: `${roomId}/${fileName}`,
        fileName,
      })),
      sign: jest.spyOn(proto, 'signUploadPart').mockImplementation(async (key, _id, n, len) => `https://signed.test/${key}?p=${n}&len=${len}`),
      list: jest.spyOn(proto, 'listParts').mockResolvedValue([]),
      complete: jest.spyOn(proto, 'completeMultipartUpload').mockResolvedValue(undefined),
      abort: jest.spyOn(proto, 'abortMultipartUpload').mockResolvedValue(undefined),
      head: jest.spyOn(proto, 'getObjectSize').mockResolvedValue(0),
      del: jest.spyOn(proto, 'deleteObjectKey').mockResolvedValue(undefined),
    };
  });
  afterEach(() => Object.values(spies).forEach((s) => s.mockRestore()));

  const post = (path: string, body: object, room = 'room-a') =>
    fetch(`${baseUrl}/api/r2/multipart/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Token': issueRoomToken(room) },
      body: JSON.stringify(body),
    });
  const create = (size: number, room = 'room-a') =>
    post('create', { roomId: room, fileName: 'big_file.mp4', contentType: 'video/mp4', size }, room);

  test('파트 길이 계산: 마지막 파트는 나머지', () => {
    const size = PART * 2 + 5;
    expect(computePartCount(size)).toBe(3);
    expect(partLength(size, PART, 1)).toBe(PART);
    expect(partLength(size, PART, 3)).toBe(5);
    expect(partLength(PART * 2, PART, 2)).toBe(PART);
  });

  test('create: 응답 형태와 키 규칙 (정확히 5GB 허용)', async () => {
    const res = await create(5120 * MB);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.key).toBe('room-a/big_file.mp4');
    expect(body.partSize).toBe(PART);
    expect(body.partCount).toBe(80);
    expect(typeof body.uploadId).toBe('string');
  });

  test('create: 5GB + 1바이트는 413, 0/비정수는 400', async () => {
    const over = await create(5120 * MB + 1);
    expect(over.status).toBe(413);
    expect((await readJson(over)).code).toBe('FILE_TOO_LARGE');
    expect((await create(0)).status).toBe(400);
    expect((await create(1.5)).status).toBe(400);
  });

  test('create: 룸 10GB 초과 거절 (진행 중 예약분 포함)', async () => {
    spies.room.mockResolvedValue(6000 * MB);
    const res = await create(5000 * MB);
    expect(res.status).toBe(413);
    expect((await readJson(res)).code).toBe('ROOM_SIZE_EXCEEDED');
    spies.room.mockResolvedValue(0);
    expect((await create(5000 * MB, 'room-a')).status).toBe(200);
    // 예약 5000MB + 새 요청 5200MB > 10240MB
    expect((await create(5200 * MB)).status).toBe(413);
  });

  test('sign: 마지막 파트는 나머지 크기로 ContentLength 서명', async () => {
    const size = PART * 2 + 5;
    const { uploadId, key } = await readJson(await create(size));
    const res = await post('sign', { roomId: 'room-a', uploadId, key, partNumbers: [1, 3] });
    expect(res.status).toBe(200);
    expect(spies.sign).toHaveBeenCalledWith(key, uploadId, 1, PART, 3600);
    expect(spies.sign).toHaveBeenCalledWith(key, uploadId, 3, 5, 3600);
    const body = await readJson(res);
    expect(body.urls).toHaveLength(2);
  });

  test('sign: 범위 밖/20개 초과 partNumbers는 400', async () => {
    const { uploadId, key } = await readJson(await create(PART * 2));
    expect((await post('sign', { roomId: 'room-a', uploadId, key, partNumbers: [3] })).status).toBe(400);
    expect((await post('sign', { roomId: 'room-a', uploadId, key, partNumbers: [0] })).status).toBe(400);
    const big = await readJson(await create(PART * 40));
    const many = Array.from({ length: 21 }, (_, i) => i + 1);
    expect((await post('sign', { roomId: 'room-a', uploadId: big.uploadId, key: big.key, partNumbers: many })).status).toBe(400);
  });

  test('다른 룸의 uploadId/key 접근은 403', async () => {
    const { uploadId, key } = await readJson(await create(PART * 2, 'room-a'));
    // 다른 룸 토큰으로 room-b 이름을 써도 room-a 키는 거절
    for (const path of ['sign', 'parts', 'complete', 'abort']) {
      const res = await post(path, { roomId: 'room-b', uploadId, key, partNumbers: [1], parts: [{ PartNumber: 1, ETag: 'x' }] }, 'room-b');
      expect(res.status).toBe(403);
    }
    // 키 접두사가 자기 룸이지만 uploadId가 남의 것인 경우
    const res = await post('sign', { roomId: 'room-b', uploadId, key: 'room-b/x.bin', partNumbers: [1] }, 'room-b');
    expect(res.status).toBe(403); // 레코드의 소유 룸/키와 불일치
    expect(spies.abort).not.toHaveBeenCalled();
  });

  test('parts: ListParts 결과를 돌려준다', async () => {
    const { uploadId, key } = await readJson(await create(PART * 2));
    spies.list.mockResolvedValue([{ PartNumber: 1, ETag: '"a"', Size: PART }]);
    const body = await readJson(await post('parts', { roomId: 'room-a', uploadId, key }));
    expect(body.parts).toEqual([{ PartNumber: 1, ETag: '"a"', Size: PART }]);
    expect(body.partCount).toBe(2);
  });

  test('complete: 크기 일치면 fileUrl 응답, 불일치면 객체 삭제 + 422', async () => {
    const size = PART + 10;
    const ok = await readJson(await create(size));
    spies.head.mockResolvedValue(size);
    const parts = [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 2, ETag: '"b"' }];
    const res = await post('complete', { roomId: 'room-a', uploadId: ok.uploadId, key: ok.key, parts });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ success: true, fileName: 'big_file.mp4', fileUrl: 'https://store.test/room-a/big_file.mp4', size });

    const bad = await readJson(await create(size));
    spies.head.mockResolvedValue(size - 1);
    const res2 = await post('complete', { roomId: 'room-a', uploadId: bad.uploadId, key: bad.key, parts });
    expect(res2.status).toBe(422);
    expect((await readJson(res2)).code).toBe('SIZE_MISMATCH');
    expect(spies.del).toHaveBeenCalledWith(bad.key);
  });

  test.each([
    ['InvalidPart', undefined, 400, 'INVALID_PARTS'],
    ['InvalidPartOrder', undefined, 400, 'INVALID_PARTS'],
    ['SomethingElse', 400, 400, 'INVALID_PARTS'],
    ['NoSuchUpload', 404, 404, 'UPLOAD_NOT_FOUND'],
  ])('complete: R2가 %s로 거절하면 상태 %s → %i %s', async (name, httpStatus, status, code) => {
    const size = PART + 10;
    const ok = await readJson(await create(size));
    spies.complete.mockRejectedValue(Object.assign(new Error(name), { name, $metadata: { httpStatusCode: httpStatus } }));
    const parts = [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 2, ETag: '"b"' }];
    const res = await post('complete', { roomId: 'room-a', uploadId: ok.uploadId, key: ok.key, parts });
    expect(res.status).toBe(status);
    expect((await readJson(res)).code).toBe(code);
  });

  test('complete: 진짜 서버 오류(5xx)는 500 유지', async () => {
    const ok = await readJson(await create(PART + 10));
    spies.complete.mockRejectedValue(Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } }));
    const parts = [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 2, ETag: '"b"' }];
    const res = await post('complete', { roomId: 'room-a', uploadId: ok.uploadId, key: ok.key, parts });
    expect(res.status).toBe(500);
  });

  test('서버 재시작 복구: 레코드 없이 size를 보내면 sign/complete 가능, 남의 접두사는 거절', async () => {
    const size = PART + 7;
    const key = 'room-a/restored.bin';
    const sign = await post('sign', { roomId: 'room-a', uploadId: 'old-id', key, size, partNumbers: [2] });
    expect(sign.status).toBe(200);
    expect(spies.sign).toHaveBeenCalledWith(key, 'old-id', 2, 7, 3600);
    spies.head.mockResolvedValue(size);
    const parts = [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 2, ETag: '"b"' }];
    expect((await post('complete', { roomId: 'room-a', uploadId: 'old-id', key, parts })).status).toBe(200);
    // 레코드 없는 complete: 크기 선언이 다르면 삭제
    spies.head.mockResolvedValue(size + 1);
    const res = await post('complete', { roomId: 'room-a', uploadId: 'old-2', key, size, parts });
    expect(res.status).toBe(422);
    expect(spies.del).toHaveBeenCalledWith(key);
    // 접두사 불일치
    expect((await post('parts', { roomId: 'room-a', uploadId: 'x', key: 'room-b/a.bin' })).status).toBe(403);
    expect((await post('parts', { roomId: 'room-a', uploadId: 'x', key: 'room-a/sub/a.bin' })).status).toBe(403);
  });

  test('일일 한도 초과 create는 429 + DAILY_QUOTA_EXCEEDED, abort 시 미업로드분 환급', async () => {
    process.env.DAILY_UPLOAD_QUOTA_GB = '1';
    try {
      const first = await readJson(await create(800 * MB));
      const over = await create(300 * MB);
      expect(over.status).toBe(429);
      const body = await readJson(over);
      expect(body.code).toBe('DAILY_QUOTA_EXCEEDED');
      expect(body.remainingBytes).toBe(1024 * MB - 800 * MB);
      // 100MB만 올리고 abort → 700MB 환급
      spies.list.mockResolvedValue([{ PartNumber: 1, ETag: '"a"', Size: 100 * MB }]);
      expect((await post('abort', { roomId: 'room-a', uploadId: first.uploadId, key: first.key })).status).toBe(200);
      expect(spies.abort).toHaveBeenCalledWith(first.key, first.uploadId);
      expect((await create(900 * MB)).status).toBe(200);
    } finally {
      delete process.env.DAILY_UPLOAD_QUOTA_GB;
    }
  });
});
