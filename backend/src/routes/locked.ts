import type { Express, RequestHandler, Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { getR2Service } from '../services/r2Service';
import logger from '../utils/logger';
import { deleteUploader } from '../utils/uploaderStore';
import { quotaKeyFromRequest } from '../utils/dailyQuota';
import { LOCK_RECORD_SIZE, LOCK_VERSION, LockObjectMetadata, isLockId, isVerifier, isDeleteKey } from '../utils/lockFormat';
import { recordUnlockFailure, unlockRemaining } from '../utils/unlockLimiter';

/** 다운로드 URL 유효 시간(초). 새어도 암호문뿐이지만 짧게 둔다 */
export const LOCKED_DOWNLOAD_EXPIRES_SEC = 60;

/** 키에 그대로 들어가므로 하위 경로(`/`)를 막는다 */
const isRoomId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(v);

function fail(res: Response, status: number, error: string, code: string, extra: object = {}): void {
    res.status(status).json({ error, code, ...extra });
}

const fromB64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** SHA-256(base64url 값의 바이트)이 저장된 hex 해시와 같은지 (상수 시간 비교) */
const hashMatches = (b64: string, hexHash: string | undefined): boolean => {
    if (!hexHash) return false;
    const actual = createHash('sha256').update(fromB64url(b64)).digest();
    const expected = Buffer.from(hexHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

type VerifyResult = { ok: true } | { ok: false; status: 403 | 429; code: 'WRONG_PASSWORD' | 'LOCKED_OUT'; remaining: number };

/**
 * 비밀번호 확인값 검증 + 시도 제한. 풀기와 삭제가 같은 카운터를 쓴다
 * (삭제 API가 횟수 제한 없는 비밀번호 대입 통로가 되지 않게).
 */
function checkVerifier(meta: LockObjectMetadata, verifier: string, ipKey: string): VerifyResult {
    if (unlockRemaining(meta.vh, ipKey) <= 0) return { ok: false, status: 429, code: 'LOCKED_OUT', remaining: 0 };
    if (hashMatches(verifier, meta.vh)) return { ok: true };
    const remaining = recordUnlockFailure(meta.vh, ipKey);
    return remaining <= 0
        ? { ok: false, status: 429, code: 'LOCKED_OUT', remaining: 0 }
        : { ok: false, status: 403, code: 'WRONG_PASSWORD', remaining };
}

/**
 * 비밀번호 잠금 파일 라우트.
 * - meta/unlock은 룸 토큰 없이 연다: 공유 링크 수신자도 쓸 수 있어야 하고, 관문은 비밀번호(+시도 제한)다.
 * - 삭제는 룸 토큰 + 증명(올린 기기의 삭제 키 또는 비밀번호 확인값)을 요구한다.
 *   비밀번호를 모르는 사람이 남의 잠긴 파일을 지우지 못하게 한다.
 */
export function registerLockedRoutes(app: Express, roomAuthFromBody: RequestHandler): void {
    const enabled: RequestHandler = (_req, res, next) => {
        if (!getR2Service().isLockedEnabled()) {
            fail(res, 503, '비밀번호 잠금을 사용할 수 없습니다', 'LOCKED_DISABLED');
            return;
        }
        next();
    };

    /** 풀기 전에 필요한 공개 정보: salt(비밀번호 파생용), 평문 크기, 남은 시도 */
    app.get('/api/r2/locked/meta/:roomId/:id', enabled, async (req, res) => {
        try {
            const { roomId, id } = req.params;
            if (!isRoomId(roomId) || !isLockId(id)) {
                fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
                return;
            }
            const obj = await getR2Service().getLockedObject(roomId, id);
            if (!obj) {
                fail(res, 404, '잠긴 파일을 찾을 수 없습니다', 'LOCKED_NOT_FOUND');
                return;
            }
            res.setHeader('Cache-Control', 'no-store');
            res.json({
                v: LOCK_VERSION,
                salt: obj.meta.salt,
                size: Number(obj.meta.pt),
                rs: LOCK_RECORD_SIZE,
                remaining: unlockRemaining(obj.meta.vh, quotaKeyFromRequest(req)),
            });
        } catch (error) {
            logger.error('[API] 잠금 메타 조회 오류:', error);
            res.status(500).json({ error: '잠금 정보 조회 실패' });
        }
    });

    /** 비밀번호 확인값(verifier)이 맞으면 짧은 다운로드 URL과 복호화에 필요한 감싼 키 등을 준다 */
    app.post('/api/r2/locked/unlock', enabled, async (req, res) => {
        try {
            const { roomId, id, verifier } = req.body ?? {};
            if (!isRoomId(roomId) || !isLockId(id) || !isVerifier(verifier)) {
                fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
                return;
            }
            const r2 = getR2Service();
            const obj = await r2.getLockedObject(roomId, id);
            if (!obj) {
                fail(res, 404, '잠긴 파일을 찾을 수 없습니다', 'LOCKED_NOT_FOUND');
                return;
            }
            const { meta, ctSize } = obj;
            res.setHeader('Cache-Control', 'no-store');

            const check = checkVerifier(meta, verifier, quotaKeyFromRequest(req));
            if (!check.ok) {
                const msg = check.code === 'LOCKED_OUT' ? '시도 횟수를 모두 썼습니다' : '비밀번호가 맞지 않습니다';
                fail(res, check.status, msg, check.code, { remaining: check.remaining });
                return;
            }

            const url = await r2.getLockedDownloadUrl(roomId, id, LOCKED_DOWNLOAD_EXPIRES_SEC);
            res.json({
                url,
                expiresIn: LOCKED_DOWNLOAD_EXPIRES_SEC,
                size: Number(meta.pt),
                ctSize,
                rs: LOCK_RECORD_SIZE,
                np: meta.np,
                wk: meta.wk,
                wkIv: meta.wkiv,
                en: meta.en,
                enIv: meta.eniv,
            });
        } catch (error) {
            logger.error('[API] 잠금 해제 오류:', error);
            res.status(500).json({ error: '잠금 해제 실패' });
        }
    });

    /**
     * 잠긴 파일 삭제. body: {roomId, id, deleteKey?, verifier?}
     * 삭제 키(올린 기기)가 맞거나, 비밀번호 확인값이 맞을 때만 지운다. 둘 다 없으면 403.
     */
    app.post('/api/r2/locked/delete', enabled, roomAuthFromBody, async (req, res) => {
        try {
            const { roomId, id, deleteKey, verifier } = req.body ?? {};
            if (
                !isRoomId(roomId) ||
                !isLockId(id) ||
                (deleteKey !== undefined && !isDeleteKey(deleteKey)) ||
                (verifier !== undefined && !isVerifier(verifier))
            ) {
                fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
                return;
            }
            const r2 = getR2Service();
            const obj = await r2.getLockedObject(roomId, id);
            if (!obj) {
                fail(res, 404, '잠긴 파일을 찾을 수 없습니다', 'LOCKED_NOT_FOUND');
                return;
            }

            const ownerOk = typeof deleteKey === 'string' && hashMatches(deleteKey, obj.meta.dh);
            if (!ownerOk) {
                if (typeof verifier !== 'string') {
                    fail(res, 403, '비밀번호가 필요합니다', 'DELETE_FORBIDDEN');
                    return;
                }
                const check = checkVerifier(obj.meta, verifier, quotaKeyFromRequest(req));
                if (!check.ok) {
                    const msg = check.code === 'LOCKED_OUT' ? '시도 횟수를 모두 썼습니다' : '비밀번호가 맞지 않습니다';
                    fail(res, check.status, msg, check.code, { remaining: check.remaining });
                    return;
                }
            }

            await r2.deleteLockedFile(roomId, id);
            deleteUploader(roomId, id);
            res.json({ success: true });
        } catch (error) {
            logger.error('[API] 잠긴 파일 삭제 오류:', error);
            res.status(500).json({ error: '파일 삭제 실패' });
        }
    });
}
