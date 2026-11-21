import { R2Service } from '../services/r2Service';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * 썸네일 키/URL, 삭제 시 썸네일 동반 삭제, 전체 삭제의 페이지네이션을 검증한다.
 * S3 클라이언트의 send만 스파이하고 나머지는 실제 코드를 사용한다.
 */
describe('R2Service - thumbnails and deletion', () => {
  let service: R2Service;
  let sendSpy: jest.Mock;

  beforeAll(() => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
  });

  beforeEach(() => {
    service = new R2Service();
    sendSpy = jest.fn();
    (service as unknown as { client: { send: jest.Mock } }).client.send = sendSpy;
  });

  test('getThumbKey / getThumbUrl은 thumbs/ 프리픽스 아래 .jpg 키를 만든다', () => {
    expect(service.getThumbKey('room-x', 'photo.png')).toBe('thumbs/room-x/photo.png.jpg');
    expect(service.getThumbUrl('room-x', 'photo.png')).toBe('https://store.test/thumbs/room-x/photo.png.jpg');
  });

  test('deleteFile은 원본과 썸네일 키를 한 번의 DeleteObjects로 삭제한다', async () => {
    sendSpy.mockResolvedValue({});

    await service.deleteFile('room-x', 'photo.png');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect(command.input.Delete?.Objects).toEqual([
      { Key: 'room-x/photo.png' },
      { Key: 'thumbs/room-x/photo.png.jpg' },
    ]);
  });

  test('deleteAllFiles는 룸 프리픽스와 thumbs 프리픽스를 모든 페이지에 걸쳐 삭제한다', async () => {
    sendSpy.mockImplementation(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        const { Prefix, ContinuationToken } = command.input;
        if (Prefix === 'room-x/') {
          return ContinuationToken
            ? { Contents: [{ Key: 'room-x/b.png', Size: 2 }] }
            : { Contents: [{ Key: 'room-x/a.png', Size: 1 }], NextContinuationToken: 'page2' };
        }
        if (Prefix === 'thumbs/room-x/') {
          return { Contents: [{ Key: 'thumbs/room-x/a.png.jpg', Size: 1 }] };
        }
      }
      return {};
    });

    const deleted = await service.deleteAllFiles('room-x');

    expect(deleted).toBe(2);
    const deleteCalls = sendSpy.mock.calls
      .map((call) => call[0])
      .filter((command) => command instanceof DeleteObjectsCommand);
    const deletedKeys = deleteCalls.flatMap((command) => (command.input.Delete?.Objects ?? []).map((o) => o.Key as string));
    expect(deletedKeys.sort()).toEqual(['room-x/a.png', 'room-x/b.png', 'thumbs/room-x/a.png.jpg']);
  });

  test('getUploadPresignedUrls는 이미지에만 썸네일 업로드 URL을 붙인다', async () => {
    const result = await service.getUploadPresignedUrls('room-x', [
      { fileName: 'photo.png', contentType: 'image/png' },
      { fileName: 'doc.pdf', contentType: 'application/pdf' },
    ]);

    expect(result[0].thumbUploadUrl).toContain('/thumbs/room-x/photo.png.jpg');
    expect(result[0].thumbUrl).toBe('https://store.test/thumbs/room-x/photo.png.jpg');
    expect(result[1].thumbUploadUrl).toBeUndefined();
    expect(result[1].fileUrl).toBe('https://store.test/room-x/doc.pdf');
  });

  test('한글 문서(.hwp/.hwpx, 대소문자 무시)에도 같은 키 규칙의 jpeg 썸네일 URL을 붙인다', async () => {
    const result = await service.getUploadPresignedUrls('room-x', [
      { fileName: 'a.hwp', contentType: 'application/octet-stream' },
      { fileName: 'B.HWPX', contentType: 'application/octet-stream' },
      { fileName: '보 고서.hwpx', contentType: 'application/x-hwpx' },
      { fileName: 'a.hwp.zip', contentType: 'application/zip' },
      { fileName: 'slides.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { fileName: 'D.PPTX', contentType: 'application/octet-stream' },
      { fileName: 'doc.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { fileName: 'sheet.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { fileName: 'a.pptx.zip', contentType: 'application/zip' },
      { fileName: 'hwp', contentType: 'text/plain' },
      { fileName: 'notes.hwpx.txt', contentType: 'text/plain' },
    ]);

    expect(result[0].thumbUploadUrl).toContain('/thumbs/room-x/a.hwp.jpg');
    expect(result[0].thumbUrl).toBe('https://store.test/thumbs/room-x/a.hwp.jpg');
    expect(result[1].thumbUploadUrl).toContain('/thumbs/room-x/B.HWPX.jpg');
    expect(result[2].thumbUrl).toBe('https://store.test/thumbs/room-x/보_고서.hwpx.jpg');
    expect(result[3].thumbUploadUrl).toBeUndefined();
    // .pptx는 같은 키 규칙으로 썸네일 URL, docx·xlsx·a.pptx.zip·확장자 없음은 없음
    expect(result[4].thumbUploadUrl).toContain('/thumbs/room-x/slides.pptx.jpg');
    expect(result[4].thumbUrl).toBe('https://store.test/thumbs/room-x/slides.pptx.jpg');
    expect(result[5].thumbUploadUrl).toContain('/thumbs/room-x/D.PPTX.jpg');
    for (const i of [6, 7, 8, 9, 10]) expect(result[i].thumbUploadUrl).toBeUndefined();
  });

  test('getDownloadPresignedUrl은 attachment content-disposition을 서명한다', async () => {
    const url = await service.getDownloadPresignedUrl('room-x', 'photo.png');

    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('/room-x/photo.png');
    expect(decoded).toContain("response-content-disposition=attachment; filename*=UTF-8''photo.png");
  });
});
