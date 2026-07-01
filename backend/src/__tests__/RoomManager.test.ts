import { RoomManager, SHARED_ROOM_ID } from '../managers/RoomManager';
import { StorageService } from '../services/StorageService';
import { DeviceInfo } from '../utils/deviceInfo';

const device = (socketId: string): DeviceInfo => ({
    socketId,
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'Windows'
});

describe('RoomManager - Storage Integration', () => {
    let roomManager: RoomManager;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
        jest.useFakeTimers();

        mockStorageService = {
            deleteRoomFiles: jest.fn()
        } as any;

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

    describe('getConnectedUserCount', () => {
        it('IP 룸 인원과 무관하게 공유 룸 인원만 실제 접속자 수로 반환해야 함', () => {
            roomManager.addUserToRoom(SHARED_ROOM_ID, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(SHARED_ROOM_ID, 'sock-2', device('sock-2'));
            roomManager.addUserToRoom('room-ipA', 'sock-1', device('sock-1'));
            roomManager.addUserToRoom('room-ipB', 'sock-2', device('sock-2'));

            expect(roomManager.getTotalUsers()).toBe(4);
            expect(roomManager.getConnectedUserCount()).toBe(2);
        });
    });

    describe('getRoomUsers', () => {
        it('룸에 입장한 기기 정보 목록을 반환해야 함', () => {
            const roomId = 'room-ipA';
            const d1 = device('sock-1');
            const d2: DeviceInfo = { socketId: 'sock-2', deviceType: 'mobile', browser: 'Safari', os: 'iOS' };

            roomManager.addUserToRoom(roomId, 'sock-1', d1);
            roomManager.addUserToRoom(roomId, 'sock-2', d2);

            expect(roomManager.getRoomUsers(roomId)).toEqual([d1, d2]);
        });

        it('사용자가 나가면 목록에서 제거되어야 함', async () => {
            const roomId = 'room-ipA';
            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(roomId, 'sock-2', device('sock-2'));

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(roomManager.getRoomUsers(roomId)).toEqual([device('sock-2')]);
        });

        it('존재하지 않는 룸은 빈 배열을 반환해야 함', () => {
            expect(roomManager.getRoomUsers('room-nonexistent')).toEqual([]);
        });
    });

    describe('removeUserFromRoom - Delayed Cleanup', () => {
        it('마지막 사용자가 나가면 grace period 후 스토리지 파일을 삭제해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');
            expect(remainingUsers).toBe(0);

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(roomManager.getRoomData(roomId)).toBeDefined();

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledTimes(1);

            expect(roomManager.getRoomUserCount(roomId)).toBe(0);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('사용자가 남아있을 때는 삭제를 스케줄링하지 않아야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));
            roomManager.addUserToRoom(roomId, 'sock-2', device('sock-2'));

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(1);

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });

        it('스토리지 삭제가 실패해도 방은 삭제되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: false,
                deletedCount: 0,
                error: 'Storage error'
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).toHaveBeenCalledWith(roomId);
            expect(roomManager.getRoomData(roomId)).toBeUndefined();
        });

        it('존재하지 않는 방의 사용자를 제거하려고 하면 0을 반환해야 함', async () => {
            const roomId = 'room-nonexistent';

            const remainingUsers = await roomManager.removeUserFromRoom(roomId, 'sock-1');

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(remainingUsers).toBe(0);
        });

        it('재입장 시 삭제 타이머가 취소되어야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 5
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            jest.advanceTimersByTime(3000);
            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            jest.advanceTimersByTime(3000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
            expect(roomManager.getRoomUserCount(roomId)).toBe(1);
        });
    });

    describe('cancelAllTimers', () => {
        it('모든 방의 삭제 타이머를 취소해야 함', async () => {
            const roomId = SHARED_ROOM_ID;

            roomManager.addUserToRoom(roomId, 'sock-1', device('sock-1'));

            mockStorageService.deleteRoomFiles.mockResolvedValue({
                success: true,
                deletedCount: 0
            });

            await roomManager.removeUserFromRoom(roomId, 'sock-1');

            roomManager.cancelAllTimers();

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            expect(mockStorageService.deleteRoomFiles).not.toHaveBeenCalled();
        });
    });
});
