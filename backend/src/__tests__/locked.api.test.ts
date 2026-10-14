import { httpServer } from '../server';
import { AddressInfo } from 'net';
import { createHash, randomBytes } from 'crypto';
import { issueRoomToken } from '../utils/roomToken';
import { R2Service } from '../services/r2Service';
import { resetDailyQuota } from '../utils/dailyQuota';
import { resetMultipartStore } from '../utils/multipartStore';
import { resetUnlockLimiter, UNLOCK_MAX_PER_IP } from '../utils/unlockLimiter';
import { LOCK_PART_SIZE, ctSizeOf, LockObjectMetadata } from '../utils/lockFormat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = async (res: Response): Promise<any> => res.json();
const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const MB = 1024 * 1024;

/** 테스트용 비밀번호 확인값과 잠금 메타데이터 */
const verifierBytes = randomBytes(32);
const verifier = b64url(verifierBytes);
const vh = createHash('sha256').update(verifierBytes).digest('hex');
const lock = {
    v: 1,
    salt: b64url(randomBytes(16)),
    vh,
    wk: b64url(randomBytes(48)),
    wkIv: b64url(randomBytes(12)),
    np: b64url(randomBytes(4)),
    en: b64url(randomBytes(40)),
    enIv: b64url(randomBytes(12)),
};
const storedMeta = (pt: number): LockObjectMetadata => ({
    v: '1', salt: lock.salt, vh: lock.vh, wk: lock.wk, wkiv: lock.wkIv, np: lock.np, en: lock.en, eniv: lock.enIv, pt: String(pt),
});

