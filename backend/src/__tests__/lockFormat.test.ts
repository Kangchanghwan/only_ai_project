import { randomBytes } from 'crypto';
import {
    LOCK_PART_SIZE,
    LOCK_RECORD_SIZE,
    ctSizeOf,
    ptSizeOf,
    normalizeLockMeta,
    readLockMeta,
    isLockId,
    isVerifier,
} from '../utils/lockFormat';
import { recordUnlockFailure, unlockRemaining, resetUnlockLimiter, UNLOCK_MAX_PER_IP, UNLOCK_MAX_TOTAL } from '../utils/unlockLimiter';

const b64url = (n: number): string => randomBytes(n).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('lockFormat', () => {
    test('ctSize ↔ ptSize 왕복 (레코드 경계 포함)', () => {
        for (const pt of [1, 2, LOCK_RECORD_SIZE - 1, LOCK_RECORD_SIZE, LOCK_RECORD_SIZE + 1, 64 * LOCK_RECORD_SIZE, 5 * 1024 * 1024 * 1024]) {
            expect(ptSizeOf(ctSizeOf(pt))).toBe(pt);
        }
        expect(ctSizeOf(LOCK_RECORD_SIZE)).toBe(LOCK_RECORD_SIZE + 16);
        expect(ctSizeOf(LOCK_RECORD_SIZE + 1)).toBe(LOCK_RECORD_SIZE + 1 + 32);
        expect(LOCK_PART_SIZE).toBe(64 * (LOCK_RECORD_SIZE + 16));
        expect(LOCK_PART_SIZE).toBeGreaterThanOrEqual(5 * 1024 * 1024); // S3 최소 파트 크기
    });

    const valid = () => ({
        v: 1,
        salt: b64url(16),
        vh: 'a'.repeat(64),
        wk: b64url(48),
        wkIv: b64url(12),
        np: b64url(4),
        en: b64url(30),
        enIv: b64url(12),
    });

    test('정상 메타데이터는 소문자 키 저장 형태로 바뀐다', () => {
        const m = valid();
        expect(normalizeLockMeta(m, 77)).toEqual({ v: '1', salt: m.salt, vh: m.vh, wk: m.wk, wkiv: m.wkIv, np: m.np, en: m.en, eniv: m.enIv, pt: '77' });
        expect(readLockMeta(normalizeLockMeta(m, 77)!)).not.toBeNull();
    });

    test.each([
        ['v', 2],
        ['salt', b64url(15)],
        ['vh', 'A'.repeat(64)],
        ['wk', b64url(32)],
        ['wkIv', b64url(16)],
        ['np', b64url(8)],
        ['enIv', 'not base64!'],
        ['en', b64url(16)], // 태그만 있고 이름 0바이트
        ['en', b64url(16 + 181)], // 180바이트 초과
    ])('형식이 틀린 %s는 거절', (field, value) => {
        expect(normalizeLockMeta({ ...valid(), [field]: value }, 1)).toBeNull();
    });

    test('readLockMeta: 일반 객체 메타데이터는 잠금으로 보지 않는다', () => {
        expect(readLockMeta(undefined)).toBeNull();
        expect(readLockMeta({ foo: 'bar' })).toBeNull();
    });

    test('id·verifier 형식', () => {
        expect(isLockId('0'.repeat(32))).toBe(true);
        expect(isLockId('../x')).toBe(false);
        expect(isVerifier(b64url(32))).toBe(true);
        expect(isVerifier(b64url(31))).toBe(false);
    });
});

describe('unlockLimiter', () => {
    beforeEach(() => resetUnlockLimiter());

    test('IP당 5회, 전체 30회 중 먼저 바닥나는 쪽이 남은 횟수', () => {
        expect(unlockRemaining('vh', 'ip1')).toBe(UNLOCK_MAX_PER_IP);
        for (let i = 0; i < UNLOCK_MAX_PER_IP; i++) recordUnlockFailure('vh', 'ip1');
        expect(unlockRemaining('vh', 'ip1')).toBe(0);
        expect(unlockRemaining('vh', 'ip2')).toBe(UNLOCK_MAX_PER_IP);
        // 여러 IP로 나눠도 전체 30회를 넘을 수 없다
        for (let ip = 2; ip <= 6; ip++) for (let i = 0; i < UNLOCK_MAX_PER_IP; i++) recordUnlockFailure('vh', `ip${ip}`);
        expect(unlockRemaining('vh', 'ip99')).toBe(0);
        expect(UNLOCK_MAX_TOTAL).toBe(30);
    });

    test('24시간이 지나면 초기화', () => {
        const t0 = 1_000_000;
        recordUnlockFailure('vh', 'ip', t0);
        expect(unlockRemaining('vh', 'ip', t0)).toBe(UNLOCK_MAX_PER_IP - 1);
        expect(unlockRemaining('vh', 'ip', t0 + 24 * 3600 * 1000 + 1)).toBe(UNLOCK_MAX_PER_IP);
    });
});
