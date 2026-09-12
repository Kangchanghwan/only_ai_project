import { R2Service } from '../services/r2Service';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * loadFiles는 룸의 객체를 전부 모아 최신순(LastModified 내림차순)으로 정렬한 뒤
 * offset 기반 토큰으로 페이지를 잘라 돌려준다. R2의 ListObjectsV2는 키(이름)순이라
 * 그대로 첫 페이지를 내주면 최신 파일이 뒤 페이지에 숨는다.
 */
describe('R2Service - loadFiles 최신순 정렬 + offset 페이지네이션', () => {
  let service: R2Service;
  let sendSpy: jest.Mock;

  const obj = (name: string, iso: string, size = 1) => ({
    Key: `room-x/${name}`,
    Size: size,
    LastModified: new Date(iso),
  });

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

  test('이름순으로 나열된 객체를 최신순으로 정렬해 돌려준다', async () => {
    sendSpy.mockResolvedValue({
      Contents: [
        obj('a-old.png', '2026-01-01T00:00:00Z'),
        obj('b-newest.png', '2026-03-01T00:00:00Z'),
        obj('c-mid.png', '2026-02-01T00:00:00Z'),
      ],
    });

    const result = await service.loadFiles('room-x', { limit: 10 });

    expect(result.files.map(f => f.name)).toEqual(['b-newest.png', 'c-mid.png', 'a-old.png']);
    expect(result.nextToken).toBeUndefined();
  });

  test('limit보다 파일이 많으면 최신 limit개와 다음 offset 토큰을 돌려주고, 토큰으로 이어서 받을 수 있다', async () => {
    sendSpy.mockResolvedValue({
      Contents: [
        obj('a.png', '2026-01-01T00:00:00Z'),
        obj('b.png', '2026-01-04T00:00:00Z'),
        obj('c.png', '2026-01-02T00:00:00Z'),
        obj('d.png', '2026-01-05T00:00:00Z'),
        obj('e.png', '2026-01-03T00:00:00Z'),
      ],
    });

    const first = await service.loadFiles('room-x', { limit: 2 });
    expect(first.files.map(f => f.name)).toEqual(['d.png', 'b.png']);
    expect(first.nextToken).toBeDefined();

    const second = await service.loadFiles('room-x', { limit: 2, continuationToken: first.nextToken });
    expect(second.files.map(f => f.name)).toEqual(['e.png', 'c.png']);
    expect(second.nextToken).toBeDefined();

    const third = await service.loadFiles('room-x', { limit: 2, continuationToken: second.nextToken });
    expect(third.files.map(f => f.name)).toEqual(['a.png']);
    expect(third.nextToken).toBeUndefined();
  });

  test('R2가 여러 페이지로 나눠 주더라도 전부 모은 뒤 정렬한다', async () => {
    sendSpy.mockImplementation(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        const { Prefix, ContinuationToken } = command.input;
        expect(Prefix).toBe('room-x/');
        return ContinuationToken
          ? { Contents: [obj('z-newest.png', '2026-05-01T00:00:00Z')] }
          : { Contents: [obj('a-old.png', '2026-01-01T00:00:00Z')], NextContinuationToken: 'r2-page-2' };
      }
      return {};
    });

    const result = await service.loadFiles('room-x', { limit: 10 });

    expect(result.files.map(f => f.name)).toEqual(['z-newest.png', 'a-old.png']);
    expect(result.nextToken).toBeUndefined();
  });

  test('잘못된 토큰은 첫 페이지로 취급하고, 디렉터리 placeholder 키는 제외한다', async () => {
    sendSpy.mockResolvedValue({
      Contents: [
        { Key: 'room-x/', Size: 0, LastModified: new Date('2026-09-01T00:00:00Z') },
        obj('only.png', '2026-01-01T00:00:00Z', 7),
      ],
    });

    const result = await service.loadFiles('room-x', { limit: 10, continuationToken: 'not-a-number' });

    expect(result.files).toEqual([
      {
        name: 'only.png',
        url: 'https://store.test/room-x/only.png',
        size: 7,
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(result.nextToken).toBeUndefined();
  });
});
