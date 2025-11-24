import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * HTTP 요청 로깅 미들웨어
 * 모든 요청의 메서드, URL, 상태 코드, 응답 시간을 기록
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // 요청 시작 로그
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  logger.info(`[REQ] ${req.method} ${req.originalUrl} - IP: ${clientIp}`);

  // 응답 완료 시 로그
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // 상태 코드에 따라 로그 레벨 결정
    const logMessage = `[RES] ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`;

    if (statusCode >= 500) {
      logger.error(logMessage);
    } else if (statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }
  });

  // 응답 에러 시 로그
  res.on('error', (error) => {
    const duration = Date.now() - startTime;
    logger.error(`[RES] ${req.method} ${req.originalUrl} - ERROR - ${duration}ms`, error);
  });

  next();
};

export default requestLogger;
