import { httpServer } from '../server';
import { AddressInfo } from 'net';
import { issueRoomToken } from '../utils/roomToken';

/** fetch 응답 JSON을 느슨한 타입으로 읽는다 (테스트 전용) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

/**
 * 룸 토큰 인증 테스트: roomId만 알아서는(공유 링크에 노출됨) 목록 조회·업로드·삭제를 할 수 없어야 한다.
 * 401 경로는 미들웨어에서 끝나므로 R2 네트워크 호출이 일어나지 않는다.
 */
describe('REST API - 룸 토큰 인증', () => {
  let baseUrl: string;
  const ROOM = 'room-aaaaaaaaaaaa';

  beforeAll((done) => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';

    httpServer.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  afterEach(() => {
    delete process.env.ROOM_TOKEN_ENFORCE;
  });

  const presignBody = JSON.stringify({ roomId: ROOM, files: [{ fileName: 'a.png', contentType: 'image/png' }] });

  test('토큰 없이 파일 목록 조회·용량 조회·삭제·전체 삭제를 하면 401', async () => {
    const list = await fetch(`${baseUrl}/api/r2/files/${ROOM}`);
    const size = await fetch(`${baseUrl}/api/r2/size/${ROOM}`);
    const delOne = await fetch(`${baseUrl}/api/r2/files/${ROOM}/a.png`, { method: 'DELETE' });
    const delAll = await fetch(`${baseUrl}/api/r2/files/${ROOM}`, { method: 'DELETE' });

    expect([list.status, size.status, delOne.status, delAll.status]).toEqual([401, 401, 401, 401]);
    expect((await readJson(list)).code).toBe('ROOM_TOKEN_INVALID');
  });

  test('토큰 없이 업로드 URL 발급(단일·배치)과 직접 업로드를 하면 401', async () => {
    const batch = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: presignBody,
    });
    const single = await fetch(`${baseUrl}/api/r2/presigned-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ROOM, fileName: 'a.png', contentType: 'image/png' }),
    });
    const form = new FormData();
    form.append('roomId', ROOM);
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt');
    const direct = await fetch(`${baseUrl}/api/r2/upload`, { method: 'POST', body: form });

    expect([batch.status, single.status, direct.status]).toEqual([401, 401, 401]);
  });

  test('다른 룸의 토큰으로는 접근할 수 없다', async () => {
    const res = await fetch(`${baseUrl}/api/r2/files/${ROOM}`, {
      headers: { 'X-Room-Token': issueRoomToken('room-bbbbbbbbbbbb') },
    });
    expect(res.status).toBe(401);
  });

  test('만료된 토큰은 ROOM_TOKEN_EXPIRED 코드로 401', async () => {
    const expired = issueRoomToken(ROOM, Date.now() - 3 * 60 * 60 * 1000, 60);
    const res = await fetch(`${baseUrl}/api/r2/files/${ROOM}`, { headers: { 'X-Room-Token': expired } });
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe('ROOM_TOKEN_EXPIRED');
  });

  test('올바른 룸 토큰이면 업로드 URL이 발급된다', async () => {
    const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Room-Token': issueRoomToken(ROOM) },
      body: presignBody,
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).files[0].uploadUrl).toContain(`/${ROOM}/a.png`);
  });

  test('다운로드 URL 발급은 공유 링크 수신자용이라 토큰 없이도 된다', async () => {
    const single = await fetch(`${baseUrl}/api/r2/download-url/${ROOM}/a.png`);
    const batch = await fetch(`${baseUrl}/api/r2/download-urls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ROOM, fileNames: ['a.png'] }),
    });
    expect([single.status, batch.status]).toEqual([200, 200]);
  });

  test('ROOM_TOKEN_ENFORCE=false(보고 전용)면 토큰이 없어도 통과한다', async () => {
    process.env.ROOM_TOKEN_ENFORCE = 'false';
    const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: presignBody,
    });
    expect(res.status).toBe(200);
  });

  test('roomId가 없으면 인증보다 입력 검증(400)이 먼저 응답한다', async () => {
    const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ fileName: 'a.png', contentType: 'image/png' }] }),
    });
    expect(res.status).toBe(400);
  });

  test('CORS preflight가 X-Room-Token 헤더를 허용한다', async () => {
    const res = await fetch(`${baseUrl}/api/r2/files/${ROOM}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-room-token',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-room-token');
  });
});
