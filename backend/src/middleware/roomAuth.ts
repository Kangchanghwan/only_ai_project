import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ROOM_TOKEN_HEADER, verifyRoomToken } from '../utils/roomToken';
import logger from '../utils/logger';

/**
 * ROOM_TOKEN_ENFORCE=false 이면 "보고 전용" 모드: 토큰이 없거나 틀려도 통과시키고 경고 로그만 남긴다.
 * 배포 직후 문제가 생겼을 때 코드 롤백 없이 환경 변수만으로 되돌리기 위한 스위치다. 기본값은 강제.
 */
export const isRoomTokenEnforced = (): boolean => process.env.ROOM_TOKEN_ENFORCE !== 'false';

/**
 * roomId에 대한 룸 토큰(X-Room-Token 헤더)을 요구하는 미들웨어.
 * roomId를 못 찾으면 그대로 통과시켜 라우트 핸들러의 400 검증에 맡긴다.
 *
 * @param getRoomId 요청에서 대상 roomId를 꺼내는 함수 (params 또는 body)
 */
export const requireRoomToken = (getRoomId: (req: Request) => unknown): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
        const roomId = getRoomId(req);
        if (typeof roomId !== 'string' || roomId.length === 0) {
            next();
            return;
        }

        const result = verifyRoomToken(roomId, req.get(ROOM_TOKEN_HEADER));
        if (result === 'valid') {
            next();
            return;
        }

        if (!isRoomTokenEnforced()) {
            logger.warn(`[RoomAuth] 토큰 ${result} (보고 전용 모드, 통과) ${req.method} ${req.route?.path ?? req.path}`);
            next();
            return;
        }

        logger.warn(`[RoomAuth] 토큰 ${result} → 401 ${req.method} ${req.route?.path ?? req.path}`);
        res.status(401).json({
            error: '룸 인증이 필요합니다',
            code: result === 'expired' ? 'ROOM_TOKEN_EXPIRED' : 'ROOM_TOKEN_INVALID',
        });
    };
