import { StorageService } from '../services/StorageService';
import { getR2Service } from '../services/r2Service';

// r2Service 모킹
jest.mock('../services/r2Service', () => ({
    getR2Service: jest.fn()
}));

// logger 모킹
jest.mock('../utils/logger', () => ({
    __esModule: true,
    default: {
        log: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    },
    logger: {
        log: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

describe('StorageService', () => {
    let storageService: StorageService;
    let mockDeleteAllFiles: jest.Mock;
    let mockR2Service: any;

    beforeEach(() => {
        // 모킹 함수 초기화
        mockDeleteAllFiles = jest.fn();

        // r2Service 모킹
        mockR2Service = {
            deleteAllFiles: mockDeleteAllFiles
        };

        (getR2Service as jest.Mock).mockReturnValue(mockR2Service);

        storageService = new StorageService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('deleteRoomFiles', () => {
        it('방 폴더의 모든 파일을 삭제해야 함', async () => {
            const roomNr = 123456;

            // deleteAllFiles가 삭제된 파일 수를 반환하도록 모킹
            mockDeleteAllFiles.mockResolvedValue(3);

            const result = await storageService.deleteRoomFiles(roomNr);

            // deleteAllFiles가 올바른 룸 ID로 호출되었는지 확인
            expect(mockDeleteAllFiles).toHaveBeenCalledWith('123456');

            // 결과가 성공인지 확인
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3);
        });

        it('빈 폴더인 경우 0을 반환해야 함', async () => {
            const roomNr = 123456;

            // 빈 폴더
            mockDeleteAllFiles.mockResolvedValue(0);

            const result = await storageService.deleteRoomFiles(roomNr);

            // deleteAllFiles가 호출되어야 함
            expect(mockDeleteAllFiles).toHaveBeenCalledWith('123456');

            // 결과
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
        });

        it('R2 서비스 에러 발생 시 에러를 처리해야 함', async () => {
            const roomNr = 123456;

            // deleteAllFiles가 에러를 던지도록 모킹
            mockDeleteAllFiles.mockRejectedValue(new Error('R2 error'));

            const result = await storageService.deleteRoomFiles(roomNr);

            expect(result.success).toBe(false);
            expect(result.error).toBe('R2 error');
            expect(result.deletedCount).toBe(0);
        });

        it('알 수 없는 에러 발생 시 Unknown error를 반환해야 함', async () => {
            const roomNr = 123456;

            // deleteAllFiles가 문자열 에러를 던지도록 모킹
            mockDeleteAllFiles.mockRejectedValue('Unknown error type');

            const result = await storageService.deleteRoomFiles(roomNr);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error');
            expect(result.deletedCount).toBe(0);
        });

        it('여러 방의 파일을 순차적으로 삭제해야 함', async () => {
            const room1 = 111111;
            const room2 = 222222;

            // 각 방에 대해 삭제 성공
            mockDeleteAllFiles.mockResolvedValue(5);

            const result1 = await storageService.deleteRoomFiles(room1);
            const result2 = await storageService.deleteRoomFiles(room2);

            // 각각 올바른 룸 ID로 호출되었는지 확인
            expect(mockDeleteAllFiles).toHaveBeenNthCalledWith(1, '111111');
            expect(mockDeleteAllFiles).toHaveBeenNthCalledWith(2, '222222');

            // 총 2번 호출되어야 함
            expect(mockDeleteAllFiles).toHaveBeenCalledTimes(2);

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
        });

        it('많은 수의 파일을 삭제해야 함', async () => {
            const roomNr = 123456;

            // 1500개 파일 삭제
            mockDeleteAllFiles.mockResolvedValue(1500);

            const result = await storageService.deleteRoomFiles(roomNr);

            expect(mockDeleteAllFiles).toHaveBeenCalledWith('123456');
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1500);
        });
    });
});
