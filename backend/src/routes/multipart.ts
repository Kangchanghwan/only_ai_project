import type { Express, Request, RequestHandler, Response } from 'express';
import { getR2Service } from '../services/r2Service';
import logger from '../utils/logger';
import { getMaxFileSizeBytes, checkRoomSize } from '../utils/uploadLimits';
import {
    MULTIPART_PART_SIZE,
    MAX_PART_COUNT,
    MAX_SIGN_PARTS,
    MultipartRecord,
    computePartCount,
    partLength,
    putRecord,
    getRecord,
    deleteRecord,
    reservedBytesForRoom,
} from '../utils/multipartStore';
import {
    quotaKeyFromRequest,
    reserveDailyQuota,
    releaseDailyQuota,
    dailyQuotaFailureBody,
} from '../utils/dailyQuota';

const SIGN_EXPIRES_SEC = 3600;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** 키가 `${roomId}/{파일명}` 형태(하위 경로 없음)인지 */
const keyBelongsToRoom = (roomId: string, key: string): boolean =>
    key.startsWith(`${roomId}/`) && key.length > roomId.length + 1 && !key.slice(roomId.length + 1).includes('/');

const isNoSuchUpload = (error: unknown): boolean => (error as { name?: string })?.name === 'NoSuchUpload';

/** CompleteMultipartUpload가 클라이언트 입력 문제(잘못된 파트/순서 등)로 거절된 경우 */
const CLIENT_PART_ERRORS = new Set(['InvalidPart', 'InvalidPartOrder', 'EntityTooSmall', 'MalformedXML', 'InvalidRequest', 'InvalidArgument']);
const isClientPartError = (error: unknown): boolean => {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name && CLIENT_PART_ERRORS.has(e.name)) return true;
    const status = e?.$metadata?.httpStatusCode;
    return typeof status === 'number' && status >= 400 && status < 500 && status !== 403 && status !== 429;
};

function fail(res: Response, status: number, error: string, code: string): void {
    res.status(status).json({ error, code });
}

/**
 * 요청의 uploadId/key에 해당하는 레코드를 찾는다.
 * - 레코드가 있으면 소유 룸·키 일치를 확인한다 (다른 룸이면 403).
 * - 서버 재시작 등으로 레코드가 없으면 key 접두사 검증 후, size가 주어진 경우 레코드를 복원한다.
 *   복원 레코드는 일일 한도 예약이 없다(recovered).
 * 응답을 이미 보냈으면 null.
 */
function resolveRecord(
    req: Request,
    res: Response,
    opts: { requireSize: boolean }
): { record: MultipartRecord | null; roomId: string; uploadId: string; key: string } | null {
    const { roomId, uploadId, key, size } = req.body ?? {};
    if (!isNonEmptyString(roomId) || !isNonEmptyString(uploadId) || !isNonEmptyString(key)) {
        fail(res, 400, 'roomId, uploadId, key는 필수입니다', 'INVALID_REQUEST');
        return null;
    }
    if (!keyBelongsToRoom(roomId, key)) {
        fail(res, 403, '이 룸의 업로드가 아닙니다', 'UPLOAD_FORBIDDEN');
        return null;
    }
    const existing = getRecord(uploadId);
    if (existing) {
        if (existing.roomId !== roomId || existing.key !== key) {
            fail(res, 403, '이 룸의 업로드가 아닙니다', 'UPLOAD_FORBIDDEN');
            return null;
        }
        return { record: existing, roomId, uploadId, key };
    }
    if (size === undefined || size === null) {
        if (opts.requireSize) {
            fail(res, 404, '업로드 정보를 찾을 수 없습니다. size를 함께 보내 복구하세요', 'UPLOAD_NOT_FOUND');
            return null;
        }
        return { record: null, roomId, uploadId, key };
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > getMaxFileSizeBytes()) {
        fail(res, 400, 'size가 올바르지 않습니다', 'INVALID_SIZE');
        return null;
    }
    const recovered: MultipartRecord = {
        roomId,
        key,
        size,
        partSize: MULTIPART_PART_SIZE,
        partCount: computePartCount(size),
        ipKey: quotaKeyFromRequest(req),
        createdAt: Date.now(),
        recovered: true,
    };
    putRecord(uploadId, recovered);
    return { record: recovered, roomId, uploadId, key };
}

