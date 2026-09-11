import { httpServer } from '../server';
import { AddressInfo } from 'net';

/** fetch 응답 JSON을 느슨한 타입으로 읽는다 (테스트 전용) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();

/**
 * REST API 테스트 (실제 Express 앱, R2 presign은 오프라인 서명이라 네트워크 불필요)
 */
describe('REST API - upload/download presign', () => {
  let baseUrl: string;

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

  describe('CORS preflight', () => {
    test('OPTIONS 응답에 Access-Control-Max-Age가 있어 preflight가 캐시된다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-max-age')).toBe('7200');
    });
  });

  describe('POST /api/r2/presigned-urls (배치 presign)', () => {
    test('여러 파일의 업로드 URL을 한 번에 발급하고 이미지에는 썸네일 URL을 동봉한다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: 'room-x',
          files: [
            { fileName: 'photo.png', contentType: 'image/png' },
            { fileName: 'notes.pdf', contentType: 'application/pdf' },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.files).toHaveLength(2);

      const [photo, notes] = body.files;
      expect(photo.fileName).toBe('photo.png');
      expect(photo.uploadUrl).toContain('/room-x/photo.png');
      expect(photo.uploadUrl).toContain('X-Amz-Signature');
      expect(photo.fileUrl).toBe('https://store.test/room-x/photo.png');
      expect(photo.thumbUploadUrl).toContain('/thumbs/room-x/photo.png.jpg');
      expect(photo.thumbUrl).toBe('https://store.test/thumbs/room-x/photo.png.jpg');

      expect(notes.fileName).toBe('notes.pdf');
      expect(notes.uploadUrl).toContain('/room-x/notes.pdf');
      expect(notes.thumbUploadUrl).toBeUndefined();
      expect(notes.thumbUrl).toBeUndefined();
    });

    test('파일명은 단일 presign과 같은 규칙으로 정리된다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: 'room-x',
          files: [{ fileName: 'my photo (1).png', contentType: 'image/png' }],
        }),
      });

      const body = await readJson(res);
      expect(body.files[0].fileName).toBe('my_photo_1.png');
    });

    test('roomId나 files가 없으면 400을 반환한다', async () => {
      const noRoom = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ fileName: 'a.png', contentType: 'image/png' }] }),
      });
      expect(noRoom.status).toBe(400);

      const emptyFiles = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room-x', files: [] }),
      });
      expect(emptyFiles.status).toBe(400);

      const badEntry = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room-x', files: [{ fileName: 'a.png' }] }),
      });
      expect(badEntry.status).toBe(400);
    });

    test('50개를 초과하면 400을 반환한다', async () => {
      const files = Array.from({ length: 51 }, (_, i) => ({ fileName: `f${i}.txt`, contentType: 'text/plain' }));
      const res = await fetch(`${baseUrl}/api/r2/presigned-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room-x', files }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/r2/download-url/:roomId/:fileName', () => {
    test('attachment 처리가 서명된 presigned GET URL을 발급한다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/download-url/room-x/${encodeURIComponent('사진.png')}`);

      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.fileName).toBe('사진.png');
      const decoded = decodeURIComponent(body.url);
      expect(decoded).toContain('/room-x/사진.png');
      expect(decoded).toContain("response-content-disposition=attachment; filename*=UTF-8''%EC%82%AC%EC%A7%84.png");
      expect(body.url).toContain('X-Amz-Signature');
    });
  });

  describe('POST /api/r2/download-urls (배치)', () => {
    test('여러 파일의 다운로드 URL을 한 번에 발급한다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/download-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room-x', fileNames: ['a.png', 'b.pdf'] }),
      });

      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.urls.map((u: { fileName: string }) => u.fileName)).toEqual(['a.png', 'b.pdf']);
      expect(decodeURIComponent(body.urls[1].url)).toContain('/room-x/b.pdf');
      expect(decodeURIComponent(body.urls[1].url)).toContain('response-content-disposition=attachment');
    });

    test('fileNames가 비어 있으면 400을 반환한다', async () => {
      const res = await fetch(`${baseUrl}/api/r2/download-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: 'room-x', fileNames: [] }),
      });
      expect(res.status).toBe(400);
    });
  });
});
