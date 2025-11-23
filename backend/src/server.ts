import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { RoomManager } from './managers/RoomManager';
import { setupSocketHandlers } from './handlers/socketHandlers';
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from './types';
import logger from './utils/logger';
import requestLogger from './middleware/requestLogger';
import { getR2Service } from './services/r2Service';

// === Multer 설정 (직접 업로드용) ===

// 직접 업로드 임계값 (1MB)
const DIRECT_UPLOAD_MAX_SIZE = 1 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: DIRECT_UPLOAD_MAX_SIZE,
    },
});

// === 환경 설정 ===

dotenv.config();
const PORT = process.env.PORT || 3001;

// === Express & HTTP 서버 초기화 ===

const app = express();

// JSON 파싱 미들웨어
app.use(express.json());

// CORS 설정
app.use((_req, res, next) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:5173',
    ];
    const origin = _req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// 요청 로깅 미들웨어
app.use(requestLogger);

const httpServer = createServer(app);

// === Socket.IO 서버 초기화 ===

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
            'http://localhost:3000',
            'http://localhost:3020',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
    // 연결 타임아웃 설정
    pingTimeout: 60000,      // 60초
    pingInterval: 25000,     // 25초
    connectTimeout: 45000,   // 45초

    // 연결 상태 복구 (프로덕션 기능)
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,  // 2분간 상태 보존
        skipMiddlewares: true                       // 재연결 시 미들웨어 스킵
    },
});

// === 룸 관리자 & 이벤트 핸들러 설정 ===

const roomManager = new RoomManager();
setupSocketHandlers(io, roomManager);

// === API 엔드포인트 ===

/** 헬스체크: 서버 상태 및 통계 */
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        totalRooms: roomManager.getTotalRooms(),
        totalUsers: roomManager.getTotalUsers()
    });
});

/** 통계 조회: 룸 및 사용자 정보 */
app.get('/stats', (_req, res) => {
    res.json({
        totalRooms: roomManager.getTotalRooms(),
        totalUsers: roomManager.getTotalUsers(),
        timestamp: new Date().toISOString()
    });
});

// === R2 Storage API 엔드포인트 ===

/** 업로드용 Presigned URL 생성 */
app.post('/api/r2/presigned-url', async (req, res) => {
    try {
        const { roomId, fileName, contentType } = req.body;

        if (!roomId || !fileName || !contentType) {
            res.status(400).json({ error: 'roomId, fileName, contentType은 필수입니다' });
            return;
        }

        logger.info(`[API] Presigned URL 요청 - 원본 파일명: ${fileName}`);

        const r2Service = getR2Service();
        const generatedFileName = r2Service.generateFileName(fileName);

        logger.info(`[API] Presigned URL 요청 - 변환된 파일명: ${generatedFileName}`);

        const result = await r2Service.getUploadPresignedUrl(roomId, generatedFileName, contentType);

        res.json(result);
    } catch (error) {
        logger.error('[API] Presigned URL 생성 오류:', error);
        res.status(500).json({ error: 'Presigned URL 생성 실패' });
    }
});

/** 직접 업로드 (작은 파일용, 1MB 이하) */
app.post('/api/r2/upload', upload.single('file'), async (req, res) => {
    try {
        const { roomId } = req.body;
        const file = req.file;

        if (!roomId) {
            res.status(400).json({ error: 'roomId는 필수입니다' });
            return;
        }

        if (!file) {
            res.status(400).json({ error: '파일이 필요합니다' });
            return;
        }

        const r2Service = getR2Service();
        const generatedFileName = r2Service.generateFileName(file.originalname);
        const result = await r2Service.uploadFile(
            roomId,
            generatedFileName,
            file.buffer,
            file.mimetype
        );

        logger.info(`[API] 직접 업로드 성공: ${roomId}/${generatedFileName}`);

        res.json({
            success: true,
            fileName: result.fileName,
            fileUrl: result.fileUrl,
            size: file.size,
        });
    } catch (error) {
        logger.error('[API] 직접 업로드 오류:', error);
        const message = error instanceof Error ? error.message : '직접 업로드 실패';
        res.status(500).json({ error: message });
    }
});

/** 파일 목록 조회 */
app.get('/api/r2/files/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const r2Service = getR2Service();
        const result = await r2Service.loadFiles(roomId, { limit });

        res.json(result);
    } catch (error) {
        logger.error('[API] 파일 목록 조회 오류:', error);
        res.status(500).json({ error: '파일 목록 조회 실패' });
    }
});

/** 룸 총 용량 조회 */
app.get('/api/r2/size/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;

        const r2Service = getR2Service();
        const totalSize = await r2Service.getRoomTotalSize(roomId);

        res.json({ totalSize });
    } catch (error) {
        logger.error('[API] 룸 용량 조회 오류:', error);
        res.status(500).json({ error: '룸 용량 조회 실패' });
    }
});

/** 파일 삭제 */
app.delete('/api/r2/files/:roomId/:fileName', async (req, res) => {
    try {
        const { roomId, fileName } = req.params;

        const r2Service = getR2Service();
        await r2Service.deleteFile(roomId, fileName);

        res.json({ success: true });
    } catch (error) {
        logger.error('[API] 파일 삭제 오류:', error);
        res.status(500).json({ error: '파일 삭제 실패' });
    }
});

/** 룸의 모든 파일 삭제 */
app.delete('/api/r2/files/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;

        const r2Service = getR2Service();
        const deletedCount = await r2Service.deleteAllFiles(roomId);

        res.json({ success: true, deletedCount });
    } catch (error) {
        logger.error('[API] 전체 파일 삭제 오류:', error);
        res.status(500).json({ error: '전체 파일 삭제 실패' });
    }
});

// === 서버 시작 ===

if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(PORT, () => {
        logger.info(`서버 시작: 포트 ${PORT}`);
        logger.info(`환경: ${process.env.NODE_ENV || 'development'}`);
    });
}

// === Graceful Shutdown ===

const gracefulShutdown = (signal: string) => {
    logger.info(`${signal} 시그널 수신: 서버 종료 시작`);

    // Socket.IO 연결 종료
    io.close(() => {
        logger.info('Socket.IO 연결 종료 완료');
    });

    // HTTP 서버 종료
    httpServer.close(() => {
        logger.info('HTTP 서버 종료 완료');
        process.exit(0);
    });

    // 10초 후 강제 종료
    setTimeout(() => {
        logger.error('타임아웃으로 강제 종료');
        process.exit(1);
    }, 10000);
};

// 시그널 핸들러
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 예외 처리
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', promise, 'reason:', reason);
});

// === 테스트용 Export ===

export { io, httpServer, roomManager };
