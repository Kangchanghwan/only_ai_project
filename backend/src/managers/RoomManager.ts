import { Rooms, RoomData } from '../types';
import { StorageService } from '../services/StorageService';
import logger from '../utils/logger';

/** 고정 룸 ID */
export const SHARED_ROOM_ID = 'room-shared';

/** 기본 grace period: 10분 (ms) */
const DEFAULT_GRACE_PERIOD_MS = 10 * 60 * 1000;

/**
 * 룸 관리 클래스
 * - 단일 공유 룸 관리
 * - 사용자 입장/퇴장 추적
 * - 빈 룸은 grace period 후 자동 삭제
 * - 통계 조회
 */
export class RoomManager {
    private rooms: Rooms = {};
    private storageService: StorageService;
    private gracePeriodMs: number;

    constructor(storageService?: StorageService, gracePeriodMs?: number) {
        this.storageService = storageService || new StorageService();
        this.gracePeriodMs = gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    }

    /** 공유 룸 ID 반환 */
    getSharedRoomId(): string {
        return SHARED_ROOM_ID;
    }

    /** 새 룸 생성 */
    createRoom(roomId: string): void {
        if (!this.rooms[roomId]) {
            this.rooms[roomId] = {
                userCount: 0,
                createdAt: new Date()
            };
        }
    }

    /** 룸에 사용자 추가 (룸이 없으면 자동 생성, 삭제 타이머 취소) */
    addUserToRoom(roomId: string): number {
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }

        // 예약된 삭제 타이머가 있으면 취소 (재입장 시 삭제 중단)
        if (this.rooms[roomId].cleanupTimer) {
            clearTimeout(this.rooms[roomId].cleanupTimer);
            delete this.rooms[roomId].cleanupTimer;
            logger.info(`Cancelled cleanup timer for room ${roomId} (user rejoined)`);
        }

        this.rooms[roomId].userCount++;
        return this.rooms[roomId].userCount;
    }

    /** 룸에서 사용자 제거 (빈 룸은 grace period 후 자동 삭제) */
    async removeUserFromRoom(roomId: string): Promise<number> {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].userCount--;

        // 빈 룸: grace period 후 삭제 스케줄링
        if (this.rooms[roomId].userCount <= 0) {
            this.rooms[roomId].userCount = 0;

            logger.info(`Room ${roomId} is empty. Scheduling cleanup in ${this.gracePeriodMs / 1000}s`);

            this.rooms[roomId].cleanupTimer = setTimeout(() => {
                this._cleanupRoom(roomId);
            }, this.gracePeriodMs);

            return 0;
        }

        return this.rooms[roomId].userCount;
    }

    /** 실제 룸 삭제 로직 (타이머 만료 후 실행) */
    private async _cleanupRoom(roomId: string): Promise<void> {
        // 타이머 만료 시점에 사용자가 재입장했으면 삭제하지 않음
        if (this.rooms[roomId] && this.rooms[roomId].userCount > 0) {
            return;
        }

        const result = await this.storageService.deleteRoomFiles(roomId);
        if (result.success) {
            logger.info(`Deleted ${result.deletedCount} files for room ${roomId}`);
        } else {
            logger.error(`Failed to delete files for room ${roomId}: ${result.error}`);
        }

        delete this.rooms[roomId];
    }

    /** 모든 방의 삭제 타이머 취소 (graceful shutdown용) */
    cancelAllTimers(): void {
        for (const roomId of Object.keys(this.rooms)) {
            if (this.rooms[roomId].cleanupTimer) {
                clearTimeout(this.rooms[roomId].cleanupTimer);
                delete this.rooms[roomId].cleanupTimer;
            }
        }
        logger.info('All cleanup timers cancelled');
    }

    /** 룸의 현재 사용자 수 조회 */
    getRoomUserCount(roomId: string): number {
        return this.rooms[roomId]?.userCount || 0;
    }

    /** 전체 룸 개수 조회 */
    getTotalRooms(): number {
        return Object.keys(this.rooms).length;
    }

    /** 전체 사용자 수 조회 */
    getTotalUsers(): number {
        return Object.values(this.rooms).reduce((sum, room) => sum + room.userCount, 0);
    }

    /** 특정 룸 데이터 조회 */
    getRoomData(roomId: string): RoomData | undefined {
        return this.rooms[roomId];
    }

    /** 전체 룸 데이터 조회 (디버깅/모니터링용) */
    getAllRooms(): Rooms {
        return { ...this.rooms };
    }
}
