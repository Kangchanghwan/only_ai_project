import { Rooms, RoomData, DeviceInfo } from '../types';
import { StorageService } from '../services/StorageService';
import logger from '../utils/logger';

/**
 * 룸 관리 클래스
 * - 룸 생성/삭제
 * - 사용자 입장/퇴장 추적
 * - 룸 번호 생성
 * - 빈 룸 삭제 지연 (Grace Period)
 * - 통계 조회
 */
export class RoomManager {
    private rooms: Rooms = {};
    private readonly MIN_ROOM_NR = 100000;  // 최소 룸 번호
    private readonly MAX_ROOM_NR = 999999;  // 최대 룸 번호
    private readonly MAX_RETRIES = 10;      // 룸 번호 생성 최대 재시도 횟수
    private storageService: StorageService;
    private readonly gracePeriodMs: number;
    private pendingDeletion: Map<string, NodeJS.Timeout> = new Map();

    constructor(storageService?: StorageService, gracePeriodMs: number = 0) {
        this.storageService = storageService || new StorageService();
        this.gracePeriodMs = gracePeriodMs;
        if (this.gracePeriodMs > 0) {
            logger.info(`룸 삭제 지연 설정: ${this.gracePeriodMs / 1000}초`);
        }
    }

    /** 중복되지 않는 6자리 룸 번호 생성 */
    generateRoomNumber(): number {
        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            const number = Math.floor(
                Math.random() * (this.MAX_ROOM_NR - this.MIN_ROOM_NR) + this.MIN_ROOM_NR
            );

            if (!this.rooms[this.getRoomId(number)]) {
                return number;
            }
        }

        throw new Error('룸 번호 생성 실패: 최대 재시도 횟수 초과');
    }

    /** 룸 번호를 내부 ID로 변환 (123456 → "room-123456") */
    getRoomId(roomNr: number): string {
        return `room-${roomNr}`;
    }

    /** 룸이 존재하는지 확인 (Grace Period 중인 빈 룸도 포함) */
    roomExists(roomNr: number): boolean {
        const roomId = this.getRoomId(roomNr);
        return !!this.rooms[roomId];
    }

    /** 새 룸 생성 */
    createRoom(roomId: string): void {
        if (!this.rooms[roomId]) {
            this.rooms[roomId] = {
                userCount: 0,
                createdAt: new Date(),
                devices: new Map()
            };
        }
    }

    /** 룸에 사용자 추가 (룸이 없으면 자동 생성, 삭제 대기 중이면 취소) */
    addUserToRoom(roomId: string): number {
        // 삭제 대기 중인 룸이면 타이머 취소
        if (this.pendingDeletion.has(roomId)) {
            clearTimeout(this.pendingDeletion.get(roomId));
            this.pendingDeletion.delete(roomId);
            logger.info(`룸 삭제 취소 (재입장): ${roomId}`);
        }
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }
        this.rooms[roomId].userCount++;
        return this.rooms[roomId].userCount;
    }

    /** 룸에서 사용자 제거 (빈 룸은 Grace Period 후 삭제) */
    async removeUserFromRoom(roomId: string): Promise<number> {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].userCount--;

        // 빈 룸 정리
        if (this.rooms[roomId].userCount <= 0) {
            this.rooms[roomId].userCount = 0;

            if (this.gracePeriodMs > 0) {
                // Grace Period: 일정 시간 후 삭제 (그 사이 재입장하면 취소됨)
                logger.info(`룸 삭제 예약 (${this.gracePeriodMs / 1000}초 후): ${roomId}`);
                const timer = setTimeout(async () => {
                    await this.deleteRoom(roomId);
                    this.pendingDeletion.delete(roomId);
                }, this.gracePeriodMs);
                this.pendingDeletion.set(roomId, timer);
            } else {
                // Grace Period 없음: 즉시 삭제
                await this.deleteRoom(roomId);
            }
            return 0;
        }

        return this.rooms[roomId].userCount;
    }

    /** 룸과 관련 파일을 삭제 */
    private async deleteRoom(roomId: string): Promise<void> {
        // 삭제 시점에 사용자가 다시 들어왔으면 삭제하지 않음
        if (this.rooms[roomId] && this.rooms[roomId].userCount > 0) {
            logger.info(`룸 삭제 건너뜀 (사용자 존재): ${roomId}`);
            return;
        }

        const roomNr = parseInt(roomId.replace('room-', ''));

        if (!isNaN(roomNr)) {
            const result = await this.storageService.deleteRoomFiles(roomNr);
            if (result.success) {
                logger.info(`Deleted ${result.deletedCount} files for room ${roomNr}`);
            } else {
                logger.error(`Failed to delete files for room ${roomNr}: ${result.error}`);
            }
        }

        delete this.rooms[roomId];
        logger.info(`룸 삭제 완료: ${roomId}`);
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

    /** 룸에 디바이스 추가 */
    addDeviceToRoom(roomId: string, device: DeviceInfo): void {
        if (this.rooms[roomId]) {
            this.rooms[roomId].devices.set(device.socketId, device);
        }
    }

    /** 룸에서 디바이스 제거 */
    removeDeviceFromRoom(roomId: string, socketId: string): void {
        if (this.rooms[roomId]) {
            this.rooms[roomId].devices.delete(socketId);
        }
    }

    /** 룸의 디바이스 목록 반환 */
    getRoomDevices(roomId: string): DeviceInfo[] {
        if (!this.rooms[roomId]) return [];
        return Array.from(this.rooms[roomId].devices.values());
    }

    /** 대기 중인 삭제 타이머 모두 취소 (서버 종료 시 사용) */
    clearPendingDeletions(): void {
        for (const [roomId, timer] of this.pendingDeletion) {
            clearTimeout(timer);
            logger.info(`룸 삭제 타이머 취소 (서버 종료): ${roomId}`);
        }
        this.pendingDeletion.clear();
    }
}
