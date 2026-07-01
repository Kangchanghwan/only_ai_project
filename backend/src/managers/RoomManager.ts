import { Rooms, RoomData } from '../types';
import { DeviceInfo } from '../utils/deviceInfo';
import { StorageService } from '../services/StorageService';
import logger from '../utils/logger';

/** 고정 룸 ID */
export const SHARED_ROOM_ID = 'room-shared';

/** 기본 grace period: 10분 (ms) */
const DEFAULT_GRACE_PERIOD_MS = 10 * 60 * 1000;

/**
 * 룸 관리 클래스
 * - 단일 공유 룸 관리
 * - 사용자 입장/퇴장 및 기기 정보 추적 (socketId → DeviceInfo)
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
                users: new Map(),
                createdAt: new Date()
            };
        }
    }

    /** 룸에 사용자 추가 (룸이 없으면 자동 생성, 삭제 타이머 취소) */
    addUserToRoom(roomId: string, socketId: string, deviceInfo: DeviceInfo): number {
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }

        // 예약된 삭제 타이머가 있으면 취소 (재입장 시 삭제 중단)
        if (this.rooms[roomId].cleanupTimer) {
            clearTimeout(this.rooms[roomId].cleanupTimer);
            delete this.rooms[roomId].cleanupTimer;
            logger.info(`Cancelled cleanup timer for room ${roomId} (user rejoined)`);
        }

        this.rooms[roomId].users.set(socketId, deviceInfo);
        return this.rooms[roomId].users.size;
    }

    /** 룸에서 사용자 제거 (빈 룸은 grace period 후 자동 삭제) */
    async removeUserFromRoom(roomId: string, socketId: string): Promise<number> {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].users.delete(socketId);

        // 빈 룸: grace period 후 삭제 스케줄링
        if (this.rooms[roomId].users.size <= 0) {
            logger.info(`Room ${roomId} is empty. Scheduling cleanup in ${this.gracePeriodMs / 1000}s`);

            this.rooms[roomId].cleanupTimer = setTimeout(() => {
                this._cleanupRoom(roomId);
            }, this.gracePeriodMs);

            return 0;
        }

        return this.rooms[roomId].users.size;
    }

    /** 실제 룸 삭제 로직 (타이머 만료 후 실행) */
    private async _cleanupRoom(roomId: string): Promise<void> {
        // 타이머 만료 시점에 사용자가 재입장했으면 삭제하지 않음
        if (this.rooms[roomId] && this.rooms[roomId].users.size > 0) {
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
        return this.rooms[roomId]?.users.size || 0;
    }

    /** 룸에 입장한 기기 정보 목록 조회 (입장 순서) */
    getRoomUsers(roomId: string): DeviceInfo[] {
        return this.rooms[roomId] ? Array.from(this.rooms[roomId].users.values()) : [];
    }

    /** 전체 룸 개수 조회 */
    getTotalRooms(): number {
        return Object.keys(this.rooms).length;
    }

    /** 전체 사용자 수 조회 */
    getTotalUsers(): number {
        return Object.values(this.rooms).reduce((sum, room) => sum + room.users.size, 0);
    }

    /** 실제 접속자 수 (모든 소켓이 공유 룸에 1회 입장하므로 공유 룸 인원 = 접속자 수) */
    getConnectedUserCount(): number {
        return this.getRoomUserCount(SHARED_ROOM_ID);
    }

    /** 특정 룸 데이터 조회 (스냅샷 복사본 — users Map은 내부 상태와 분리된 복사본이며, 반환값을 변경해도 실제 룸 상태에는 영향이 없음) */
    getRoomData(roomId: string): RoomData | undefined {
        const room = this.rooms[roomId];
        if (!room) {
            return undefined;
        }
        return { ...room, users: new Map(room.users) };
    }

    /** 전체 룸 데이터 조회 (디버깅/모니터링용 스냅샷 복사본 — 각 룸의 users Map도 복사되어 내부 상태와 분리됨) */
    getAllRooms(): Rooms {
        const copy: Rooms = {};
        for (const [roomId, room] of Object.entries(this.rooms)) {
            copy[roomId] = { ...room, users: new Map(room.users) };
        }
        return copy;
    }
}
