import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { StorageService } from '../services/StorageService';

describe('RoomManager - Storage Integration', () => {
    let roomManager: RoomManager;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
        jest.useFakeTimers();

        // StorageService 모킹
        mockStorageService = {
            deleteRoomFiles: jest.fn()
        } as any;

        // grace period를 5초로 설정 (테스트용)
        roomManager = new RoomManager(mockStorageService, 5000);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('getSharedRoomId', () => {
        it('고정 룸 ID를 반환해야 함', () => {
            expect(roomManager.getSharedRoomId()).toBe('room-shared');
            expect(SHARED_ROOM_ID).toBe('room-shared');
        });
    });

    describe('removeUserFromRoom - Delayed Cleanup', () => {
        it('마지막 사용자가 나가면 grace period 후 스토리지 파일을 삭제해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId);

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            // 사용자 제거 (마지막 사용자)
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);
            expect(remainingUsers).toBe(0);

            // 아직 삭제되지 않아야 함
            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            // 방이 아직 메모리에 있어야 함 (타이머 대기 중)
            expect(roomManager.getRoomData(roomId)).toBeDefined();

            // grace period 경과
            jest.advanceTimersByTime(5000);
            // 비동기 작업 완료 대기
            await Promise.resolve();

            // 이제 삭제되어야 함
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledTimes(1);

            // 방이 삭제되었는지 확인
            expect(roomManager.getRoomUserCount(roomId)).toBe(0);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('사용자가 남아있을 때는 삭제를 스케줄링하지 않아야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId);
            roomManager.addUserToRoom(roomId);

            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(1);

            // grace period 경과해도 삭제되지 않아야 함
            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });

        it('스토리지 삭제가 실패해도 방은 삭제되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId);

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: false,
                deletedCount: 0,
                error: 'Storage error'
            });

            await roomManager.removeUserFromRoom(roomId);

            // grace period 경과
            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('존재하지 않는 방의 사용자를 제거하려고 하면 0을 반환해야 함', async () => {
            const roomId = 'room-nonexistent';

            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(0);
        });

        it('재입장 시 삭제 타이머가 취소되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId);

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            // 마지막 사용자 퇴장 → 삭제 타이머 시작
            await roomManager.removeUserFromRoom(roomId);

            // 3초 후 재입장 (grace period 5초 미만)
            jest.advanceTimersByTime(3000);
            roomManager.addUserToRoom(roomId);

            // grace period 나머지 시간 경과
            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            // 삭제되지 않아야 함 (타이머가 취소되었으므로)
            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(roomManager.getRoomUserCount(roomId)).toBe(1);
        });
    });

    describe('cancelAllTimers', () => {
        it('모든 방의 삭제 타이머를 취소해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId);

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 0
            });

            await roomManager.removeUserFromRoom(roomId);

            // cancelAllTimers 호출
            roomManager.cancelAllTimers();

            // grace period 경과
            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            // 타이머가 취소되었으므로 삭제되지 않아야 함
            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });
    });
});
