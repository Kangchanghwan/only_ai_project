import { R2Service } from '../services/r2Service';
import { AbortMultipartUploadCommand, DeleteObjectsCommand, ListMultipartUploadsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

describe('R2Service - 멀티파트 룸 정리', () => {
  let service: R2Service;
  let send: jest.Mock;

  beforeAll(() => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://store.test';
  });

  beforeEach(() => {
    service = new R2Service();
    send = jest.fn();
    (service as unknown as { client: { send: jest.Mock } }).client.send = send;
  });

  test('deleteAllFiles는 룸 프리픽스의 진행 중 멀티파트를 Abort한다 (파일이 없어도)', async () => {
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof ListMultipartUploadsCommand) {
        expect(command.input.Prefix).toBe('room-x/');
        return { Uploads: [{ Key: 'room-x/a.bin', UploadId: 'u1' }, { Key: 'room-x/b.bin', UploadId: 'u2' }] };
      }
      if (command instanceof ListObjectsV2Command) return { Contents: [] };
      return {};
    });

    await service.deleteAllFiles('room-x');

    const aborts = send.mock.calls.map((c) => c[0]).filter((c) => c instanceof AbortMultipartUploadCommand);
    expect(aborts.map((c) => [c.input.Key, c.input.UploadId])).toEqual([['room-x/a.bin', 'u1'], ['room-x/b.bin', 'u2']]);
  });

  test('Abort 실패가 있어도 파일 삭제는 계속된다', async () => {
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof ListMultipartUploadsCommand) return { Uploads: [{ Key: 'room-x/a.bin', UploadId: 'u1' }] };
      if (command instanceof AbortMultipartUploadCommand) throw new Error('boom');
      if (command instanceof ListObjectsV2Command) return { Contents: [{ Key: 'room-x/c.bin', Size: 1 }] };
      return {};
    });
    expect(await service.deleteAllFiles('room-x')).toBe(1);
    expect(send.mock.calls.some((c) => c[0] instanceof DeleteObjectsCommand)).toBe(true);
  });
});
