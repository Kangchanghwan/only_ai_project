import { Rooms, RoomData } from '../types';
import { StorageService } from '../services/StorageService';
import logger from '../utils/logger';

/**
 * 룸 관리 클래스
 * - 룸 생성/삭제
 * - 사용자 입장/퇴장 추적
 * - 룸 번호 생성
 * - 통계 조회
 */
export class RoomManager {
    private rooms: Rooms = {};
    private readonly MIN_ROOM_NR = 100000;  // 최소 룸 번호
    private readonly MAX_ROOM_NR = 999999;  // 최대 룸 번호
    private readonly MAX_RETRIES = 10;      // 룸 번호 생성 최대 재시도 횟수
    private storageService: StorageService;

    constructor(storageService?: StorageService) {
        this.storageService = storageService || new StorageService();
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

    /** 룸이 존재하고 사용자가 있는지 확인 */
    roomExists(roomNr: number): boolean {
        const roomId = this.getRoomId(roomNr);
        return !!this.rooms[roomId] && this.rooms[roomId].userCount > 0;
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

    /** 룸에 사용자 추가 (룸이 없으면 자동 생성) */
    addUserToRoom(roomId: string): number {
        if (!this.rooms[roomId]) {
            this.createRoom(roomId);
        }
        this.rooms[roomId].userCount++;
        return this.rooms[roomId].userCount;
    }

    /** 룸에서 사용자 제거 (빈 룸은 자동 삭제) */
    async removeUserFromRoom(roomId: string): Promise<number> {
        if (!this.rooms[roomId]) {
            return 0;
        }

        this.rooms[roomId].userCount--;

        // 빈 룸 정리 (메모리 누수 방지 + Supabase Storage 파일 삭제)
        if (this.rooms[roomId].userCount <= 0) {
            // 룸 번호 추출 (room-123456 → 123456)
            const roomNr = parseInt(roomId.replace('room-', ''));

            // Supabase Storage에서 해당 방의 파일 삭제
            if (!isNaN(roomNr)) {
                const result = await this.storageService.deleteRoomFiles(roomNr);
                if (result.success) {
                    logger.info(`Deleted ${result.deletedCount} files for room ${roomNr}`);
                } else {
                    logger.error(`Failed to delete files for room ${roomNr}: ${result.error}`);
                }
            }

            delete this.rooms[roomId];
            return 0;
        }

        return this.rooms[roomId].userCount;
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
