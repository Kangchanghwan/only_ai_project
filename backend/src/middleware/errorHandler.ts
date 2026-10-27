import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

/**
 * Express 전역 에러 핸들러: 미들웨어/본문 파싱 단계의 예외를 로그로 남기고 JSON으로 응답한다.
 * 쿼리 문자열·본문은 민감값이 있을 수 있어 기록하지 않는다(method, path만).
 * - 4xx(오류에 status가 실린 경우, 예: 잘못된 JSON 400, 본문 초과 413)는 그 상태 코드 그대로 응답하고 warn으로 남긴다.
 *   body-parser 메시지에는 요청 본문 일부가 섞일 수 있어 4xx는 type만 기록한다.
 * - 그 밖은 500 + 일반 메시지, error로 메시지·스택을 남긴다(응답에는 넣지 않는다).
 */
export default function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    const e = (err ?? {}) as { type?: string; status?: number; statusCode?: number; message?: unknown; stack?: unknown };
    const raw = typeof e.status === 'number' ? e.status : e.statusCode;
    const status = typeof raw === 'number' && raw >= 400 && raw < 500 ? raw : 500;

    if (status < 500) {
        logger.warn('[API] 요청 오류:', req.method, req.path, status, e.type ?? 'client-error');
        const message = e.type === 'entity.parse.failed' ? '잘못된 요청 본문'
            : status === 413 ? '요청 본문이 너무 큽니다'
            : '잘못된 요청';
        res.status(status).json({ error: message });
        return;
    }

    logger.error('[API] 처리되지 않은 오류:', req.method, req.path, e.message, e.stack);
    res.status(500).json({ error: '서버 내부 오류' });
}
