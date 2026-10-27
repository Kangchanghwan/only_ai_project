import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

/**
 * Express 전역 에러 핸들러: 미들웨어/본문 파싱 단계의 예외를 ERROR 로그로 남기고 JSON으로 응답한다.
 * 쿼리 문자열·본문은 민감값이 있을 수 있어 기록하지 않는다(method, path만).
 */
export default function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    const e = (err ?? {}) as { type?: string; status?: number; message?: unknown; stack?: unknown };
    logger.error('[API] 처리되지 않은 오류:', req.method, req.path, e.message, e.stack);

    if (e.type === 'entity.parse.failed' || e.status === 400) {
        res.status(400).json({ error: '잘못된 요청 본문' });
        return;
    }
    res.status(500).json({ error: '서버 내부 오류' });
}
