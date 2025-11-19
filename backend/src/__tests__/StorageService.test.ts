import { StorageService } from '../services/StorageService';
import { supabase } from '../config/supabase';

// Supabase 클라이언트 모킹
jest.mock('../config/supabase', () => ({
    supabase: {
        storage: {
            from: jest.fn()
        }
    },
    BUCKET_NAME: 'test-bucket'
}));

describe('StorageService', () => {
    let storageService: StorageService;
    let mockRemove: jest.Mock;
    let mockList: jest.Mock;

    beforeEach(() => {
        // 모킹 함수 초기화
        mockRemove = jest.fn();
        mockList = jest.fn();

        // Supabase storage.from() 모킹
        (supabase!.storage.from as jest.Mock).mockReturnValue({
            remove: mockRemove,
            list: mockList
        });

        storageService = new StorageService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('deleteRoomFiles', () => {
        it('방 폴더의 모든 파일을 삭제해야 함', async () => {
            const roomNr = 123456;
            const mockFiles = [
                { name: 'image1.jpg' },
                { name: 'image2.png' },
                { name: 'image3.gif' }
            ];

            // list 메서드가 파일 목록을 반환하도록 모킹
            mockList.mockResolvedValue({
                data: mockFiles,
                error: null
            });

            // remove 메서드가 성공하도록 모킹
            mockRemove.mockResolvedValue({
                data: mockFiles,
                error: null
            });

            const result = await storageService.deleteRoomFiles(roomNr);

            // list가 올바른 폴더 경로로 호출되었는지 확인
            expect(mockList).toHaveBeenCalledWith(`${roomNr}`);

            // remove가 올바른 파일 경로들로 호출되었는지 확인
            expect(mockRemove).toHaveBeenCalledWith([
                `${roomNr}/image1.jpg`,
                `${roomNr}/image2.png`,
                `${roomNr}/image3.gif`
            ]);

            // 결과가 성공인지 확인
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3);
        });

        it('빈 폴더인 경우 파일 삭제를 건너뛰어야 함', async () => {
            const roomNr = 123456;

            // 빈 폴더
            mockList.mockResolvedValue({
                data: [],
                error: null
            });

            const result = await storageService.deleteRoomFiles(roomNr);

            // list는 호출되어야 함
            expect(mockList).toHaveBeenCalledWith(`${roomNr}`);

            // remove는 호출되지 않아야 함
            expect(mockRemove).not.toHaveBeenCalled();

            // 결과
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
        });

        it('Supabase가 설정되지 않은 경우 에러를 반환해야 함', async () => {
            const roomNr = 123456;

            // Supabase가 null인 경우를 테스트하기 위해 새로운 인스턴스 생성
            const mockSupabaseConfig = require('../config/supabase');
            mockSupabaseConfig.supabase = null;

            const serviceWithoutSupabase = new StorageService();
            const result = await serviceWithoutSupabase.deleteRoomFiles(roomNr);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Supabase not configured');
            expect(result.deletedCount).toBe(0);

            // 원래대로 복구
            mockSupabaseConfig.supabase = {
                storage: {
                    from: jest.fn().mockReturnValue({
                        remove: mockRemove,
                        list: mockList
                    })
                }
            };
        });

        it('파일 목록 조회 실패 시 에러를 처리해야 함', async () => {
            const roomNr = 123456;

            mockList.mockResolvedValue({
                data: null,
                error: { message: 'List failed' }
            });

            const result = await storageService.deleteRoomFiles(roomNr);

            expect(result.success).toBe(false);
            expect(result.error).toBe('List failed');
            expect(result.deletedCount).toBe(0);
            expect(mockRemove).not.toHaveBeenCalled();
        });

        it('파일 삭제 실패 시 에러를 처리해야 함', async () => {
            const roomNr = 123456;
            const mockFiles = [{ name: 'image1.jpg' }];

            mockList.mockResolvedValue({
                data: mockFiles,
                error: null
            });

            mockRemove.mockResolvedValue({
                data: null,
                error: { message: 'Delete failed' }
            });

            const result = await storageService.deleteRoomFiles(roomNr);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Delete failed');
            expect(result.deletedCount).toBe(0);
        });

        it('1000개 이상의 파일이 있는 경우 여러 번 삭제해야 함', async () => {
            const roomNr = 123456;

            // 1500개의 파일 생성
            const mockFiles = Array.from({ length: 1500 }, (_, i) => ({
                name: `image${i}.jpg`
            }));

            mockList.mockResolvedValue({
                data: mockFiles,
                error: null
            });

            mockRemove.mockResolvedValue({
                data: [],
                error: null
            });

            const result = await storageService.deleteRoomFiles(roomNr);

            // remove가 2번 호출되어야 함 (1000개 + 500개)
            expect(mockRemove).toHaveBeenCalledTimes(2);

            // 첫 번째 호출은 1000개
            expect(mockRemove).toHaveBeenNthCalledWith(
                1,
                expect.arrayContaining([`${roomNr}/image0.jpg`])
            );
            expect(mockRemove.mock.calls[0][0]).toHaveLength(1000);

            // 두 번째 호출은 500개
            expect(mockRemove).toHaveBeenNthCalledWith(
                2,
                expect.arrayContaining([`${roomNr}/image1000.jpg`])
            );
            expect(mockRemove.mock.calls[1][0]).toHaveLength(500);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1500);
        });
    });
});
