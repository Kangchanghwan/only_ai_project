import type { Express, RequestHandler, Response } from 'express';
import logger from '../utils/logger';
import { quotaKeyFromRequest } from '../utils/dailyQuota';
import { isVerifier, isDeleteKey } from '../utils/lockFormat';
import { checkVerifier, hashMatches } from '../utils/lockProof';
import { isPrivateRoomId } from '../utils/privateRoom';
import {
    TextQueue, getTextQueue, toPublicText, isTextId, isQueueRoomId, QueuedText,
    TEXT_QUEUE_TTL_MS, TEXT_QUEUE_MAX_PER_ROOM,
} from '../utils/textQueue';

/** 삭제 요청 한 번에 받는 비밀번호 증명 수 (같은 비밀번호 묶음=salt 하나에 하나) */
const MAX_PROOFS = 5;
const isSalt = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v);

function fail(res: Response, status: number, error: string, code: string, extra: object = {}): void {
    res.status(status).json({ error, code, ...extra });
}

const isIdList = (v: unknown): v is string[] =>
    Array.isArray(v) && v.length >= 1 && v.length <= TEXT_QUEUE_MAX_PER_ROOM && v.every(isTextId);

/**
 * 텍스트 대기열 라우트. 모두 룸 토큰(그 방에 소켓으로 들어가 있다는 증명)을 요구한다.
 * - 목록: 보관 중 텍스트. 잠긴 텍스트는 salt만(암호문 없음).
 * - 풀기: 비밀번호 확인값이 맞으면 잠긴 텍스트의 암호문을 준다 (잠긴 파일과 같은 시도 제한).
 * - 삭제: 1:1 방은 방 멤버면 된다. 같은 네트워크·전체 공유의 잠긴 텍스트는 보낸 기기의 삭제 키
 *   또는 비밀번호 확인값이 있어야 지운다.
 * 평문은 서버에 없으므로 어떤 응답·로그에도 실리지 않는다.
 */
export function registerTextRoutes(
    app: Express,
    roomAuthFromParams: RequestHandler,
    roomAuthFromBody: RequestHandler,
    queue: () => TextQueue = getTextQueue
): void {
    app.get('/api/texts/:roomId', roomAuthFromParams, (req, res) => {
        const { roomId } = req.params;
        if (!isQueueRoomId(roomId)) {
            fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ texts: queue().list(roomId).map(toPublicText), ttlSec: TEXT_QUEUE_TTL_MS / 1000 });
    });

    /** body: {roomId, textIds, verifier}. 같은 비밀번호 묶음의 잠긴 텍스트 암호문을 돌려준다 */
    app.post('/api/texts/unlock', roomAuthFromBody, (req, res) => {
        try {
            const { roomId, textIds, verifier } = req.body ?? {};
            if (!isQueueRoomId(roomId) || !isIdList(textIds) || !isVerifier(verifier)) {
                fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
                return;
            }
            const q = queue();
            const found = textIds.map((id) => q.get(roomId, id)).filter((e): e is QueuedText => !!e?.lock);
            if (found.length === 0) {
                fail(res, 404, '보관 중인 텍스트가 없습니다', 'TEXT_NOT_FOUND');
                return;
            }
            res.setHeader('Cache-Control', 'no-store');
            const vh = found[0].lock!.vh;
            const check = checkVerifier(vh, verifier, quotaKeyFromRequest(req));
            if (!check.ok) {
                const msg = check.code === 'LOCKED_OUT' ? '시도 횟수를 모두 썼습니다' : '비밀번호가 맞지 않습니다';
                fail(res, check.status, msg, check.code, { remaining: check.remaining });
                return;
            }
            res.json({ texts: found.filter((e) => e.lock!.vh === vh).map((e) => ({ textId: e.textId, enc: e.enc })) });
        } catch (error) {
            logger.error('[API] 텍스트 풀기 오류:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: '텍스트 풀기 실패' });
        }
    });

    /**
     * body: {roomId, textIds? | all?: true, deleteKeys?: {textId: key}, proofs?: [{salt, verifier}]}
     * 지운 것과 증명이 없어 못 지운 것을 돌려준다.
     */
    app.post('/api/texts/delete', roomAuthFromBody, (req, res) => {
        try {
            const { roomId, textIds, all, deleteKeys, proofs } = req.body ?? {};
            const keysOk = deleteKeys === undefined || (
                !!deleteKeys && typeof deleteKeys === 'object' && !Array.isArray(deleteKeys) &&
                Object.keys(deleteKeys).length <= TEXT_QUEUE_MAX_PER_ROOM &&
                Object.entries(deleteKeys).every(([id, k]) => isTextId(id) && isDeleteKey(k))
            );
            const proofsOk = proofs === undefined || (
                Array.isArray(proofs) && proofs.length <= MAX_PROOFS &&
                proofs.every((p) => !!p && typeof p === 'object' && isSalt(p.salt) && isVerifier(p.verifier))
            );
            if (!isQueueRoomId(roomId) || !(all === true || isIdList(textIds)) || !keysOk || !proofsOk) {
                fail(res, 400, '잘못된 요청입니다', 'INVALID_REQUEST');
                return;
            }

            const q = queue();
            const entries = q.list(roomId);
            const targets = all === true ? entries : entries.filter((e) => (textIds as string[]).includes(e.textId));
            const keys = (deleteKeys ?? {}) as Record<string, string>;
            const ipKey = quotaKeyFromRequest(req);

            // 비밀번호 증명은 salt로 묶음을 고른 뒤 그 묶음의 vh에 대해 한 번씩만 확인한다 (틀리면 시도 제한에 센다)
            const verified = new Map<string, boolean>();
            const state: { failure: { code: string; remaining: number } | null } = { failure: null };
            const proofOk = (e: QueuedText): boolean => {
                const lock = e.lock!;
                const proof = ((proofs ?? []) as Array<{ salt: string; verifier: string }>).find((p) => p.salt === lock.salt);
                if (!proof) return false;
                if (!verified.has(lock.vh)) {
                    const check = checkVerifier(lock.vh, proof.verifier, ipKey);
                    verified.set(lock.vh, check.ok);
                    if (!check.ok) state.failure = { code: check.code, remaining: check.remaining };
                }
                return verified.get(lock.vh)!;
            };

            const allowed: string[] = [];
            const forbidden: string[] = [];
            for (const e of targets) {
                const ok = isPrivateRoomId(roomId) || !e.lock ||
                    (typeof keys[e.textId] === 'string' && hashMatches(keys[e.textId], e.lock.dh)) ||
                    proofOk(e);
                (ok ? allowed : forbidden).push(e.textId);
            }
            const deleted = q.remove(roomId, allowed);
            res.json({ deleted, forbidden, ...(state.failure ?? {}) });
        } catch (error) {
            logger.error('[API] 텍스트 삭제 오류:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: '텍스트 삭제 실패' });
        }
    });
}
