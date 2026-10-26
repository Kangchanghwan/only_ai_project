import { createHash, timingSafeEqual } from 'crypto';
import { recordUnlockFailure, unlockRemaining } from './unlockLimiter';

const fromB64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** SHA-256(base64url 값의 바이트)이 저장된 hex 해시와 같은지 (상수 시간 비교) */
export const hashMatches = (b64: string, hexHash: string | undefined): boolean => {
    if (!hexHash) return false;
    const actual = createHash('sha256').update(fromB64url(b64)).digest();
    const expected = Buffer.from(hexHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export type VerifyResult = { ok: true } | { ok: false; status: 403 | 429; code: 'WRONG_PASSWORD' | 'LOCKED_OUT'; remaining: number };

/**
 * 비밀번호 확인값 검증 + 시도 제한(vh 묶음 × IP). 잠긴 파일·잠긴 텍스트의 풀기와 삭제가 같은 카운터를 쓴다
 * (삭제 API가 횟수 제한 없는 비밀번호 대입 통로가 되지 않게).
 */
export function checkVerifier(vh: string, verifier: string, ipKey: string): VerifyResult {
    if (unlockRemaining(vh, ipKey) <= 0) return { ok: false, status: 429, code: 'LOCKED_OUT', remaining: 0 };
    if (hashMatches(verifier, vh)) return { ok: true };
    const remaining = recordUnlockFailure(vh, ipKey);
    return remaining <= 0
        ? { ok: false, status: 429, code: 'LOCKED_OUT', remaining: 0 }
        : { ok: false, status: 403, code: 'WRONG_PASSWORD', remaining };
}
