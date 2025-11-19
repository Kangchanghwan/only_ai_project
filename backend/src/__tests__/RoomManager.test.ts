import { RoomManager } from '../managers/RoomManager';
import { StorageService } from '../services/StorageService';

describe('RoomManager - Storage Integration', () => {
    let roomManager: RoomManager;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
        // StorageService 모킹
        mockStorageService = {
            deleteRoomFiles: jest.fn()
        } as any;

        roomManager = new RoomManager(mockStorageService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('removeUserFromRoom - Storage Integration', () => {
        it('마지막 사용자가 나갈 때 스토리지 파일을 삭제해야 함', async () => {
            const roomId = 'room-123456';
            const roomNr = 123456;

            // 방에 사용자 추가
            roomManager.addUserToRoom(roomId);

            // deleteRoomFiles가 성공하도록 모킹
            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            // 사용자 제거 (마지막 사용자)
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            // deleteRoomFiles가 올바른 룸 번호로 호출되었는지 확인
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomNr);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledTimes(1);

            // 남은 사용자가 0명이어야 함
            expect(remainingUsers).toBe(0);

            // 방이 삭제되었는지 확인
            expect(roomManager.getRoomUserCount(roomId)).toBe(0);
        });

        it('사용자가 남아있을 때는 스토리지를 삭제하지 않아야 함', async () => {
            const roomId = 'room-123456';

            // 방에 여러 사용자 추가
            roomManager.addUserToRoom(roomId);
            roomManager.addUserToRoom(roomId);

            // 사용자 한 명 제거 (아직 1명 남음)
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            // deleteRoomFiles가 호출되지 않아야 함
            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();

            // 남은 사용자가 1명이어야 함
            expect(remainingUsers).toBe(1);
        });

        it('스토리지 삭제가 실패해도 방은 삭제되어야 함', async () => {
            const roomId = 'room-123456';

            // 방에 사용자 추가
            roomManager.addUserToRoom(roomId);

            // deleteRoomFiles가 실패하도록 모킹
            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: false,
                deletedCount: 0,
                error: 'Storage error'
            });

            // 사용자 제거
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            // deleteRoomFiles가 호출되었는지 확인
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(123456);

            // 남은 사용자가 0명이어야 함
            expect(remainingUsers).toBe(0);

            // 방이 삭제되었는지 확인 (스토리지 실패와 관계없이)
            expect(roomManager.getRoomUserCount(roomId)).toBe(0);
        });

        it('존재하지 않는 방의 사용자를 제거하려고 하면 0을 반환해야 함', async () => {
            const roomId = 'room-999999';

            // 사용자 제거 시도
            const remainingUsers = await roomManager.removeUserFromRoom(roomId);

            // deleteRoomFiles가 호출되지 않아야 함
            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();

            // 0을 반환해야 함
            expect(remainingUsers).toBe(0);
        });

        it('여러 방의 마지막 사용자가 각각 나갈 때 각 방의 파일을 삭제해야 함', async () => {
            const room1 = 'room-111111';
            const room2 = 'room-222222';

            // 각 방에 사용자 추가
            roomManager.addUserToRoom(room1);
            roomManager.addUserToRoom(room2);

            // deleteRoomFiles가 성공하도록 모킹
            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 3
            });

            // 첫 번째 방의 사용자 제거
            await roomManager.removeUserFromRoom(room1);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(111111);

            // 두 번째 방의 사용자 제거
            await roomManager.removeUserFromRoom(room2);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(222222);

            // 총 2번 호출되어야 함
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledTimes(2);
        });
    });
});