export function registerMultipartRoutes(app: Express, auth: RequestHandler): void {
    /** 멀티파트 시작 */
    app.post('/api/r2/multipart/create', auth, async (req, res) => {
        let reservedKey: string | null = null;
        let reservedBytes = 0;
        try {
            const { roomId, fileName, contentType, size } = req.body ?? {};
            if (!isNonEmptyString(roomId) || !isNonEmptyString(fileName) || !isNonEmptyString(contentType)) {
                fail(res, 400, 'roomId, fileName, contentType은 필수입니다', 'INVALID_REQUEST');
                return;
            }
            if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
                fail(res, 400, 'size는 1 이상의 정수(바이트)여야 합니다', 'INVALID_SIZE');
                return;
            }
            if (size > getMaxFileSizeBytes()) {
                fail(res, 413, `파일 크기는 ${getMaxFileSizeBytes() / 1024 / 1024}MB를 초과할 수 없습니다`, 'FILE_TOO_LARGE');
                return;
            }
            const partCount = computePartCount(size);
            if (partCount > MAX_PART_COUNT) {
                fail(res, 413, '파트 수 상한을 초과합니다', 'FILE_TOO_LARGE');
                return;
            }

            const r2 = getR2Service();
            const current = await r2.getRoomTotalSize(roomId);
            const roomFailure = checkRoomSize(current + reservedBytesForRoom(roomId), size);
            if (roomFailure) {
                res.status(roomFailure.status).json({ error: roomFailure.error, code: roomFailure.code });
                return;
            }

            const ipKey = quotaKeyFromRequest(req);
            const quota = reserveDailyQuota(ipKey, size);
            if (!quota.ok) {
                res.status(429).json(dailyQuotaFailureBody(quota.remaining));
                return;
            }
            reservedKey = ipKey;
            reservedBytes = size;

            const { uploadId, key } = await r2.createMultipartUpload(roomId, fileName, contentType);
            putRecord(uploadId, {
                roomId,
                key,
                size,
                partSize: MULTIPART_PART_SIZE,
                partCount,
                ipKey,
                createdAt: Date.now(),
            });
            reservedKey = null;

            res.json({ uploadId, key, partSize: MULTIPART_PART_SIZE, partCount });
        } catch (error) {
            if (reservedKey) releaseDailyQuota(reservedKey, reservedBytes);
            logger.error('[API] 멀티파트 시작 오류:', error);
            res.status(500).json({ error: '멀티파트 업로드 시작 실패' });
        }
    });

    /** 파트별 presigned URL 발급 */
    app.post('/api/r2/multipart/sign', auth, async (req: Request, res: Response) => {
        try {
            const ctx = resolveRecord(req, res, { requireSize: true });
            if (!ctx || !ctx.record) return;
            const { record } = ctx;
            const { partNumbers } = req.body ?? {};
            if (
                !Array.isArray(partNumbers) ||
                partNumbers.length === 0 ||
                partNumbers.length > MAX_SIGN_PARTS ||
                new Set(partNumbers).size !== partNumbers.length ||
                partNumbers.some((n: unknown) => typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > record.partCount)
            ) {
                fail(res, 400, `partNumbers는 1~${record.partCount} 범위의 정수 최대 ${MAX_SIGN_PARTS}개여야 합니다`, 'INVALID_PART_NUMBERS');
                return;
            }
            const r2 = getR2Service();
            const urls = await Promise.all(
                (partNumbers as number[]).map(async (partNumber) => ({
                    partNumber,
                    url: await r2.signUploadPart(
                        ctx.key,
                        ctx.uploadId,
                        partNumber,
                        partLength(record.size, record.partSize, partNumber),
                        SIGN_EXPIRES_SEC
                    ),
                }))
            );
            res.json({ urls, expiresIn: SIGN_EXPIRES_SEC });
        } catch (error) {
            logger.error('[API] 파트 서명 오류:', error);
            res.status(500).json({ error: '파트 URL 생성 실패' });
        }
    });

    /** 이어올리기용 완료 파트 조회 */
    app.post('/api/r2/multipart/parts', auth, async (req: Request, res: Response) => {
        try {
            const ctx = resolveRecord(req, res, { requireSize: false });
            if (!ctx) return;
            const parts = await getR2Service().listParts(ctx.key, ctx.uploadId);
            res.json({
                parts,
                ...(ctx.record ? { partSize: ctx.record.partSize, partCount: ctx.record.partCount, size: ctx.record.size } : {}),
            });
        } catch (error) {
            if (isNoSuchUpload(error)) {
                fail(res, 404, '업로드 정보를 찾을 수 없습니다', 'UPLOAD_NOT_FOUND');
                return;
            }
            logger.error('[API] 파트 조회 오류:', error);
            res.status(500).json({ error: '파트 조회 실패' });
        }
    });

    /** 멀티파트 완료 */
    app.post('/api/r2/multipart/complete', auth, async (req: Request, res: Response) => {
        try {
            const ctx = resolveRecord(req, res, { requireSize: false });
            if (!ctx) return;
            const { record, roomId, uploadId, key } = ctx;
            const { parts, size: declared } = req.body ?? {};

            const validParts =
                Array.isArray(parts) &&
                parts.length > 0 &&
                parts.length <= MAX_PART_COUNT &&
                parts.every(
                    (p: { PartNumber?: unknown; ETag?: unknown }) =>
                        typeof p?.PartNumber === 'number' &&
                        Number.isInteger(p.PartNumber) &&
                        p.PartNumber >= 1 &&
                        typeof p.ETag === 'string' &&
                        p.ETag.length > 0
                );
            if (!validParts) {
                fail(res, 400, 'parts([{PartNumber, ETag}])가 필요합니다', 'INVALID_PARTS');
                return;
            }
            const sorted = [...(parts as Array<{ PartNumber: number; ETag: string }>)].sort((a, b) => a.PartNumber - b.PartNumber);
            if (sorted.some((p, i) => i > 0 && p.PartNumber === sorted[i - 1].PartNumber)) {
                fail(res, 400, '중복된 PartNumber가 있습니다', 'INVALID_PARTS');
                return;
            }
            if (record && sorted.length !== record.partCount) {
                fail(res, 400, `파트 수가 맞지 않습니다 (필요 ${record.partCount}개)`, 'INVALID_PARTS');
                return;
            }

            const r2 = getR2Service();
            try {
                await r2.completeMultipartUpload(key, uploadId, sorted);
            } catch (error) {
                if (isNoSuchUpload(error)) {
                    fail(res, 404, '업로드 정보를 찾을 수 없습니다', 'UPLOAD_NOT_FOUND');
                    return;
                }
                if (isClientPartError(error)) {
                    logger.warn(`[API] 멀티파트 완료 거절(클라이언트 입력): ${key} (${(error as { name?: string })?.name})`);
                    fail(res, 400, '업로드한 파트 정보가 올바르지 않습니다', 'INVALID_PARTS');
                    return;
                }
                throw error;
            }

            const actual = await r2.getObjectSize(key);
            const expected = record?.size ?? (typeof declared === 'number' ? declared : undefined);
            const tooBig = actual !== null && actual > getMaxFileSizeBytes();
            const mismatch = actual === null || tooBig || (expected !== undefined && actual !== expected);
            if (mismatch) {
                await r2.deleteObjectKey(key).catch((e) => logger.error('[API] 불일치 객체 삭제 실패:', e));
                if (record && !record.recovered) releaseDailyQuota(record.ipKey, record.size);
                deleteRecord(uploadId);
                logger.warn(`[API] 멀티파트 크기 불일치 → 삭제: ${key} (expected=${expected}, actual=${actual})`);
                fail(res, 422, '업로드된 파일 크기가 선언한 크기와 다릅니다', 'SIZE_MISMATCH');
                return;
            }

            deleteRecord(uploadId);
            const fileName = key.slice(roomId.length + 1);
            logger.info(`[API] 멀티파트 완료: ${key} (${actual} bytes)`);
            res.json({ success: true, fileName, fileUrl: r2.getFileUrl(roomId, fileName), size: actual });
        } catch (error) {
            logger.error('[API] 멀티파트 완료 오류:', error);
            res.status(500).json({ error: '멀티파트 업로드 완료 실패' });
        }
    });

    /** 멀티파트 중단. 일일 한도는 실제로 올라간 파트 바이트만 남기고 나머지를 돌려준다 */
    app.post('/api/r2/multipart/abort', auth, async (req: Request, res: Response) => {
        try {
            const ctx = resolveRecord(req, res, { requireSize: false });
            if (!ctx) return;
            const { record, uploadId, key } = ctx;
            const r2 = getR2Service();

            let uploaded = 0;
            try {
                uploaded = (await r2.listParts(key, uploadId)).reduce((sum, p) => sum + p.Size, 0);
            } catch {
                uploaded = record?.size ?? 0; // 조회 실패 시 보수적으로 환급하지 않는다
            }
            try {
                await r2.abortMultipartUpload(key, uploadId);
            } catch (error) {
                if (!isNoSuchUpload(error)) throw error;
            }
            if (record && !record.recovered) {
                releaseDailyQuota(record.ipKey, Math.max(0, record.size - uploaded));
            }
            deleteRecord(uploadId);
            res.json({ success: true });
        } catch (error) {
            logger.error('[API] 멀티파트 중단 오류:', error);
            res.status(500).json({ error: '멀티파트 업로드 중단 실패' });
        }
    });
}
