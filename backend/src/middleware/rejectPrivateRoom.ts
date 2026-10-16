import { RequestHandler } from 'express';
import { hasPrivateRoomPrefix } from '../utils/privateRoom';

/**
 * 일반(비잠금) 업로드 경로에서 비공개 방 roomId를 거부한다.
 * 일반 버킷은 공개 URL이라 1:1 방은 잠금 업로드만 허용한다. 인증보다 먼저 두어 토큰 유무와 무관하게 400.
 */
export const rejectPrivateRoom: RequestHandler = (req, res, next) => {
    if (hasPrivateRoomPrefix(req.body?.roomId)) {
        res.status(400).json({ error: '1:1 방에는 잠금 업로드만 사용할 수 있습니다', code: 'PRIVATE_ROOM_LOCKED_ONLY' });
        return;
    }
    next();
};
