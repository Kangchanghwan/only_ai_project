import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import dotenv from 'dotenv';
import { RoomManager } from './managers/RoomManager';
import { setupSocketHandlers } from './handlers/socketHandlers';
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from './types';
import logger from './utils/logger';

// === 환경 설정 ===

dotenv.config();
const PORT = process.env.PORT || 3001;

// === Express & HTTP 서버 초기화 ===

const app = express();
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