describe('비밀번호 잠금 API', () => {
    let baseUrl: string;
    let spies: Record<string, jest.SpyInstance>;

    beforeAll((done) => {
        process.env.R2_ACCOUNT_ID = 'test-account';
        process.env.R2_ACCESS_KEY_ID = 'test-key';
        process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
        process.env.R2_BUCKET_NAME = 'test-bucket';
        process.env.R2_PUBLIC_URL = 'https://store.test';
        process.env.R2_LOCKED_BUCKET_NAME = 'test-locked';
        delete process.env.MAX_FILE_SIZE_MB;
        delete process.env.MAX_ROOM_SIZE_MB;
        delete process.env.DAILY_UPLOAD_QUOTA_GB;
        httpServer.listen(0, () => {
            baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
            done();
        });
    });
    afterAll((done) => {
        delete process.env.R2_LOCKED_BUCKET_NAME;
        httpServer.close(() => done());
    });

    beforeEach(() => {
        resetDailyQuota();
        resetMultipartStore();
        resetUnlockLimiter();
        const proto = R2Service.prototype;
        spies = {
            room: jest.spyOn(proto, 'getRoomTotalSize').mockResolvedValue(0),
            create: jest.spyOn(proto, 'createLockedMultipartUpload').mockImplementation(async (roomId, id) => ({
                uploadId: `up-${Math.random().toString(36).slice(2)}`,
                key: `${roomId}/${id}`,
            })),
            sign: jest.spyOn(proto, 'signUploadPart').mockImplementation(async (key, _id, n, len) => `https://signed.test/${key}?p=${n}&len=${len}`),
            complete: jest.spyOn(proto, 'completeMultipartUpload').mockResolvedValue(undefined),
            head: jest.spyOn(proto, 'getObjectSize').mockResolvedValue(0),
            del: jest.spyOn(proto, 'deleteObjectKey').mockResolvedValue(undefined),
            obj: jest.spyOn(proto, 'getLockedObject').mockResolvedValue(null),
            url: jest.spyOn(proto, 'getLockedDownloadUrl').mockResolvedValue('https://locked.test/dl'),
            list: jest.spyOn(proto, 'listLockedFiles').mockResolvedValue([]),
            load: jest.spyOn(proto, 'loadFiles').mockResolvedValue({ files: [] }),
            delLocked: jest.spyOn(proto, 'deleteLockedFile').mockResolvedValue(undefined),
        };
    });
    afterEach(() => Object.values(spies).forEach((s) => s.mockRestore()));

    const post = (path: string, body: object, room: string | null = 'room-a') =>
        fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(room ? { 'X-Room-Token': issueRoomToken(room) } : {}) },
            body: JSON.stringify(body),
        });
    const create = (size: number, extra: object = {}) =>
        post('/api/r2/locked/multipart/create', { roomId: 'room-a', size, lock, ...extra });

    test('create: 평문 크기로 받고 암호문 크기·잠금 파트 크기로 계획한다. 키에 파일명이 없다', async () => {
        const pt = 100 * MB + 3;
        const res = await create(pt);
        expect(res.status).toBe(200);
        const body = await readJson(res);
        expect(body.id).toMatch(/^[0-9a-f]{32}$/);
        expect(body.key).toBe(`room-a/${body.id}`);
        expect(body.ctSize).toBe(ctSizeOf(pt));
        expect(body.partSize).toBe(LOCK_PART_SIZE);
        expect(body.partCount).toBe(Math.ceil(ctSizeOf(pt) / LOCK_PART_SIZE));
        const meta = spies.create.mock.calls[0][2] as LockObjectMetadata;
        expect(meta).toMatchObject({ v: '1', vh, wkiv: lock.wkIv, eniv: lock.enIv, pt: String(pt) });
    });

    test('create: 잠금 정보 형식이 틀리면 400, 룸 토큰이 없으면 401', async () => {
        expect((await create(10, { lock: { ...lock, vh: 'zz' } })).status).toBe(400);
        expect((await create(10, { lock: { ...lock, salt: 'short' } })).status).toBe(400);
        expect((await create(10, { lock: { ...lock, v: 2 } })).status).toBe(400);
        const noToken = await post('/api/r2/locked/multipart/create', { roomId: 'room-a', size: 10, lock }, null);
        expect(noToken.status).toBe(401);
    });

    test('create: 5GB 평문까지 허용, 넘으면 413', async () => {
        expect((await create(5120 * MB)).status).toBe(200);
        expect((await create(5120 * MB + 1)).status).toBe(413);
    });

    test('sign/complete: 암호문 기준 파트 길이로 서명하고, 완료 시 id·평문 크기를 돌려준다', async () => {
        const pt = 64 * MB + 10; // 레코드 65개 → 파트 2개 (64레코드 + 1레코드)
        const created = await readJson(await create(pt));
        const ct = ctSizeOf(pt);
        const signRes = await post('/api/r2/locked/multipart/sign', { roomId: 'room-a', uploadId: created.uploadId, key: created.key, partNumbers: [1, 2] });
        expect(signRes.status).toBe(200);
        expect(spies.sign).toHaveBeenCalledWith(created.key, created.uploadId, 1, LOCK_PART_SIZE, 3600, 'test-locked');
        expect(spies.sign).toHaveBeenCalledWith(created.key, created.uploadId, 2, ct - LOCK_PART_SIZE, 3600, 'test-locked');

        spies.head.mockResolvedValue(ct);
        const done = await post('/api/r2/locked/multipart/complete', {
            roomId: 'room-a', uploadId: created.uploadId, key: created.key,
            parts: [{ PartNumber: 1, ETag: 'a' }, { PartNumber: 2, ETag: 'b' }],
        });
        expect(done.status).toBe(200);
        expect(await readJson(done)).toEqual({ success: true, id: created.id, locked: true, size: pt, ctSize: ct });
        expect(spies.complete).toHaveBeenCalledWith(created.key, created.uploadId, expect.any(Array), 'test-locked');
    });

    test('잠금 업로드 세션을 일반 멀티파트 경로로 다루면 403', async () => {
        const created = await readJson(await create(10));
        const res = await post('/api/r2/multipart/sign', { roomId: 'room-a', uploadId: created.uploadId, key: created.key, partNumbers: [1] });
        expect(res.status).toBe(403);
    });

    test('meta: salt·평문 크기·남은 시도만 준다 (토큰 불필요, 비밀 정보 없음)', async () => {
        const id = 'a'.repeat(32);
        spies.obj.mockResolvedValue({ meta: storedMeta(1234), ctSize: ctSizeOf(1234) });
        const res = await fetch(`${baseUrl}/api/r2/locked/meta/room-a/${id}`);
        expect(res.status).toBe(200);
        const body = await readJson(res);
        expect(body).toEqual({ v: 1, salt: lock.salt, size: 1234, rs: 1024 * 1024, remaining: UNLOCK_MAX_PER_IP });
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect((await fetch(`${baseUrl}/api/r2/locked/meta/room-a/not-an-id`)).status).toBe(400);
    });

    test('unlock: 확인값이 맞으면 60초 URL과 감싼 키를 준다', async () => {
        const id = 'b'.repeat(32);
        spies.obj.mockResolvedValue({ meta: storedMeta(500), ctSize: ctSizeOf(500) });
        const res = await post('/api/r2/locked/unlock', { roomId: 'room-a', id, verifier }, null);
        expect(res.status).toBe(200);
        const body = await readJson(res);
        expect(body).toMatchObject({ url: 'https://locked.test/dl', expiresIn: 60, size: 500, ctSize: ctSizeOf(500), np: lock.np, wk: lock.wk, wkIv: lock.wkIv, en: lock.en, enIv: lock.enIv });
        expect(spies.url).toHaveBeenCalledWith('room-a', id, 60);
    });

    test('unlock: 틀리면 403 + 남은 시도, IP당 한도를 다 쓰면 429 LOCKED_OUT (맞는 값도 거절)', async () => {
        const id = 'c'.repeat(32);
        spies.obj.mockResolvedValue({ meta: storedMeta(500), ctSize: ctSizeOf(500) });
        const wrong = b64url(randomBytes(32));
        for (let i = 1; i < UNLOCK_MAX_PER_IP; i++) {
            const r = await post('/api/r2/locked/unlock', { roomId: 'room-a', id, verifier: wrong }, null);
            expect(r.status).toBe(403);
            expect(await readJson(r)).toMatchObject({ code: 'WRONG_PASSWORD', remaining: UNLOCK_MAX_PER_IP - i });
        }
        const last = await post('/api/r2/locked/unlock', { roomId: 'room-a', id, verifier: wrong }, null);
        expect(last.status).toBe(429);
        expect(await readJson(last)).toMatchObject({ code: 'LOCKED_OUT', remaining: 0 });
        const right = await post('/api/r2/locked/unlock', { roomId: 'room-a', id, verifier }, null);
        expect(right.status).toBe(429);
        expect(spies.url).not.toHaveBeenCalled();
    });

    test('unlock: 같은 비밀번호(vh)로 잠근 다른 파일도 시도 횟수를 공유한다', async () => {
        spies.obj.mockResolvedValue({ meta: storedMeta(500), ctSize: ctSizeOf(500) });
        const wrong = b64url(randomBytes(32));
        await post('/api/r2/locked/unlock', { roomId: 'room-a', id: 'd'.repeat(32), verifier: wrong }, null);
        const r = await post('/api/r2/locked/unlock', { roomId: 'room-a', id: 'e'.repeat(32), verifier: wrong }, null);
        expect(await readJson(r)).toMatchObject({ remaining: UNLOCK_MAX_PER_IP - 2 });
    });

    test('unlock: 없는 파일 404, 형식 오류 400', async () => {
        expect((await post('/api/r2/locked/unlock', { roomId: 'room-a', id: 'f'.repeat(32), verifier }, null)).status).toBe(404);
        expect((await post('/api/r2/locked/unlock', { roomId: 'room-a', id: 'f'.repeat(32), verifier: 'x' }, null)).status).toBe(400);
        expect((await post('/api/r2/locked/unlock', { roomId: 'room-a/../room-b', id: 'f'.repeat(32), verifier }, null)).status).toBe(400);
    });

    test('파일 목록: 잠긴 파일을 url 없이 locked 표시와 평문 크기로 함께 준다 (최신순)', async () => {
        spies.load.mockResolvedValue({ files: [{ name: 'a.png', url: 'https://store.test/room-a/a.png', size: 5, lastModified: '2026-10-13T01:00:00.000Z' }] });
        spies.list.mockResolvedValue([{ id: 'f'.repeat(32), size: 100, ctSize: 116, lastModified: '2026-10-13T02:00:00.000Z' }]);
        const res = await fetch(`${baseUrl}/api/r2/files/room-a`, { headers: { 'X-Room-Token': issueRoomToken('room-a') } });
        const body = await readJson(res);
        expect(body.files).toEqual([
            { name: 'f'.repeat(32), locked: true, size: 100, lastModified: '2026-10-13T02:00:00.000Z' },
            { name: 'a.png', url: 'https://store.test/room-a/a.png', size: 5, lastModified: '2026-10-13T01:00:00.000Z' },
        ]);
    });

    test('파일 목록: 잠긴 목록 조회가 실패해도 일반 목록은 나온다', async () => {
        spies.load.mockResolvedValue({ files: [{ name: 'a.png', url: 'u', size: 5, lastModified: '2026-10-13T01:00:00.000Z' }] });
        spies.list.mockRejectedValue(new Error('boom'));
        const res = await fetch(`${baseUrl}/api/r2/files/room-a`, { headers: { 'X-Room-Token': issueRoomToken('room-a') } });
        expect(res.status).toBe(200);
        expect((await readJson(res)).files).toHaveLength(1);
    });

    const delKey = randomBytes(32);
    const deleteKey = b64url(delKey);
    const dh = createHash('sha256').update(delKey).digest('hex');
    const del = (body: object, room: string | null = 'room-a') => post('/api/r2/locked/delete', { roomId: 'room-a', id: 'a'.repeat(32), ...body }, room);

    test('create: 삭제 키 해시(dh)를 메타데이터에 저장한다 (형식이 틀리면 400)', async () => {
        const ok = await create(10, { lock: { ...lock, dh } });
        expect(ok.status).toBe(200);
        expect((spies.create.mock.calls[0][2] as LockObjectMetadata).dh).toBe(dh);
        expect((await create(10, { lock: { ...lock, dh: 'xyz' } })).status).toBe(400);
    });

    test('삭제: 룸 토큰이 없으면 401, 증명이 없으면 403 (비밀번호 모르는 사람은 못 지움)', async () => {
        spies.obj.mockResolvedValue({ meta: { ...storedMeta(5), dh }, ctSize: ctSizeOf(5) });
        expect((await del({ deleteKey }, null)).status).toBe(401);
        const none = await del({});
        expect(none.status).toBe(403);
        expect(await readJson(none)).toMatchObject({ code: 'DELETE_FORBIDDEN' });
        expect(spies.delLocked).not.toHaveBeenCalled();
    });

    test('삭제: 올린 기기의 삭제 키가 맞으면 지운다', async () => {
        spies.obj.mockResolvedValue({ meta: { ...storedMeta(5), dh }, ctSize: ctSizeOf(5) });
        const res = await del({ deleteKey });
        expect(res.status).toBe(200);
        expect(spies.delLocked).toHaveBeenCalledWith('room-a', 'a'.repeat(32));
    });

    test('삭제: 삭제 키가 틀리거나 dh가 없는 옛 파일이면 비밀번호 확인값으로 판단한다', async () => {
        spies.obj.mockResolvedValue({ meta: storedMeta(5), ctSize: ctSizeOf(5) }); // dh 없음
        expect((await del({ deleteKey })).status).toBe(403);
        expect((await del({ deleteKey, verifier })).status).toBe(200);
        expect(spies.delLocked).toHaveBeenCalledTimes(1);
    });

    test('삭제: 틀린 비밀번호는 풀기와 같은 시도 카운터를 쓴다', async () => {
        spies.obj.mockResolvedValue({ meta: storedMeta(5), ctSize: ctSizeOf(5) });
        const wrong = b64url(randomBytes(32));
        const r1 = await del({ verifier: wrong });
        expect(r1.status).toBe(403);
        expect(await readJson(r1)).toMatchObject({ code: 'WRONG_PASSWORD', remaining: UNLOCK_MAX_PER_IP - 1 });
        const u = await post('/api/r2/locked/unlock', { roomId: 'room-a', id: 'a'.repeat(32), verifier: wrong }, null);
        expect(await readJson(u)).toMatchObject({ remaining: UNLOCK_MAX_PER_IP - 2 });
        expect(spies.delLocked).not.toHaveBeenCalled();
    });

    test('삭제: 옛 DELETE 경로는 더 이상 없다', async () => {
        const res = await fetch(`${baseUrl}/api/r2/locked/room-a/${'a'.repeat(32)}`, { method: 'DELETE', headers: { 'X-Room-Token': issueRoomToken('room-a') } });
        expect(res.status).toBe(404);
        expect(spies.delLocked).not.toHaveBeenCalled();
    });

    test('저장소 초기화(DELETE /api/r2/files/:roomId)는 잠긴 파일을 지우지 않는다', async () => {
        const all = jest.spyOn(R2Service.prototype, 'deleteAllFiles').mockResolvedValue(2);
        try {
            const res = await fetch(`${baseUrl}/api/r2/files/room-a`, { method: 'DELETE', headers: { 'X-Room-Token': issueRoomToken('room-a') } });
            expect(res.status).toBe(200);
            expect(all).toHaveBeenCalledWith('room-a', { includeLocked: false });
        } finally {
            all.mockRestore();
        }
    });
});

describe('잠금 버킷 미설정 시', () => {
    test('R2Service.isLockedEnabled는 R2_LOCKED_BUCKET_NAME이 있을 때만 true', () => {
        process.env.R2_ACCOUNT_ID = 'a';
        process.env.R2_ACCESS_KEY_ID = 'b';
        process.env.R2_SECRET_ACCESS_KEY = 'c';
        process.env.R2_BUCKET_NAME = 'd';
        process.env.R2_PUBLIC_URL = 'https://e';
        delete process.env.R2_LOCKED_BUCKET_NAME;
        expect(new R2Service().isLockedEnabled()).toBe(false);
        process.env.R2_LOCKED_BUCKET_NAME = 'x';
        expect(new R2Service().isLockedEnabled()).toBe(true);
        delete process.env.R2_LOCKED_BUCKET_NAME;
    });
});
